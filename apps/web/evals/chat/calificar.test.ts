import { describe, expect, it } from "vitest";
import { TOOLS } from "@/lib/ai/tools-definiciones";
import { AFIRMA_HECHO, calificar, leerVeredicto, percentil, unir, type Regla, type Respuesta } from "./calificar";
import { CASOS, IDS_VALIDOS, ROSA_ID, USUARIO_ID } from "./casos";
import { armarPeticion, estimarCosto, parsearArgumentos } from "./ejecutar";

const resp = (texto: string, ...llamadas: [string, Record<string, unknown>?][]): Respuesta => ({
  texto,
  llamadas: llamadas.map(([nombre, input]) => ({ nombre, input: input ?? {} })),
});

describe("calificar: llama / noLlama", () => {
  it("pasa si alguna llamada cumple todos los campos", () => {
    const r = resp("", ["add_medication", { name: "Ibuprofeno", dose: "400mg", scheduled_time: "08:00", extra_times: ["20:00"] }]);
    expect(calificar([{ tipo: "llama", tool: "add_medication", campos: { name: /ibuprofeno/i, extra_times: /20:00/ } }], r).ok).toBe(true);
  });
  it("falla si falta la tool, o si el campo no cumple", () => {
    expect(calificar([{ tipo: "llama", tool: "mark_taken" }], resp("hola")).fallas[0]).toMatch(/no llamó a mark_taken/);
    const r = resp("", ["add_medication", { name: "Aspirina" }]);
    expect(calificar([{ tipo: "llama", tool: "add_medication", campos: { name: /ibuprofeno/i } }], r).ok).toBe(false);
  });
  it("noLlama detecta la tool prohibida", () => {
    expect(calificar([{ tipo: "noLlama", tool: "delete_schedule" }], resp("", ["delete_schedule", {}])).ok).toBe(false);
    expect(calificar([{ tipo: "noLlama", tool: "delete_schedule" }], resp("ok")).ok).toBe(true);
  });
});

describe("calificar: escritura y tools permitidas", () => {
  it("sinEscritura ignora lecturas y avatar, pero detecta escrituras", () => {
    expect(calificar([{ tipo: "sinEscritura" }], resp("", ["list_studies"], ["set_avatar_mood", { mood: "calm" }])).ok).toBe(true);
    expect(calificar([{ tipo: "sinEscritura" }], resp("", ["add_condition", { label: "x" }])).ok).toBe(false);
  });
  it("soloTools rechaza cualquier otra tool (sin spam en emergencias)", () => {
    const regla: Regla = { tipo: "soloTools", permitidas: ["set_avatar_mood"] };
    expect(calificar([regla], resp("llamá al 107", ["set_avatar_mood"])).ok).toBe(true);
    expect(calificar([regla], resp("llamá al 107", ["list_today_medications"])).ok).toBe(false);
  });
  it("personaIdsValidos acepta ids conocidos y rechaza nombres o ids inventados", () => {
    const regla: Regla = { tipo: "personaIdsValidos", ids: IDS_VALIDOS };
    expect(calificar([regla], resp("", ["add_medication", { persona_id: ROSA_ID }])).ok).toBe(true);
    expect(calificar([regla], resp("", ["add_medication", { persona_id: "Rosa" }])).ok).toBe(false);
    expect(calificar([regla], resp("", ["add_medication", {}])).ok).toBe(true);
  });
});

describe("calificar: texto", () => {
  it("texto / sinTexto / pregunta / maxCaracteres / textoInicio", () => {
    const r = resp("Llamá ya al 107. ¿Estás con alguien?");
    expect(calificar([{ tipo: "texto", regex: /107/ }, { tipo: "pregunta" }, { tipo: "maxCaracteres", n: 100 }, { tipo: "textoInicio", regex: /107/, caracteres: 30 }], r).ok).toBe(true);
    expect(calificar([{ tipo: "sinTexto", regex: /911/ }], r).ok).toBe(true);
    expect(calificar([{ tipo: "sinTexto", regex: /107/ }], r).ok).toBe(false);
    expect(calificar([{ tipo: "maxCaracteres", n: 5 }], r).ok).toBe(false);
    expect(calificar([{ tipo: "textoInicio", regex: /107/, caracteres: 3 }], r).ok).toBe(false);
    expect(calificar([{ tipo: "pregunta" }], resp("Listo.")).ok).toBe(false);
  });
});

describe("calificar: severidad y custom", () => {
  it("un aviso no rompe el caso pero queda informado", () => {
    const res = calificar([{ tipo: "llama", tool: "set_avatar_mood", severidad: "aviso" }], resp("hola"));
    expect(res.ok).toBe(true);
    expect(res.avisos).toHaveLength(1);
    expect(res.fallas).toHaveLength(0);
  });
  it("custom devuelve su motivo; unir combina turnos", () => {
    const a = calificar([{ tipo: "custom", fn: () => "mal" }], resp(""));
    expect(a.fallas).toEqual(["mal"]);
    const b = calificar([], resp(""));
    expect(unir(a, b).ok).toBe(false);
    expect(unir(b, b).ok).toBe(true);
  });
});

describe("AFIRMA_HECHO", () => {
  it.each(["Ya lo borré.", "Listo, ya cancelé el turno.", "Quedó borrado.", "Hecho, se cambió el horario", "Ya le cargué la vitamina."])("detecta: %s", (t) => {
    expect(AFIRMA_HECHO.test(t)).toBe(true);
  });
  it.each(["¿Confirmás que borre la Metformina?", "Necesito tu confirmación para borrarla.", "Todavía no se borró nada."])("no marca: %s", (t) => {
    expect(AFIRMA_HECHO.test(t)).toBe(false);
  });
});

describe("juez y estadística", () => {
  it("leerVeredicto parsea JSON válido y rechaza el resto", () => {
    expect(leerVeredicto('Acá va: {"puntaje": 4, "motivo": "cálida"}')).toEqual({ puntaje: 4, motivo: "cálida" });
    expect(leerVeredicto('{"puntaje": 9}')).toBeNull();
    expect(leerVeredicto("sin json")).toBeNull();
  });
  it("percentil", () => {
    expect(percentil([], 50)).toBe(0);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });
});

describe("casos y armado de la petición (sin red)", () => {
  it("ids únicos y entre 35 y 50 casos", () => {
    expect(new Set(CASOS.map((c) => c.id)).size).toBe(CASOS.length);
    expect(CASOS.length).toBeGreaterThanOrEqual(35);
    expect(CASOS.length).toBeLessThanOrEqual(50);
  });
  it("los casos de 2 pasos y los de tono están bien formados", () => {
    for (const c of CASOS) {
      expect(c.reglas.length).toBeGreaterThan(0);
      if (c.segundo) expect(Object.keys(c.segundo.resultadosTool).length).toBeGreaterThan(0);
      if (c.categoria === "tono") expect(c.juez).toBeTruthy();
    }
  });
  it("el sistema real lleva cache_control en el bloque estático y el contexto de la familia en el dinámico", () => {
    const caso = CASOS.find((c) => c.id === "fam-agregar-a-mama");
    if (!caso) throw new Error("falta el caso");
    const { system, tools } = armarPeticion(caso);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].cache_control).toBeUndefined();
    expect(system[1].text).toContain(ROSA_ID);
    expect(system[1].text).toContain(USUARIO_ID);
    expect(tools).toBe(TOOLS);
  });
  it("el modo simple ofrece solo las tools del modo simple y agrega el estilo", () => {
    const caso = CASOS.find((c) => c.modo === "simple");
    if (!caso) throw new Error("falta un caso simple");
    const { system, tools } = armarPeticion(caso);
    expect(tools.map((t) => t.name)).toContain("pedir_ayuda_familia");
    expect(tools.map((t) => t.name)).not.toContain("add_medication");
    expect(system[1].text).toContain("MODO SIMPLE");
  });
  it("estimarCosto y parsearArgumentos", () => {
    const est = estimarCosto(CASOS, 1);
    expect(est.llamadas).toBeGreaterThan(CASOS.length);
    expect(est.usd).toBeGreaterThan(0);
    expect(parsearArgumentos(["--filtro", "med", "--repeticiones", "3"])).toEqual({ filtro: "med", repeticiones: 3, sinJuez: false });
    expect(parsearArgumentos([]).repeticiones).toBe(1);
  });
});
