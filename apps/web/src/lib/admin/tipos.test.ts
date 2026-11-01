import { describe, expect, it } from "vitest";
import {
  leerIA,
  leerResumen,
  leerSistema,
  leerUsuarioDetalle,
  leerUsuarios,
  leerVitaPlus,
  num,
  numONull,
  porSeccion,
} from "./tipos";

describe("num / numONull", () => {
  it("aceptan números y strings numéricos (numeric de Postgres)", () => {
    expect(num(5)).toBe(5);
    expect(num("12.5")).toBe(12.5);
    expect(numONull("0.33")).toBe(0.33);
  });
  it("valores raros -> 0 / null", () => {
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(Number.NaN)).toBe(0);
    expect(numONull(null)).toBeNull();
    expect(numONull(undefined)).toBeNull();
    expect(numONull("")).toBeNull();
    expect(numONull("x")).toBeNull();
  });
});

describe("porSeccion", () => {
  it("arma el mapa y tolera entradas que no son arrays", () => {
    const m = porSeccion([{ o_seccion: "a", o_datos: { x: 1 } }]);
    expect(m.get("a")).toEqual({ x: 1 });
    expect(porSeccion(null).size).toBe(0);
    expect(porSeccion({}).size).toBe(0);
  });
});

describe("leerResumen", () => {
  it("null si falta la columna clave", () => {
    expect(leerResumen([])).toBeNull();
    expect(leerResumen([{ otra: 1 }])).toBeNull();
  });
  it("mapea las columnas o_*", () => {
    const r = leerResumen([
      { o_usuarios_total: 10, o_gestionados: 2, o_nuevos_7d: 1, o_costo_hoy_usd: "0.5", o_onboarding_pct: null, o_cron_fallos_24h: 3 },
    ]);
    expect(r).toMatchObject({ usuariosTotal: 10, gestionados: 2, nuevos7d: 1, costoHoyUsd: 0.5, onboardingPct: null, cronFallos24h: 3 });
  });
});

describe("leerUsuarios", () => {
  it("sin filas -> total 0", () => {
    expect(leerUsuarios([])).toEqual({ total: 0, filas: [] });
    expect(leerUsuarios(null)).toEqual({ total: 0, filas: [] });
  });
  it("mapea una fila", () => {
    const { total, filas } = leerUsuarios([
      { o_total: 3, o_id: "u1", o_email: "a@b.c", o_nombre: null, o_dias_inactivo: 4, o_vita_plus: true, o_tipo: "gestionado", o_costo_30d_usd: "1.25" },
    ]);
    expect(total).toBe(3);
    expect(filas[0]).toMatchObject({ id: "u1", nombre: null, diasInactivo: 4, vitaPlus: true, tipo: "gestionado", costo30dUsd: 1.25 });
  });
});

describe("leerUsuarioDetalle", () => {
  it("null sin sección cuenta", () => {
    expect(leerUsuarioDetalle([])).toBeNull();
    expect(leerUsuarioDetalle([{ o_seccion: "conteos", o_datos: {} }])).toBeNull();
  });
  it("mapea cuenta, conteos y vínculos", () => {
    const d = leerUsuarioDetalle([
      { o_seccion: "cuenta", o_datos: { id: "u1", email: "a@b.c", tipo: "real", onboarding: true, dias_inactivo: 2 } },
      { o_seccion: "conteos", o_datos: { medicamentos: 4 } },
      { o_seccion: "cuidadores", o_datos: [{ id: "c1", nombre: "Ana", rol: "editar" }] },
      { o_seccion: "pagos", o_datos: [{ pago_id: "p1", ars_pesos: 100, meses: 1 }] },
    ]);
    expect(d?.cuenta).toMatchObject({ id: "u1", onboarding: true, diasInactivo: 2, memoriaActiva: true });
    expect(d?.conteos.medicamentos).toBe(4);
    expect(d?.cuidadores[0]).toMatchObject({ id: "c1", nombre: "Ana", rol: "editar" });
    expect(d?.pagos[0]).toMatchObject({ pagoId: "p1", arsPesos: 100 });
  });
});

describe("leerIA / leerVitaPlus / leerSistema", () => {
  it("entradas vacías no rompen", () => {
    expect(leerIA([]).diario).toEqual([]);
    expect(leerIA([]).latencia.p50).toBeNull();
    expect(leerVitaPlus([]).noAcreditados).toEqual([]);
    expect(leerSistema([]).cron).toEqual([]);
  });
  it("leerIA mapea diario y latencia", () => {
    const ia = leerIA([
      { o_seccion: "diario", o_datos: [{ fecha: "2026-11-01", costo_usd: 0.1, ratio_cache: null, mensajes: 4 }] },
      { o_seccion: "latencia", o_datos: { respuestas: 5, p50_ms: 1200, p95_ms: null } },
    ]);
    expect(ia.diario[0]).toMatchObject({ fecha: "2026-11-01", costoUsd: 0.1, ratioCache: null, mensajes: 4 });
    expect(ia.latencia).toMatchObject({ respuestas: 5, p50: 1200, p95: null });
  });
  it("leerVitaPlus y leerSistema mapean secciones", () => {
    const v = leerVitaPlus([
      { o_seccion: "resumen", o_datos: { activos: 2, ingresos_ars_30d: 5000 } },
      { o_seccion: "no_acreditados", o_datos: [{ clave: "k", motivo: "monto", monto: 10 }] },
    ]);
    expect(v).toMatchObject({ activos: 2, ingresosArs30d: 5000 });
    expect(v.noAcreditados[0]).toMatchObject({ clave: "k", monto: 10, email: null });
    const s = leerSistema([
      { o_seccion: "cron", o_datos: [{ nombre: "j", activo: true, fallos_24h: 1 }] },
      { o_seccion: "db", o_datos: { bytes: 2048 } },
      { o_seccion: "migracion", o_datos: { version: "044" } },
    ]);
    expect(s.cron[0]).toMatchObject({ nombre: "j", activo: true, fallos24h: 1 });
    expect(s).toMatchObject({ dbBytes: 2048, migracion: "044" });
  });
});
