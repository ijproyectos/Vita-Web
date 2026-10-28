import { describe, expect, it } from "vitest";
import type { Medicamento } from "@/lib/medicamentos/tipos";
import {
  autorizaPendiente,
  cambiosDeInput,
  destinoPermitido,
  esObjetivoGuardado,
  hhmm,
  leerIndicacionDelModelo,
  pendienteVigente,
  resolverMedicamento,
  snapshotCoincide,
  textoExito,
  textoPropuesta,
  tomarSnapshot,
} from "./confirmaciones-logica";

const med = (id: string, nombre: string, hora: string, extra: Partial<Medicamento> = {}): Medicamento =>
  ({
    id,
    usuario_id: "u",
    nombre,
    dosis: "50",
    unidad: "mg",
    hora_programada: hora,
    momento_dia: "mañana",
    dias_recurrentes: [],
    ...extra,
  }) as Medicamento;

describe("hhmm", () => {
  it("normaliza horas", () => {
    expect(hhmm("8:00")).toBe("08:00");
    expect(hhmm("08:00:00")).toBe("08:00");
    expect(hhmm(null)).toBe("");
  });
});

describe("resolverMedicamento", () => {
  const todos = [med("1", "Losartán", "08:00:00"), med("2", "Losartán", "20:00:00"), med("3", "Ibuprofeno", "12:00:00")];
  it("no encontrado", () => expect(resolverMedicamento(todos, "aspirina").estado).toBe("no_encontrado"));
  it("único aunque la hora no coincida", () => {
    const r = resolverMedicamento(todos, "ibuprofeno", "09:00");
    expect(r.estado).toBe("unico");
  });
  it("ambiguo sin hora: nunca elige el primero", () => {
    const r = resolverMedicamento(todos, "losartan");
    expect(r.estado).toBe("ambiguo");
    if (r.estado === "ambiguo") expect(r.candidatos.map((c) => c.hora)).toEqual(["08:00", "20:00"]);
  });
  it("la hora desambigua", () => {
    const r = resolverMedicamento(todos, "Losartán", "20:00");
    expect(r.estado === "unico" && r.medicamento.id).toBe("2");
  });
  it("misma hora repetida sigue ambiguo", () => {
    const r = resolverMedicamento([med("1", "X", "08:00"), med("2", "X", "08:00")], "x", "08:00");
    expect(r.estado === "ambiguo" && r.mismaHora).toBe(true);
  });
  it("la coincidencia exacta le gana a la parcial", () => {
    const r = resolverMedicamento([med("1", "Vitamina C", "08:00"), med("2", "Vitamina C forte", "08:00")], "vitamina c");
    expect(r.estado === "unico" && r.medicamento.id).toBe("1");
  });
});

describe("snapshot", () => {
  const m = med("1", "Losartán", "08:00:00", { dias_recurrentes: ["lunes", "martes"] });
  it("coincide con la misma fila", () => expect(snapshotCoincide(tomarSnapshot(m), m)).toBe(true));
  it("detecta cambio de hora, dosis, días o id", () => {
    const s = tomarSnapshot(m);
    expect(snapshotCoincide(s, { ...m, hora_programada: "09:00:00" })).toBe(false);
    expect(snapshotCoincide(s, { ...m, dosis: "100" })).toBe(false);
    expect(snapshotCoincide(s, { ...m, dias_recurrentes: ["lunes"] })).toBe(false);
    expect(snapshotCoincide(s, { ...m, id: "2" })).toBe(false);
  });
  it("sin snapshot falla cerrado", () => expect(snapshotCoincide(null, m)).toBe(false));
  it("ignora el orden de los días", () => {
    expect(snapshotCoincide({ ...tomarSnapshot(m), dias_recurrentes: ["martes", "lunes"] }, m)).toBe(true);
  });
});

describe("textos", () => {
  const m = med("1", "Losartán", "08:00:00");
  it("propuesta de borrado nombra persona e historial", () => {
    expect(textoPropuesta("delete_schedule", "Elsa", m)).toBe("¿Borro Losartán 50 mg de las 08:00 de Elsa? También se borra su historial de tomas.");
    expect(textoPropuesta("delete_schedule", null, m)).not.toContain(" de null");
  });
  it("propuesta de cambio", () => {
    expect(textoPropuesta("update_schedule", null, m, { horaProgramada: "09:30" })).toContain("la hora a las 09:30");
    expect(textoPropuesta("update_schedule", null, m, { diasRecurrentes: [] })).toContain("todos los días");
    expect(textoPropuesta("update_schedule", null, m, { indicacion: null })).toContain("quitar la indicación");
  });
  it("éxito usa el snapshot", () => {
    expect(textoExito("delete_schedule", null, tomarSnapshot(m))).toBe("Listo, borré Losartán 50 mg de las 08:00.");
    expect(textoExito("update_schedule", "Elsa", tomarSnapshot(m), { horaProgramada: "09:30" })).toBe(
      "Listo, cambié Losartán 50 mg de las 08:00 de Elsa. Ahora es a las 09:30."
    );
  });
});

describe("cambiosDeInput", () => {
  it("hora válida deriva el momento del día", () => {
    const r = cambiosDeInput({ scheduled_time: "21:00" });
    expect("datos" in r && r.datos).toMatchObject({ horaProgramada: "21:00", momentoDia: "noche" });
  });
  it("hora inválida", () => {
    expect(cambiosDeInput({ scheduled_time: "25:00" })).toHaveProperty("error");
    expect(cambiosDeInput({ scheduled_time: "9" })).toHaveProperty("error");
  });
  it("sin nada que cambiar", () => expect(cambiosDeInput({})).toHaveProperty("error"));
  it("indicación del catálogo, none e inválida", () => {
    expect(cambiosDeInput({ meal_indication: "ayunas" })).toEqual({ datos: { indicacion: "ayunas" } });
    expect(cambiosDeInput({ meal_indication: "none" })).toEqual({ datos: { indicacion: null } });
    expect(cambiosDeInput({ meal_indication: "inventada" })).toHaveProperty("error");
  });
  it("leerIndicacionDelModelo acepta la etiqueta", () => {
    expect(leerIndicacionDelModelo("Con el desayuno")).toBe("con-desayuno");
    expect(leerIndicacionDelModelo(undefined)).toBeUndefined();
    expect(leerIndicacionDelModelo(5)).toBe("invalida");
  });
});

describe("autorizaPendiente", () => {
  const base = { pendienteId: "p1", atada: true, origenDestino: false, vigentesEnSesion: 1 };
  it("el botón con su id autoriza aunque haya más pendientes y no diga sí", () => {
    expect(autorizaPendiente({ ...base, confirmacionId: "p1", respuesta: "otro", vigentesEnSesion: 3 })).toBe(true);
  });
  it("el id de otra pendiente no autoriza", () => {
    expect(autorizaPendiente({ ...base, confirmacionId: "p2", respuesta: "otro" })).toBe(false);
  });
  it("un sí tipeado autoriza una acción atada solo si es la única", () => {
    expect(autorizaPendiente({ ...base, respuesta: "si" })).toBe(true);
    expect(autorizaPendiente({ ...base, respuesta: "si", vigentesEnSesion: 2 })).toBe(false);
  });
  it("un sí tipeado autoriza una acción común", () => {
    expect(autorizaPendiente({ ...base, atada: false, respuesta: "si", vigentesEnSesion: 4 })).toBe(true);
  });
  it("no y otro nunca autorizan", () => {
    expect(autorizaPendiente({ ...base, atada: false, respuesta: "no" })).toBe(false);
    expect(autorizaPendiente({ ...base, atada: false, respuesta: "otro" })).toBe(false);
  });
});

describe("vigencia y permiso", () => {
  const ahora = Date.parse("2026-10-28T12:00:00Z");
  it("pendienteVigente respeta la ventana y falla cerrado", () => {
    expect(pendienteVigente("2026-10-28T11:57:00Z", ahora, 5 * 60_000)).toBe(true);
    expect(pendienteVigente("2026-10-28T11:50:00Z", ahora, 5 * 60_000)).toBe(false);
    expect(pendienteVigente(null, ahora, 5 * 60_000)).toBe(false);
    expect(pendienteVigente("basura", ahora, 5 * 60_000)).toBe(false);
    expect(pendienteVigente("2026-10-28T13:00:00Z", ahora, 5 * 60_000)).toBe(false);
  });
  it("destinoPermitido: propio o editor vigente", () => {
    const fam = [{ id: "a", rol: "editar" }, { id: "b", rol: "ver" }];
    expect(destinoPermitido("yo", "yo", fam)).toBe(true);
    expect(destinoPermitido("a", "yo", fam)).toBe(true);
    expect(destinoPermitido("b", "yo", fam)).toBe(false);
    expect(destinoPermitido("c", "yo", fam)).toBe(false);
  });
  it("esObjetivoGuardado", () => {
    const m = med("1", "X", "08:00");
    expect(esObjetivoGuardado({ medicamentoId: "1", snapshot: tomarSnapshot(m), texto: "?" })).toBe(true);
    expect(esObjetivoGuardado({ medicamentoId: "1" })).toBe(false);
    expect(esObjetivoGuardado(null)).toBe(false);
  });
});
