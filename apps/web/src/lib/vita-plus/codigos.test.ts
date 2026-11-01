import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  bloqueadoPorFallos,
  calcularVigencia,
  claveFallosCanje,
  estadoCodigo,
  formatearCodigo,
  generarCodigo,
  hashCodigo,
  inicioVentanaCanje,
  mensajeCanje,
  MENSAJE_CODIGO_INVALIDO,
  normalizarCodigo,
  tieneFormaDeCodigo,
  ultimos4,
  validarAltaCodigos,
} from "./codigos";

const T0 = Date.UTC(2026, 10, 1, 15, 0, 0);
const DIA = 86_400_000;

describe("generación", () => {
  it("formato VITA-XXXX-XXXX con alfabeto sin 0/O/1/I", () => {
    expect(ALFABETO_CODIGO).toHaveLength(32);
    expect(ALFABETO_CODIGO).not.toMatch(/[01OI]/);
    for (let i = 0; i < 300; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^VITA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
  it("usa los bytes de la fuente (determinista con una fuente fija)", () => {
    expect(generarCodigo(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe("VITA-ABCD-EFGH");
    // bytes > 31 se enmascaran: 32 -> 0, 255 -> 31
    expect(generarCodigo(() => Uint8Array.from([32, 255, 0, 0, 0, 0, 0, 0]))).toBe("VITA-A9AA-AAAA");
  });
  it("dos códigos seguidos casi seguro difieren", () => {
    const vistos = new Set(Array.from({ length: 100 }, () => generarCodigo()));
    expect(vistos.size).toBe(100);
  });
});

describe("normalización y hash", () => {
  it("mayúsculas y sin espacios ni guiones", () => {
    expect(normalizarCodigo(" vita-abcd 2345 ")).toBe("VITAABCD2345");
    expect(normalizarCodigo("VITA_ABCD.2345")).toBe("VITAABCD2345");
  });
  it("el mismo código escrito de distintas maneras da el mismo hash", () => {
    const a = hashCodigo(normalizarCodigo("VITA-ABCD-2345"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCodigo(normalizarCodigo("vita abcd2345"))).toBe(a);
    expect(hashCodigo(normalizarCodigo("VITA-ABCD-2346"))).not.toBe(a);
  });
  it("forma de código y últimos 4", () => {
    expect(tieneFormaDeCodigo("VITAABCD2345")).toBe(true);
    expect(tieneFormaDeCodigo("VITAABCD234")).toBe(false);
    expect(tieneFormaDeCodigo("XXXXABCD2345")).toBe(false);
    expect(tieneFormaDeCodigo("VITAABCD234O")).toBe(false); // O no está en el alfabeto
    expect(formatearCodigo("VITAABCD2345")).toBe("VITA-ABCD-2345");
    expect(ultimos4("VITAABCD2345")).toBe("2345");
  });
});

describe("vigencia: plus vs admin", () => {
  it("plus sin vigencia previa: 15 días desde ahora", () => {
    expect(calcularVigencia({ tipo: "plus", dias: 15, actual: null, ahoraMs: T0 })).toEqual({ venceAt: T0 + 15 * DIA, permanente: false });
  });
  it("plus sobre vigencia futura suma 15 días al vencimiento", () => {
    const r = calcularVigencia({ tipo: "plus", dias: 15, actual: { venceAt: T0 + 10 * DIA, permanente: false }, ahoraMs: T0 });
    expect(r.venceAt).toBe(T0 + 25 * DIA);
  });
  it("plus sobre vigencia vencida arranca de hoy", () => {
    const r = calcularVigencia({ tipo: "plus", dias: 15, actual: { venceAt: T0 - 30 * DIA, permanente: false }, ahoraMs: T0 });
    expect(r.venceAt).toBe(T0 + 15 * DIA);
  });
  it("admin vuelve permanente y no cambia la referencia de vencimiento", () => {
    expect(calcularVigencia({ tipo: "admin", dias: null, actual: null, ahoraMs: T0 })).toEqual({ venceAt: T0, permanente: true });
    expect(calcularVigencia({ tipo: "admin", dias: null, actual: { venceAt: T0 + DIA, permanente: false }, ahoraMs: T0 })).toEqual({
      venceAt: T0 + DIA,
      permanente: true,
    });
  });
  it("un plus sobre una cuenta permanente no le quita la permanencia", () => {
    const r = calcularVigencia({ tipo: "plus", dias: 15, actual: { venceAt: T0, permanente: true }, ahoraMs: T0 });
    expect(r.permanente).toBe(true);
  });
});

describe("estado del código (panel)", () => {
  const base = { revocadoAt: null, usos: 0, usosMax: 2, venceCodigoAt: null };
  it("activo / agotado / vencido / revocado, con ese orden de prioridad", () => {
    expect(estadoCodigo(base, T0)).toBe("activo");
    expect(estadoCodigo({ ...base, usos: 2 }, T0)).toBe("agotado");
    expect(estadoCodigo({ ...base, venceCodigoAt: new Date(T0 - 1).toISOString() }, T0)).toBe("vencido");
    expect(estadoCodigo({ ...base, venceCodigoAt: new Date(T0 + 1000).toISOString() }, T0)).toBe("activo");
    expect(estadoCodigo({ ...base, revocadoAt: "2026-10-01T00:00:00Z", usos: 2 }, T0)).toBe("revocado");
  });
});

describe("mensajes y freno de fallos", () => {
  it("el error es genérico salvo ya canjeado / ya permanente", () => {
    for (const r of ["invalido", "revocado", "vencido", "agotado"] as const) expect(mensajeCanje(r)).toBe(MENSAJE_CODIGO_INVALIDO);
    expect(mensajeCanje("ya_canjeado")).toBe("Ya canjeaste este código.");
    expect(mensajeCanje("ya_permanente")).toMatch(/sin vencimiento/);
  });
  it("5 fallos en una ventana de 15 minutos bloquean", () => {
    expect(bloqueadoPorFallos(4)).toBe(false);
    expect(bloqueadoPorFallos(5)).toBe(true);
    expect(inicioVentanaCanje(Date.UTC(2026, 10, 1, 15, 14, 59)).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(inicioVentanaCanje(Date.UTC(2026, 10, 1, 15, 15, 0)).toISOString()).toBe("2026-11-01T15:15:00.000Z");
    expect(claveFallosCanje("u1")).toBe("canje:u:u1:15min");
  });
});

describe("alta de códigos", () => {
  const ok = { tipo: "plus", usosMax: "5", vence: "", cantidad: "3" };
  it("acepta el formulario válido", () => {
    expect(validarAltaCodigos(ok, T0)).toEqual({ ok: true, datos: { tipo: "plus", usosMax: 5, venceCodigoAt: null, cantidad: 3 } });
  });
  it("el vencimiento es el fin del día argentino", () => {
    const r = validarAltaCodigos({ ...ok, vence: "2026-12-31" }, T0);
    expect(r.ok && r.datos.venceCodigoAt).toBe("2027-01-01T02:59:59.000Z");
  });
  it("rechaza tipo, usos, cantidad y fechas inválidas", () => {
    expect(validarAltaCodigos({ ...ok, tipo: "otro" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, usosMax: "0" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, usosMax: "1.5" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, cantidad: "21" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, cantidad: "0" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, vence: "mañana" }, T0).ok).toBe(false);
    expect(validarAltaCodigos({ ...ok, vence: "2026-10-01" }, T0).ok).toBe(false);
  });
});
