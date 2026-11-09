import { describe, expect, it } from "vitest";
import { fraseMedir, horariosDesde, metricasDe, planAplica, tramosDeHoy, validarPlan, type Monitoreo } from "./plan";
import { validarMedicion, type Medicion } from "./tipos";

const H = (hora: string) => ({ hora, conComida: "no-importa" as const, indicacion: null });
const hoy = "2026-11-09";
const aLas = (hora: string) => ({ medido_at: `${hoy}T${hora}:00-03:00` });
const plan = (p: Partial<Monitoreo>): Monitoreo => ({
  id: "p",
  usuario_id: "u",
  tipo: "presion",
  nombre_otra: null,
  unidad_otra: null,
  horarios: [H("08:00")],
  dias_recurrentes: [],
  fecha_fin: null,
  ...p,
});
const med = (p: Partial<Medicion>): Medicion => ({
  id: "m",
  usuario_id: "u",
  tipo: "peso",
  valor: 70,
  valor_secundario: null,
  pulso: null,
  contexto: null,
  medido_at: `${hoy}T08:00:00-03:00`,
  notas: null,
  created_at: "",
  ...p,
});

describe("tramosDeHoy", () => {
  it("cuenta la medición hecha poco antes del horario", () => {
    expect(tramosDeHoy([H("08:00")], [aLas("07:10")])[0].medicion).not.toBeNull();
  });
  it("no cuenta la hecha mucho antes", () => {
    expect(tramosDeHoy([H("08:00")], [aLas("05:00")])[0].medicion).toBeNull();
  });
  it("una medición suelta a la tarde no apaga el horario de la noche", () => {
    const [manana, noche] = tramosDeHoy([H("08:00"), H("20:00")], [aLas("15:00")]);
    expect(manana.medicion).not.toBeNull();
    expect(noche.medicion).toBeNull();
  });
  it("con horarios cercanos corta en el punto medio", () => {
    const horarios = [H("08:00"), H("08:30")];
    const a = tramosDeHoy(horarios, [aLas("08:05")]);
    expect(a[0].medicion).not.toBeNull();
    expect(a[1].medicion).toBeNull();
    const b = tramosDeHoy(horarios, [aLas("08:15")]);
    expect(b[0].medicion).toBeNull();
    expect(b[1].medicion).not.toBeNull();
  });
  it("con horarios lejanos sigue contando desde una hora antes", () => {
    const [manana, noche] = tramosDeHoy([H("08:00"), H("20:00")], [aLas("19:10")]);
    expect(manana.medicion).toBeNull();
    expect(noche.medicion).not.toBeNull();
  });
  it("en cada horario queda la más nueva", () => {
    const [t] = tramosDeHoy([H("08:00")], [aLas("08:05"), aLas("09:30")]);
    expect(t.medicion?.medido_at).toContain("T09:30");
  });
});

describe("planAplica", () => {
  it("respeta días y fecha de fin inclusive", () => {
    expect(planAplica(plan({ dias_recurrentes: ["lunes"] }), "lunes", hoy)).toBe(true);
    expect(planAplica(plan({ dias_recurrentes: ["martes"] }), "lunes", hoy)).toBe(false);
    expect(planAplica(plan({ fecha_fin: hoy }), "lunes", hoy)).toBe(true);
    expect(planAplica(plan({ fecha_fin: "2026-11-08" }), "lunes", hoy)).toBe(false);
  });
});

describe("validarPlan", () => {
  const base = { tipo: "presion", horarios: [H("08:00")], dias: [] };
  it("acepta un plan común y descarta nombre en métricas fijas", () => {
    const r = validarPlan({ ...base, nombreOtra: "x" }, hoy);
    expect(r.ok && r.datos.nombre_otra).toBeNull();
  });
  it("Otra exige nombre; la unidad es opcional", () => {
    expect(validarPlan({ ...base, tipo: "otra" }, hoy).ok).toBe(false);
    const r = validarPlan({ ...base, tipo: "otra", nombreOtra: " Dolor " }, hoy);
    expect(r.ok && r.datos.nombre_otra).toBe("Dolor");
    expect(r.ok && r.datos.unidad_otra).toBeNull();
  });
  it("rechaza horas repetidas, de más, mal formadas o ninguna", () => {
    expect(validarPlan({ ...base, horarios: [H("08:00"), H("08:00")] }, hoy).ok).toBe(false);
    expect(validarPlan({ ...base, horarios: ["01", "02", "03", "04", "05"].map((h) => H(`${h}:00`)) }, hoy).ok).toBe(false);
    expect(validarPlan({ ...base, horarios: [H("25:00")] }, hoy).ok).toBe(false);
    expect(validarPlan({ ...base, horarios: [] }, hoy).ok).toBe(false);
  });
  it("rechaza una fecha de fin pasada", () => {
    expect(validarPlan({ ...base, fechaFin: "2026-11-08" }, hoy).ok).toBe(false);
  });
});

describe("metricasDe", () => {
  it("muestra un plan sin mediciones y une 'Otra' sin distinguir mayúsculas", () => {
    const ms = metricasDe(
      [med({ tipo: "otra", nombre_otra: "dolor", unidad_otra: "pts" })],
      [plan({ tipo: "glucemia" }), plan({ id: "q", tipo: "otra", nombre_otra: "Dolor", unidad_otra: "pts" })]
    );
    expect(ms.map((m) => m.clave)).toEqual(["glucemia", "otra:dolor"]);
    expect(ms[0].mediciones).toHaveLength(0);
    expect(ms[1].mediciones).toHaveLength(1);
    expect(ms[1].meta.nombre).toBe("Dolor");
  });
});

it("fraseMedir usa el artículo de cada métrica", () => {
  expect(fraseMedir(plan({}))).toBe("la presión");
  expect(fraseMedir(plan({ tipo: "peso" }))).toBe("el peso");
  expect(fraseMedir(plan({ tipo: "otra", nombre_otra: "Dolor" }))).toBe("dolor");
});

it("horariosDesde ignora filas raras", () => {
  expect(horariosDesde([{ hora: "20:00" }, { hora: "x" }, null, H("08:00")]).map((h) => h.hora)).toEqual(["08:00", "20:00"]);
  expect(horariosDesde("nada")).toEqual([]);
});

it("una medición Otra acepta cualquier valor numérico con su nombre", () => {
  const r = validarMedicion({ tipo: "otra", nombreOtra: "Dolor", valor: "7" });
  expect(r.ok && r.datos.nombreOtra).toBe("Dolor");
  expect(validarMedicion({ tipo: "otra", valor: "7" }).ok).toBe(false);
});
