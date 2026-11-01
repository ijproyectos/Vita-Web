import { describe, expect, it } from "vitest";
import {
  ENLACE_POR_DEFECTO,
  LOTES_MAX_POR_TICK,
  VENTANA_ENVIO_MS,
  esperaEnvioSeg,
  porcentajeEnvio,
  puedeReclamarOtroLote,
  sumarLotes,
  textoEspera,
  validarEnlaceInterno,
  validarEnvioMasivo,
} from "./envios-masivos-logica";

describe("validarEnlaceInterno", () => {
  it("vacío usa el centro de avisos", () => {
    expect(validarEnlaceInterno("")).toEqual({ ok: true, enlace: ENLACE_POR_DEFECTO });
    expect(validarEnlaceInterno("   ")).toEqual({ ok: true, enlace: ENLACE_POR_DEFECTO });
    expect(validarEnlaceInterno(undefined)).toEqual({ ok: true, enlace: ENLACE_POR_DEFECTO });
  });
  it("acepta rutas internas de /app", () => {
    for (const ok of ["/app", "/app/", "/app/avisos", "/app/rutina?dia=hoy", "/app#x", " /app/perfil "]) {
      expect(validarEnlaceInterno(ok).ok).toBe(true);
    }
  });
  it("rechaza protocolos, hosts y trucos", () => {
    for (const malo of [
      "https://evil.com",
      "http://x",
      "//evil.com",
      "/app//evil.com",
      "/application",
      "/apple",
      "/cuidar",
      "app/avisos",
      "javascript:alert(1)",
      "/app/../admin",
      "/app\\x",
      "/app/ x",
      "/app/\u0000",
      "/app?u=https://evil.com",
    ]) {
      expect(validarEnlaceInterno(malo).ok, malo).toBe(false);
    }
    expect(validarEnlaceInterno("/app/" + "a".repeat(300)).ok).toBe(false);
  });
});

describe("validarEnvioMasivo", () => {
  const base = { titulo: "Novedad", cuerpo: "Ya podés ver tu resumen.", enlace: "" };
  it("normaliza y completa el enlace", () => {
    expect(validarEnvioMasivo({ ...base, titulo: "  Novedad " })).toEqual({
      ok: true,
      envio: { titulo: "Novedad", cuerpo: "Ya podés ver tu resumen.", enlace: ENLACE_POR_DEFECTO },
    });
  });
  it("exige título y mensaje y respeta los máximos", () => {
    expect(validarEnvioMasivo({ ...base, titulo: " " }).ok).toBe(false);
    expect(validarEnvioMasivo({ ...base, cuerpo: "" }).ok).toBe(false);
    expect(validarEnvioMasivo({ ...base, titulo: "a".repeat(60) }).ok).toBe(true);
    expect(validarEnvioMasivo({ ...base, titulo: "a".repeat(61) }).ok).toBe(false);
    expect(validarEnvioMasivo({ ...base, cuerpo: "a".repeat(180) }).ok).toBe(true);
    expect(validarEnvioMasivo({ ...base, cuerpo: "a".repeat(181) }).ok).toBe(false);
    expect(validarEnvioMasivo({ titulo: 1, cuerpo: null, enlace: "" }).ok).toBe(false);
  });
  it("propaga el error de un enlace inválido", () => {
    expect(validarEnvioMasivo({ ...base, enlace: "https://x.com" }).ok).toBe(false);
  });
});

describe("ventana de un envío cada 10 minutos", () => {
  const t = 1_000_000_000;
  it("sin envío previo se puede", () => expect(esperaEnvioSeg(null, t)).toBe(0));
  it("recién enviado hay que esperar la ventana completa", () => expect(esperaEnvioSeg(t, t)).toBe(VENTANA_ENVIO_MS / 1000));
  it("a mitad de ventana falta la mitad", () => expect(esperaEnvioSeg(t, t + VENTANA_ENVIO_MS / 2)).toBe(300));
  it("pasada la ventana se puede", () => {
    expect(esperaEnvioSeg(t, t + VENTANA_ENVIO_MS)).toBe(0);
    expect(esperaEnvioSeg(t, t + VENTANA_ENVIO_MS + 1)).toBe(0);
  });
  it("redondea hacia arriba", () => expect(esperaEnvioSeg(t, t + VENTANA_ENVIO_MS - 1)).toBe(1));
  it("texto de espera", () => {
    expect(textoEspera(30)).toBe("menos de un minuto");
    expect(textoEspera(61)).toBe("2 minutos");
  });
});

describe("porcentajeEnvio", () => {
  it("proporcional y acotado", () => {
    expect(porcentajeEnvio({ estado: "enviando", totalUsuarios: 200, usuariosProcesados: 50 })).toBe(25);
    expect(porcentajeEnvio({ estado: "enviando", totalUsuarios: 0, usuariosProcesados: 5 })).toBe(0);
    expect(porcentajeEnvio({ estado: "enviando", totalUsuarios: 10, usuariosProcesados: 99 })).toBe(100);
  });
  it("terminado es 100 aunque los usuarios hayan cambiado", () => {
    expect(porcentajeEnvio({ estado: "terminado", totalUsuarios: 100, usuariosProcesados: 80 })).toBe(100);
  });
});

describe("lotes del cron", () => {
  it("arranca otro lote solo con presupuesto de sobra", () => {
    expect(puedeReclamarOtroLote(0, 0)).toBe(true);
    expect(puedeReclamarOtroLote(5_000, 2)).toBe(true);
    expect(puedeReclamarOtroLote(5_001, 2)).toBe(false);
    expect(puedeReclamarOtroLote(9_500, 0)).toBe(false);
  });
  it("tope de lotes por tick", () => {
    expect(puedeReclamarOtroLote(0, LOTES_MAX_POR_TICK)).toBe(false);
    expect(puedeReclamarOtroLote(0, LOTES_MAX_POR_TICK - 1)).toBe(true);
  });
  it("suma los resultados", () => {
    expect(
      sumarLotes([
        { usuarios: 20, enviados: 30, fallidos: 1 },
        { usuarios: 5, enviados: 6, fallidos: 0 },
      ]),
    ).toEqual({ usuarios: 25, enviados: 36, fallidos: 1 });
    expect(sumarLotes([])).toEqual({ usuarios: 0, enviados: 0, fallidos: 0 });
  });
});
