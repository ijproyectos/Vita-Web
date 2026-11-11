import { describe, expect, it } from "vitest";
import { clasificarDispositivo, esquemaEnvioVitals, filasDeEnvio, normalizarRuta } from "./logica";

const UUID = "3f2b8c1e-9a4d-4e6b-8c1f-0a1b2c3d4e5f";

describe("normalizarRuta", () => {
  it("deja las rutas estaticas como estan", () => {
    expect(normalizarRuta("/app")).toBe("/app");
    expect(normalizarRuta("/app/rutina")).toBe("/app/rutina");
    expect(normalizarRuta("/")).toBe("/");
  });
  it("saca query y hash", () => {
    expect(normalizarRuta("/app/mi-salud?f=estudios#x")).toBe("/app/mi-salud");
  });
  it("reemplaza los segmentos dinamicos conocidos", () => {
    expect(normalizarRuta(`/app/familia/${UUID}`)).toBe("/app/familia/[id]");
    expect(normalizarRuta(`/app/familia/${UUID}/modo-simple`)).toBe("/app/familia/[id]/modo-simple");
    expect(normalizarRuta(`/app/familia/${UUID}/cuidadores/${UUID}`)).toBe("/app/familia/[id]/cuidadores/[id]");
    expect(normalizarRuta(`/cuidar/${UUID}`)).toBe("/cuidar/[elderId]");
    expect(normalizarRuta(`/cuidar/${UUID}/agregar-medicamento`)).toBe("/cuidar/[elderId]/agregar-medicamento");
    expect(normalizarRuta("/p/AbCdEfGhIjKlMnOpQrSt1234567890xyz")).toBe("/p/[token]");
    expect(normalizarRuta(`/app/mi-salud/estudios/${UUID}`)).toBe("/app/mi-salud/estudios/[id]");
  });
  it("no toca los segmentos estaticos que cuelgan de una base dinamica", () => {
    expect(normalizarRuta("/app/familia/nuevo")).toBe("/app/familia/nuevo");
    expect(normalizarRuta("/app/familia/invitar")).toBe("/app/familia/invitar");
    expect(normalizarRuta("/cuidar/invitacion/abc123def456ghi789jkl0mnopq")).toBe("/cuidar/invitacion/[token]");
  });
  it("cualquier id suelto con forma de identificador se oculta", () => {
    expect(normalizarRuta(`/otra/${UUID}`)).toBe("/otra/[id]");
    expect(normalizarRuta("/otra/1234567")).toBe("/otra/[id]");
  });
  it("rutas raras caen a un valor seguro", () => {
    expect(normalizarRuta("https://evil.com/x")).toBe("/otra");
    expect(normalizarRuta("sin-barra")).toBe("/otra");
    expect(normalizarRuta("/%E0%A4%A")).toBe("/otra");
    expect(normalizarRuta(`/${"a".repeat(500)}`).length).toBeLessThanOrEqual(120);
  });
  it("saca caracteres que no son de una ruta", () => {
    expect(normalizarRuta("/app/<script>")).toBe("/app/script");
  });
});

describe("clasificarDispositivo", () => {
  it("mobile para telefonos y tablets, desktop para el resto", () => {
    expect(clasificarDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe("mobile");
    expect(clasificarDispositivo("Mozilla/5.0 (Linux; Android 14) AppleWebKit Mobile Safari")).toBe("mobile");
    expect(clasificarDispositivo("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120")).toBe("desktop");
    expect(clasificarDispositivo(null)).toBe("desktop");
  });
});

describe("esquemaEnvioVitals", () => {
  const ok = { ruta: "/app", metricas: [{ nombre: "LCP", valor: 1800.5, rating: "good", navegacion: "navigate" }] };
  it("acepta un envio valido", () => {
    expect(esquemaEnvioVitals.safeParse(ok).success).toBe(true);
  });
  it.each([
    ["metrica desconocida", { ...ok, metricas: [{ nombre: "FID", valor: 1, rating: "good" }] }],
    ["valor negativo", { ...ok, metricas: [{ nombre: "LCP", valor: -1, rating: "good" }] }],
    ["valor infinito", { ...ok, metricas: [{ nombre: "LCP", valor: Infinity, rating: "good" }] }],
    ["rating invalido", { ...ok, metricas: [{ nombre: "LCP", valor: 1, rating: "meh" }] }],
    ["sin metricas", { ...ok, metricas: [] }],
    ["demasiadas", { ...ok, metricas: Array.from({ length: 11 }, () => ok.metricas[0]) }],
    ["sin ruta", { metricas: ok.metricas }],
  ])("rechaza %s", (_n, cuerpo) => {
    expect(esquemaEnvioVitals.safeParse(cuerpo).success).toBe(false);
  });
});

describe("filasDeEnvio", () => {
  it("normaliza la ruta otra vez y filtra la navegacion desconocida", () => {
    const filas = filasDeEnvio(
      {
        ruta: `/app/familia/${UUID}?x=1`,
        metricas: [
          { nombre: "LCP", valor: 2000, rating: "good", navegacion: "navigate" },
          { nombre: "CLS", valor: 0.05, rating: "good", navegacion: "raro" },
        ],
      },
      "mobile"
    );
    expect(filas).toEqual([
      { ruta: "/app/familia/[id]", metrica: "LCP", valor: 2000, rating: "good", tipo_navegacion: "navigate", dispositivo: "mobile" },
      { ruta: "/app/familia/[id]", metrica: "CLS", valor: 0.05, rating: "good", tipo_navegacion: null, dispositivo: "mobile" },
    ]);
  });
});
