import { describe, expect, it } from "vitest";
import {
  cuando,
  diasEntre,
  evaluarReglas,
  finDelDia,
  reglaEstudioFueraDeRango,
  reglaFamiliaSinTomas,
  reglaGlucemiaFueraDeRango,
  reglaMedicionPendiente,
  reglaPresionAlta,
  reglaStockBajoDias,
  reglaTomasSalteadas,
  reglaTratamientoTermina,
  reglaTurnoCerca,
  semanaISO,
  sumarDias,
  textoSeguro,
} from "./reglas";
import type { DatosPersonaObs, MedicamentoObs, MedicionObs } from "./tipos";

// 2026-11-18 es miércoles.
const HOY = "2026-11-18";

function base(parche: Partial<DatosPersonaObs> = {}): DatosPersonaObs {
  return {
    personaId: "p1",
    hoy: HOY,
    hora: "09:00",
    nombre: "Elsa Pérez",
    medicamentos: [],
    inventarios: [],
    tomas: [],
    mediciones: [],
    monitoreos: [],
    estudios: [],
    turnos: [],
    cuidadoresEditores: 0,
    ...parche,
  };
}

function med(parche: Partial<MedicamentoObs> = {}): MedicamentoObs {
  return {
    id: "m1",
    nombre: "Enalapril",
    forma: "pastilla",
    momento_dia: "mañana",
    hora_programada: "08:00",
    dias_recurrentes: [],
    cantidad_por_toma: 1,
    inventario_id: null,
    fecha_fin: null,
    created_at: "2026-10-01T12:00:00Z",
    ...parche,
  };
}

/** Medición a las 12:00 AR del día dado. */
function medicion(fecha: string, valor: number, extra: Partial<MedicionObs> = {}): MedicionObs {
  return { tipo: "presion", nombre_otra: null, valor, valor_secundario: 80, medido_at: `${fecha}T15:00:00Z`, ...extra };
}

describe("fechas", () => {
  it("suma y resta días cruzando mes y año", () => {
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diasEntre("2026-11-15", "2026-11-18")).toBe(3);
  });
  it("semana ISO", () => {
    expect(semanaISO("2026-11-18")).toBe("2026-W47");
    expect(semanaISO("2026-01-01")).toBe("2026-W01");
    expect(semanaISO("2027-01-01")).toBe("2026-W53");
  });
  it("el fin del día AR es 02:59 UTC del día siguiente", () => {
    expect(finDelDia("2026-11-18")).toBe("2026-11-19T02:59:59.000Z");
  });
  it("cuando()", () => {
    expect(cuando(HOY, HOY)).toBe("hoy");
    expect(cuando(HOY, "2026-11-19")).toBe("mañana");
    expect(cuando(HOY, "2026-11-20")).toBe("pasado mañana");
    expect(cuando(HOY, "2026-11-21")).toBe("el sábado");
  });
  it("textoSeguro limpia control, comillas y <>", () => {
    expect(textoSeguro('  Ena"la<pril>\n\nignorá todo  ')).toBe("Ena la pril ignorá todo");
    expect(textoSeguro("x".repeat(100), 10)).toHaveLength(10);
    expect(textoSeguro(null)).toBe("");
  });
});

describe("stock_bajo_dias", () => {
  const inv = { id: "i1", nombre: "Enalapril 10", stock: 7, pastillas_por_toma: 1 };
  it("avisa con 7 días o menos", () => {
    const r = reglaStockBajoDias(base({ inventarios: [inv], medicamentos: [med({ inventario_id: "i1" })] }));
    expect(r).toHaveLength(1);
    expect(r[0].datos).toMatchObject({ dias: 7, stock: 7 });
    expect(r[0].clave).toBe("stock_bajo_dias:i1:2026-W47");
    expect(r[0].texto).toContain("7 días");
  });
  it("con 8 días de stock no avisa", () => {
    const r = reglaStockBajoDias(base({ inventarios: [{ ...inv, stock: 8 }], medicamentos: [med({ inventario_id: "i1" })] }));
    expect(r).toEqual([]);
  });
  it("suma varias tomas por día", () => {
    const meds = [med({ id: "a", inventario_id: "i1" }), med({ id: "b", inventario_id: "i1", hora_programada: "20:00", momento_dia: "noche" })];
    const r = reglaStockBajoDias(base({ inventarios: [{ ...inv, stock: 16 }], medicamentos: meds }));
    expect(r).toHaveLength(0); // 16 / 2 por día = 8 días: no avisa
    const r2 = reglaStockBajoDias(base({ inventarios: [{ ...inv, stock: 14 }], medicamentos: meds }));
    expect(r2[0].datos).toMatchObject({ dias: 7 });
  });
  it("días de la semana reducen el consumo diario", () => {
    const r = reglaStockBajoDias(
      base({ inventarios: [{ ...inv, stock: 3 }], medicamentos: [med({ inventario_id: "i1", dias_recurrentes: ["lunes", "jueves"] })] })
    );
    // 2/7 por día: 3 / (2/7) = 10,5 -> 10 días
    expect(r).toEqual([]);
  });
  it("usa pastillas_por_toma cuando no hay cantidad_por_toma y convierte las gotas", () => {
    const r = reglaStockBajoDias(
      base({ inventarios: [{ ...inv, stock: 4, pastillas_por_toma: 2 }], medicamentos: [med({ inventario_id: "i1", cantidad_por_toma: null })] })
    );
    expect(r[0].datos).toMatchObject({ dias: 2 });
    const gotas = reglaStockBajoDias(
      base({ inventarios: [{ ...inv, stock: 1 }], medicamentos: [med({ inventario_id: "i1", forma: "gotas", cantidad_por_toma: 10 })] })
    );
    expect(gotas[0].datos).toMatchObject({ dias: 2 }); // 10 gotas = 0,5 ml por día
  });
  it("stock 0 avisa que no alcanza", () => {
    const r = reglaStockBajoDias(base({ inventarios: [{ ...inv, stock: 0 }], medicamentos: [med({ inventario_id: "i1" })] }));
    expect(r[0].texto).toContain("No alcanza");
  });
  it("sin tratamiento vigente no avisa", () => {
    const r = reglaStockBajoDias(base({ inventarios: [inv], medicamentos: [med({ inventario_id: "i1", fecha_fin: "2026-11-17" })] }));
    expect(r).toEqual([]);
  });
  it("si el tratamiento termina antes de que se acabe el stock no avisa", () => {
    const r = reglaStockBajoDias(base({ inventarios: [inv], medicamentos: [med({ inventario_id: "i1", fecha_fin: "2026-11-20" })] }));
    expect(r).toEqual([]);
    const sigue = reglaStockBajoDias(base({ inventarios: [inv], medicamentos: [med({ inventario_id: "i1", fecha_fin: "2026-12-30" })] }));
    expect(sigue).toHaveLength(1);
  });
  it("sin medicamentos enganchados no avisa", () => {
    expect(reglaStockBajoDias(base({ inventarios: [inv] }))).toEqual([]);
  });
});

describe("tomas_salteadas", () => {
  it("3 salteadas en la misma franja avisan", () => {
    const r = reglaTomasSalteadas(base({ medicamentos: [med()] }));
    // Sin ninguna marca: 7 días sin marcar.
    expect(r).toHaveLength(1);
    expect(r[0].datos).toMatchObject({ momento_dia: "mañana", cantidad: 7 });
  });
  it("con 2 salteadas no avisa", () => {
    const tomas = ["2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13"].map((fecha) => ({
      medicamento_id: "m1",
      fecha,
      tomado: true,
      omitida_at: null,
    }));
    expect(reglaTomasSalteadas(base({ medicamentos: [med()], tomas }))).toEqual([]); // 2 sin marcar (12 y 11)
  });
  it("exactamente 3 avisan", () => {
    const tomas = ["2026-11-17", "2026-11-16", "2026-11-15", "2026-11-14"].map((fecha) => ({ medicamento_id: "m1", fecha, tomado: true, omitida_at: null }));
    expect(reglaTomasSalteadas(base({ medicamentos: [med()], tomas }))[0].datos).toMatchObject({ cantidad: 3 });
  });
  it("las omitidas ('No la tomé') no cuentan como salteadas", () => {
    const tomas = Array.from({ length: 7 }, (_, i) => ({ medicamento_id: "m1", fecha: sumarDias(HOY, -(i + 1)), tomado: false, omitida_at: "2026-11-10T10:00:00Z" }));
    expect(reglaTomasSalteadas(base({ medicamentos: [med()], tomas }))).toEqual([]);
  });
  it("hoy no cuenta", () => {
    const m = med({ created_at: "2026-11-18T10:00:00Z" });
    expect(reglaTomasSalteadas(base({ medicamentos: [m] }))).toEqual([]);
  });
  it("respeta el alta del medicamento", () => {
    // Alta el 16: cuentan el 16 y el 17 -> 2.
    expect(reglaTomasSalteadas(base({ medicamentos: [med({ created_at: "2026-11-16T12:00:00Z" })] }))).toEqual([]);
    // Alta el 15 -> 3.
    expect(reglaTomasSalteadas(base({ medicamentos: [med({ created_at: "2026-11-15T12:00:00Z" })] }))).toHaveLength(1);
  });
  it("el alta cerca de la medianoche usa la fecha AR, no la UTC", () => {
    // 2026-11-16T01:00Z = 15/11 22:00 AR: el 15 ya cuenta.
    expect(reglaTomasSalteadas(base({ medicamentos: [med({ created_at: "2026-11-16T01:00:00Z" })] }))).toHaveLength(1);
  });
  it("solo cuenta los días en que aplica y mientras dura el tratamiento", () => {
    // Solo lunes: en los 7 días previos hay un lunes (16).
    expect(reglaTomasSalteadas(base({ medicamentos: [med({ dias_recurrentes: ["lunes"] })] }))).toEqual([]);
    // fecha_fin el 14: cuentan 11, 12, 13, 14 = 4 (los días previos 11..14).
    const r = reglaTomasSalteadas(base({ medicamentos: [med({ fecha_fin: "2026-11-14" })] }));
    expect(r[0].datos).toMatchObject({ cantidad: 4 });
  });
  it("agrupa por franja del día: dos franjas de 2 no suman", () => {
    const manana = med({ id: "a", created_at: "2026-11-16T12:00:00Z" });
    const noche = med({ id: "b", momento_dia: "noche", created_at: "2026-11-16T12:00:00Z" });
    expect(reglaTomasSalteadas(base({ medicamentos: [manana, noche] }))).toEqual([]);
  });
  it("una observación por franja", () => {
    const manana = med({ id: "a" });
    const noche = med({ id: "b", momento_dia: "noche" });
    const r = reglaTomasSalteadas(base({ medicamentos: [manana, noche] }));
    expect(r.map((o) => o.clave).sort()).toEqual(["tomas_salteadas:mañana:2026-W47", "tomas_salteadas:noche:2026-W47"]);
  });
  it("incluye la frase para consultar con el médico", () => {
    expect(reglaTomasSalteadas(base({ medicamentos: [med()] }))[0].texto).toContain("Consultalo con tu médico.");
  });
});

describe("presion_alta", () => {
  it("3 mediciones altas en 7 días avisan", () => {
    const mediciones = [medicion("2026-11-18", 145), medicion("2026-11-16", 150), medicion("2026-11-12", 141)];
    const r = reglaPresionAlta(base({ mediciones }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidad: "atencion", tipo: "presion_alta" });
    expect(r[0].datos).toMatchObject({ cantidad: 3, sistolica_maxima: 150 });
    expect(r[0].texto).toContain("Consultalo con tu médico.");
    expect(r[0].texto).toBe("Tu presión estuvo alta (140 de máxima o 90 de mínima, o más) 3 veces en los últimos 7 días. Consultalo con tu médico.");
  });
  it("140 exacto y diastólica 90 exacta cuentan; 139/89 no", () => {
    const limite = [medicion("2026-11-18", 140, { valor_secundario: 70 }), medicion("2026-11-17", 120, { valor_secundario: 90 }), medicion("2026-11-16", 139, { valor_secundario: 89 })];
    expect(reglaPresionAlta(base({ mediciones: limite }))).toEqual([]); // 2 altas
    expect(reglaPresionAlta(base({ mediciones: [...limite, medicion("2026-11-15", 160)] }))).toHaveLength(1);
  });
  it("2 altas no alcanzan", () => {
    expect(reglaPresionAlta(base({ mediciones: [medicion("2026-11-18", 160), medicion("2026-11-17", 160)] }))).toEqual([]);
  });
  it("la ventana es de 7 días: el día 8 queda afuera", () => {
    const m = [medicion("2026-11-18", 150), medicion("2026-11-17", 150), medicion("2026-11-11", 150)]; // 11/11 = hace 7 días: afuera
    expect(reglaPresionAlta(base({ mediciones: m }))).toEqual([]);
    const m2 = [medicion("2026-11-18", 150), medicion("2026-11-17", 150), medicion("2026-11-12", 150)]; // hace 6 días: adentro
    expect(reglaPresionAlta(base({ mediciones: m2 }))).toHaveLength(1);
  });
  it("ignora otras métricas y usa la fecha AR de la medición", () => {
    const otras = [medicion("2026-11-18", 150, { tipo: "glucemia" }), medicion("2026-11-17", 150), medicion("2026-11-16", 150)];
    expect(reglaPresionAlta(base({ mediciones: otras }))).toEqual([]);
    // 2026-11-12T01:00Z = 11/11 22:00 AR -> fuera de la ventana de hoy-6 = 12/11.
    const tarde = [medicion("2026-11-18", 150), medicion("2026-11-17", 150), { ...medicion("2026-11-12", 150), medido_at: "2026-11-12T01:00:00Z" }];
    expect(reglaPresionAlta(base({ mediciones: tarde }))).toEqual([]);
  });
  it("la diastólica sola alcanza", () => {
    const m = [18, 17, 16].map((d) => medicion(`2026-11-${d}`, 130, { valor_secundario: 95 }));
    expect(reglaPresionAlta(base({ mediciones: m }))).toHaveLength(1);
  });
});

describe("glucemia_fuera_rango", () => {
  const g = (fecha: string, valor: number) => medicion(fecha, valor, { tipo: "glucemia", valor_secundario: null });
  it("2 mediciones fuera de rango avisan (altas y bajas suman)", () => {
    const r = reglaGlucemiaFueraDeRango(base({ mediciones: [g("2026-11-18", 200), g("2026-11-17", 60)] }));
    expect(r).toHaveLength(1);
    expect(r[0].datos).toMatchObject({ cantidad: 2, altas: 1, bajas: 1 });
    expect(r[0].texto).toContain("Consultalo con tu médico.");
  });
  it("los límites 180 y 70 no cuentan", () => {
    expect(reglaGlucemiaFueraDeRango(base({ mediciones: [g("2026-11-18", 180), g("2026-11-17", 70), g("2026-11-16", 181)] }))).toEqual([]);
    expect(reglaGlucemiaFueraDeRango(base({ mediciones: [g("2026-11-18", 181), g("2026-11-17", 69)] }))).toHaveLength(1);
  });
  it("una sola no alcanza", () => {
    expect(reglaGlucemiaFueraDeRango(base({ mediciones: [g("2026-11-18", 300)] }))).toEqual([]);
  });
  it("fuera de la ventana de 7 días no cuenta", () => {
    expect(reglaGlucemiaFueraDeRango(base({ mediciones: [g("2026-11-18", 300), g("2026-11-10", 300)] }))).toEqual([]);
  });
});

describe("estudio_fuera_rango", () => {
  const estudio = (parche: Record<string, unknown> = {}) => ({
    id: "e1",
    tipo: "Análisis de sangre",
    created_at: "2026-11-10T15:00:00Z",
    valores: [{ nombre: "Colesterol", estado: "alto", rango_min: 0, rango_max: 200 }],
    ...parche,
  });
  it("avisa con un valor marcado y rango impreso", () => {
    const r = reglaEstudioFueraDeRango(base({ estudios: [estudio()] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ clave: "estudio_fuera_rango:e1", href: "/app/mi-salud/estudios/e1", severidad: "atencion" });
    expect(r[0].texto).toContain("Colesterol");
    expect(r[0].texto).toContain("Consultalo con tu médico.");
  });
  it("sin rango impreso no avisa aunque el estado diga alto", () => {
    const sin = estudio({ valores: [{ nombre: "TSH", estado: "alto", rango_min: null, rango_max: null, rango_texto: null }] });
    expect(reglaEstudioFueraDeRango(base({ estudios: [sin] }))).toEqual([]);
  });
  it("alcanza con un rango en texto", () => {
    const txt = estudio({ valores: [{ nombre: "TSH", estado: "bajo", rango_texto: "0,4 - 4" }] });
    expect(reglaEstudioFueraDeRango(base({ estudios: [txt] }))).toHaveLength(1);
  });
  it("valores normales o sin estado no avisan", () => {
    const ok = estudio({ valores: [{ nombre: "A", estado: "normal", rango_max: 5 }, { nombre: "B", estado: null, rango_max: 5 }] });
    expect(reglaEstudioFueraDeRango(base({ estudios: [ok] }))).toEqual([]);
  });
  it("solo estudios de los últimos 14 días", () => {
    expect(reglaEstudioFueraDeRango(base({ estudios: [estudio({ created_at: "2026-11-04T15:00:00Z" })] }))).toHaveLength(1); // hace 14 días
    expect(reglaEstudioFueraDeRango(base({ estudios: [estudio({ created_at: "2026-11-03T15:00:00Z" })] }))).toEqual([]);
  });
  it("limpia los nombres de los valores y tolera estudio sin tipo", () => {
    const raro = estudio({ tipo: null, valores: [{ nombre: 'Glucosa"<b>', estado: "alto", rango_max: 100 }] });
    const r = reglaEstudioFueraDeRango(base({ estudios: [raro] }));
    expect(r[0].texto).not.toMatch(/[<>"]/);
    expect(r[0].texto).toContain("estudio cargado");
  });
  it("cuenta varios valores y nombra hasta 3", () => {
    const v = ["A", "B", "C", "D"].map((nombre) => ({ nombre, estado: "alto", rango_max: 1 }));
    const r = reglaEstudioFueraDeRango(base({ estudios: [estudio({ valores: v })] }));
    expect(r[0].datos).toMatchObject({ cantidad: 4 });
    expect(r[0].texto).toContain("(A, B, C)");
  });
});

describe("turno_cerca", () => {
  const turno = (fecha: string, parche: Record<string, unknown> = {}) => ({ id: "t1", especialidad: "Cardiología", fecha, hora: "10:30", llevar: [], ...parche });
  it("avisa hasta 3 días antes", () => {
    expect(reglaTurnoCerca(base({ turnos: [turno("2026-11-21")] }))).toHaveLength(1);
    expect(reglaTurnoCerca(base({ turnos: [turno("2026-11-22")] }))).toEqual([]);
  });
  it("incluye el checklist de llevar y sugiere la lista de medicamentos", () => {
    const llevar = [{ t: "DNI", ok: false }, { t: "Credencial", ok: false }, { t: "Estudios", ok: true }];
    const r = reglaTurnoCerca(base({ turnos: [turno("2026-11-19", { llevar })] }));
    expect(r[0].texto).toContain("Hay que llevar: DNI, Credencial.");
    expect(r[0].texto).not.toContain("Estudios");
    expect(r[0].texto).toContain("lista de medicamentos");
    expect(r[0].titulo).toBe("Turno de Cardiología mañana");
  });
  it("sin checklist igual sugiere la lista de medicamentos", () => {
    const r = reglaTurnoCerca(base({ turnos: [turno("2026-11-19", { llevar: null })] }));
    expect(r[0].texto).not.toContain("Hay que llevar");
    expect(r[0].texto).toContain("lista de medicamentos");
  });
  it("hoy: solo si la hora no pasó", () => {
    expect(reglaTurnoCerca(base({ turnos: [turno(HOY)], hora: "09:00" }))).toHaveLength(1);
    expect(reglaTurnoCerca(base({ turnos: [turno(HOY)], hora: "10:30" }))).toEqual([]);
    expect(reglaTurnoCerca(base({ turnos: [turno(HOY)], hora: "18:00" }))).toEqual([]);
  });
  it("turnos pasados no avisan", () => {
    expect(reglaTurnoCerca(base({ turnos: [turno("2026-11-17")] }))).toEqual([]);
  });
});

describe("tratamiento_termina", () => {
  it("avisa con fecha_fin dentro de 3 días y agrupa las tomas del mismo remedio", () => {
    const meds = [med({ id: "a", fecha_fin: "2026-11-20" }), med({ id: "b", momento_dia: "noche", fecha_fin: "2026-11-20" })];
    const r = reglaTratamientoTermina(base({ medicamentos: meds }));
    expect(r).toHaveLength(1);
    expect(r[0].texto).toContain("pasado mañana");
    expect(r[0].texto).toContain("consultalo con tu médico.");
    expect(r[0].clave).toBe("tratamiento_termina:enalapril:2026-11-20");
  });
  it("hoy incluido; 4 días y pasados no", () => {
    expect(reglaTratamientoTermina(base({ medicamentos: [med({ fecha_fin: HOY })] }))).toHaveLength(1);
    expect(reglaTratamientoTermina(base({ medicamentos: [med({ fecha_fin: "2026-11-21" })] }))).toHaveLength(1);
    expect(reglaTratamientoTermina(base({ medicamentos: [med({ fecha_fin: "2026-11-22" })] }))).toEqual([]);
    expect(reglaTratamientoTermina(base({ medicamentos: [med({ fecha_fin: "2026-11-17" })] }))).toEqual([]);
    expect(reglaTratamientoTermina(base({ medicamentos: [med()] }))).toEqual([]);
  });
});

describe("medicion_pendiente", () => {
  const plan = { id: "pl1", tipo: "presion", nombre_otra: null, fecha_fin: null, created_at: "2026-10-01T12:00:00Z" };
  it("sin mediciones en 3 días avisa", () => {
    const r = reglaMedicionPendiente(base({ monitoreos: [plan], mediciones: [medicion("2026-11-15", 120)] }));
    expect(r).toHaveLength(1);
    expect(r[0].clave).toBe("medicion_pendiente:pl1:2026-W47");
  });
  it("una medición hace 2 días o hoy evita el aviso", () => {
    expect(reglaMedicionPendiente(base({ monitoreos: [plan], mediciones: [medicion("2026-11-16", 120)] }))).toEqual([]);
    expect(reglaMedicionPendiente(base({ monitoreos: [plan], mediciones: [medicion("2026-11-18", 120)] }))).toEqual([]);
  });
  it("sin ninguna medición también avisa", () => {
    expect(reglaMedicionPendiente(base({ monitoreos: [plan] }))).toHaveLength(1);
  });
  it("una medición de otra métrica no cuenta", () => {
    expect(reglaMedicionPendiente(base({ monitoreos: [plan], mediciones: [medicion("2026-11-18", 100, { tipo: "glucemia", valor_secundario: null })] }))).toHaveLength(1);
  });
  it("plan terminado o recién creado no avisa", () => {
    expect(reglaMedicionPendiente(base({ monitoreos: [{ ...plan, fecha_fin: "2026-11-17" }] }))).toEqual([]);
    expect(reglaMedicionPendiente(base({ monitoreos: [{ ...plan, created_at: "2026-11-16T12:00:00Z" }] }))).toEqual([]);
    expect(reglaMedicionPendiente(base({ monitoreos: [{ ...plan, created_at: "2026-11-15T12:00:00Z" }] }))).toHaveLength(1);
  });
  it("las métricas 'otra' se distinguen por nombre", () => {
    const otra = { ...plan, id: "pl2", tipo: "otra", nombre_otra: "Cintura" };
    const medida = medicion("2026-11-18", 90, { tipo: "otra", nombre_otra: "cintura", valor_secundario: null });
    expect(reglaMedicionPendiente(base({ monitoreos: [otra], mediciones: [medida] }))).toEqual([]);
    const r = reglaMedicionPendiente(base({ monitoreos: [otra], mediciones: [{ ...medida, nombre_otra: "Brazo" }] }));
    expect(r[0].titulo).toBe("Falta cargar una medición de cintura");
  });
});

describe("familia_sin_tomas", () => {
  const dosis = (fecha: string, tomado = true, omitida_at: string | null = null) => ({ medicamento_id: "m1", fecha, tomado, omitida_at });
  it("avisa si ayer y anteayer tenían dosis y no se marcó ninguna", () => {
    const r = reglaFamiliaSinTomas(base({ medicamentos: [med()], cuidadoresEditores: 1 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidad: "atencion", href: "/app/familia/p1", titulo: "Elsa no marcó tomas" });
  });
  it("sin cuidadores con rol editar no se genera", () => {
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med()], cuidadoresEditores: 0 }))).toEqual([]);
  });
  it("cualquier marca (tomada u omitida) en los 2 días lo evita", () => {
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med()], tomas: [dosis("2026-11-17")], cuidadoresEditores: 1 }))).toEqual([]);
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med()], tomas: [dosis("2026-11-16", false, "2026-11-16T10:00:00Z")], cuidadoresEditores: 1 }))).toEqual([]);
    // Una marca de hace 3 días no cuenta para la ventana.
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med()], tomas: [dosis("2026-11-15")], cuidadoresEditores: 1 }))).toHaveLength(1);
  });
  it("sin dosis programadas en alguno de los 2 días no se genera", () => {
    expect(reglaFamiliaSinTomas(base({ cuidadoresEditores: 1 }))).toEqual([]);
    // Solo martes (ayer fue martes 17, anteayer lunes 16).
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med({ dias_recurrentes: ["martes"] })], cuidadoresEditores: 1 }))).toEqual([]);
    // Alta ayer: anteayer todavía no había dosis.
    expect(reglaFamiliaSinTomas(base({ medicamentos: [med({ created_at: "2026-11-17T12:00:00Z" })], cuidadoresEditores: 1 }))).toEqual([]);
  });
  it("un nombre raro no rompe el texto", () => {
    const r = reglaFamiliaSinTomas(base({ nombre: '"<>\n', medicamentos: [med()], cuidadoresEditores: 1 }));
    expect(r[0].titulo).toBe("Tu familiar no marcó tomas");
  });
});

describe("evaluarReglas", () => {
  it("sin datos no genera nada", () => {
    expect(evaluarReglas(base())).toEqual([]);
  });
  it("todas las observaciones traen clave, href interno y vigencia futura", () => {
    const d = base({
      medicamentos: [med({ inventario_id: "i1", fecha_fin: "2026-11-20" })],
      inventarios: [{ id: "i1", nombre: "Enalapril", stock: 1, pastillas_por_toma: 1 }],
      mediciones: [medicion("2026-11-18", 150), medicion("2026-11-17", 150), medicion("2026-11-16", 150)],
      turnos: [{ id: "t1", especialidad: "Cardiología", fecha: "2026-11-19", hora: "10:00", llevar: [] }],
      cuidadoresEditores: 1,
    });
    const r = evaluarReglas(d);
    expect(r.length).toBeGreaterThanOrEqual(4);
    const claves = new Set(r.map((o) => o.clave));
    expect(claves.size).toBe(r.length);
    for (const o of r) {
      expect(o.href ?? "/app").toMatch(/^\/app/);
      expect(new Date(o.vigente_hasta).getTime()).toBeGreaterThan(Date.parse("2026-11-18T12:00:00Z"));
      expect(o.titulo.length).toBeLessThanOrEqual(120);
      expect(o.texto.length).toBeLessThanOrEqual(500);
    }
  });
});
