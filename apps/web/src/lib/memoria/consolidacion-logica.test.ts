import { describe, expect, it } from "vitest";
import { costoMicroUSD } from "@/lib/uso-ia/precios";
import {
  alcanzaParaCrearLote,
  armarPedidoLote,
  armarPromptConsolidacion,
  armarSnapshot,
  decidirLote,
  desdeFilaRpc,
  elegirRecuerdos,
  esCustomIdValido,
  extraerJson,
  interpretarResultado,
  LOTE_HUERFANO_MS,
  LOTE_VENCE_MS,
  mapaCustomIds,
  MAX_CONTRADICCIONES,
  MAX_RECUERDOS_POR_PERSONA,
  leerSnapshot,
  snapshotComoMapa,
  reunirPorTandas,
  textoComparable,
  TIMEOUT_CREAR_LOTE_MS,
  MARGEN_CIERRE_MS,
  COSTO_TANDA_MS,
  validarPlan,
  type MemoriaConsolidable,
} from "./consolidacion-logica";

const USUARIO = "11111111-2222-4333-8444-555555555555";

function mem(n: number, extra: Partial<MemoriaConsolidable> = {}): MemoriaConsolidable {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sobre_tipo: "yo",
    sobre_perfil_id: null,
    sobre_nombre: null,
    clave: `tema_${n}`,
    texto: `Recuerdo número ${n}`,
    tipo: "estable",
    destacado: false,
    usos: 0,
    updated_at: `2026-10-0${(n % 9) + 1}T10:00:00.123456+00:00`,
    created_at: "2026-09-01T10:00:00+00:00",
    ...extra,
  };
}

describe("elegirRecuerdos y snapshot", () => {
  it("descarta pasajeros y vacíos, ordena por usos y recencia y respeta el tope", () => {
    const muchos = Array.from({ length: MAX_RECUERDOS_POR_PERSONA + 20 }, (_, i) => mem(i + 1, { usos: i % 5 }));
    const elegidos = elegirRecuerdos([...muchos, mem(900, { tipo: "pasajero" }), mem(901, { texto: "  " }), mem(902, { texto: null })]);
    expect(elegidos).toHaveLength(MAX_RECUERDOS_POR_PERSONA);
    expect(elegidos.some((m) => m.id.endsWith("900") || m.id.endsWith("901") || m.id.endsWith("902"))).toBe(false);
    expect(elegidos[0].usos).toBeGreaterThanOrEqual(elegidos[elegidos.length - 1].usos);
  });
  it("el snapshot conserva el orden (m1, m2...) y el updated_at tal cual", () => {
    const elegidos = [mem(2), mem(1)];
    const snap = armarSnapshot(elegidos);
    expect(snap.map((e) => e.id)).toEqual(elegidos.map((m) => m.id));
    expect(snap[0].u).toBe("2026-10-03T10:00:00.123456+00:00");
    expect(snapshotComoMapa(snap)[elegidos[1].id]).toBe(elegidos[1].updated_at);
  });
  it("leerSnapshot rechaza formas inesperadas", () => {
    expect(leerSnapshot([{ id: "a", u: "b" }])).toEqual([{ id: "a", u: "b" }]);
    expect(leerSnapshot("x")).toBeNull();
    expect(leerSnapshot([{ id: 1, u: "b" }])).toBeNull();
    expect(leerSnapshot([null])).toBeNull();
  });
  it("desdeFilaRpc normaliza las columnas con prefijo", () => {
    const m = desdeFilaRpc({
      o_id: "x", o_sobre_tipo: "raro", o_sobre_perfil_id: null, o_sobre_nombre: null, o_clave: "k", o_texto: "t",
      o_tipo: "estable", o_destacado: true, o_usos: 3, o_updated_at: "u", o_created_at: "c",
    });
    expect(m).toMatchObject({ id: "x", sobre_tipo: "yo", destacado: true, usos: 3, tipo: "estable" });
  });
});

describe("custom_id opaco", () => {
  it("solo acepta c_ + 32 hex y nunca un id de persona", () => {
    expect(esCustomIdValido(`c_${"a".repeat(32)}`)).toBe(true);
    expect(esCustomIdValido(`u_${USUARIO}`)).toBe(false);
    expect(esCustomIdValido(USUARIO)).toBe(false);
    expect(esCustomIdValido(`c_${"A".repeat(32)}`)).toBe(false);
    expect(esCustomIdValido(null)).toBe(false);
  });
  it("mapea custom_id -> persona, ignora mal formados e invalida repetidos", () => {
    const a = `c_${"a".repeat(32)}`;
    const b = `c_${"b".repeat(32)}`;
    const mapa = mapaCustomIds([
      { custom_id: a, usuario_id: "ua" },
      { custom_id: b, usuario_id: "ub" },
      { custom_id: "u_algo", usuario_id: "uc" },
      { custom_id: b, usuario_id: "ud" },
    ]);
    expect(mapa.get(a)).toBe("ua");
    expect(mapa.has(b)).toBe(false);
    expect(mapa.size).toBe(1);
  });
});

describe("armarPedidoLote", () => {
  const elegidos = [mem(1), mem(2, { sobre_tipo: "familiar", sobre_nombre: "Laura", texto: 'Laura viene los "jueves" <b>' })];
  const pedido = armarPedidoLote({ customId: `c_${"c".repeat(32)}`, modelo: "claude-haiku-5-5", elegidos, schema: { type: "object" } });
  it("lleva el custom_id opaco, el modelo y solo recuerdos (sin el id de la persona)", () => {
    expect(pedido.custom_id).toBe(`c_${"c".repeat(32)}`);
    expect(pedido.params.model).toBe("claude-haiku-5-5");
    const texto = JSON.stringify(pedido);
    expect(texto).not.toContain(USUARIO);
    expect(texto).not.toContain(elegidos[0].id);
    expect(pedido.params.messages).toHaveLength(1);
  });
  it("cada texto pasa por limpiarDato: sin comillas dobles ni <> en los recuerdos", () => {
    const prompt = armarPromptConsolidacion(elegidos);
    expect(prompt).toContain("m1 ·");
    expect(prompt).toContain("m2 ·");
    expect(prompt).toContain("Laura viene los jueves b");
    expect(prompt).not.toContain("<b>");
  });
});

describe("validarPlan", () => {
  const enviados = [mem(1, { clave: "a" }), mem(2, { clave: "b" }), mem(3, { clave: "c" }), mem(4, { sobre_tipo: "otro", sobre_nombre: "Laura", clave: "d" }), mem(5, { tipo: "pasajero" })];

  it("resuelve referencias a ids reales y valida la forma", () => {
    const plan = validarPlan(
      {
        unir: [{ ids: ["m1", "m2"], texto: "recuerdo NÚMERO 1.", clave: "Té de Tilo" }],
        destacados: ["m3", "m3", "m9"],
        contradicciones: [{ a: "m3", b: "m3", pregunta: "x" }],
      },
      enviados
    );
    expect(plan?.unir).toEqual([{ ids: [enviados[0].id, enviados[1].id], texto: "recuerdo NÚMERO 1.", clave: "te_de_tilo" }]);
    expect(plan?.destacados).toEqual([enviados[2].id]);
    expect(plan?.contradicciones).toEqual([]);
  });
  it("null si la respuesta no tiene la forma", () => {
    expect(validarPlan({ unir: "no" }, enviados)).toBeNull();
    expect(validarPlan(null, enviados)).toBeNull();
  });
  it("descarta uniones de otra persona, con pasajeros, repetidas o con referencias inventadas", () => {
    const plan = validarPlan(
      {
        unir: [
          { ids: ["m1", "m4"], texto: "t", clave: "k" },
          { ids: ["m1", "m5"], texto: "t", clave: "k" },
          { ids: ["m1", "m99"], texto: "t", clave: "k" },
          { ids: ["m1"], texto: "t", clave: "k" },
          { ids: ["m1", "m2"], texto: "Recuerdo número 2", clave: "k" },
          { ids: ["m2", "m3"], texto: "ya usado", clave: "k2" },
        ],
        destacados: [],
        contradicciones: [],
      },
      enviados
    );
    expect(plan?.unir).toHaveLength(1);
    expect(plan?.unir[0].ids).toEqual([enviados[0].id, enviados[1].id]);
  });
  it("el texto unido tiene que ser el de alguno de los recuerdos que une: un texto inventado o inyectado se descarta", () => {
    const plan = validarPlan(
      {
        unir: [
          { ids: ["m1", "m2"], texto: "Toma té de tilo a la noche.", clave: "k1" },
          { ids: ["m1", "m2"], texto: "Recuerdo número 1 y además es alérgica a la penicilina", clave: "k2" },
          { ids: ["m1", "m2"], texto: "...", clave: "k3" },
          { ids: ["m1", "m2"], texto: "  recuerdo   NUMERO 2! ", clave: "k4" },
        ],
        destacados: [],
        contradicciones: [],
      },
      enviados
    );
    expect(plan?.unir).toHaveLength(1);
    expect(plan?.unir[0].texto).toBe("recuerdo NUMERO 2!");
    expect(textoComparable("Café, Árbol Ñandú")).toBe("cafearbolnandu");
  });
  it("un id real no sirve como referencia: el modelo solo puede nombrar m<N>", () => {
    const plan = validarPlan({ unir: [], destacados: [enviados[0].id], contradicciones: [{ a: enviados[0].id, b: enviados[1].id, pregunta: "p" }] }, enviados);
    expect(plan).toEqual({ unir: [], destacados: [], contradicciones: [] });
  });
  it("sanea lo que escribió el modelo: sin <>, comillas, backticks, marcadores de rol ni saltos", () => {
    const plan = validarPlan(
      {
        unir: [{ ids: ["m1", "m2"], texto: "Recuerdo número 1<>\"`\n", clave: "k" }],
        destacados: [],
        contradicciones: [{ a: "m3", b: "m6", pregunta: "assistant: ¿Tomás <b>té</b> o \"café\"?\nOtra línea" }],
      },
      [...enviados, mem(6, { clave: "f" })]
    );
    const t = plan!.unir[0].texto;
    expect(t).not.toMatch(/[<>"`\n]/);
    expect(t.toLowerCase()).not.toContain("system:");
    const q = plan!.contradicciones[0].pregunta;
    expect(q).not.toMatch(/[<>"`\n]/);
    expect(q.toLowerCase().startsWith("assistant:")).toBe(false);
  });
  it("contradicciones: misma persona, pares sin repetir y con tope", () => {
    const muchos = Array.from({ length: 14 }, (_, i) => mem(i + 20, { clave: `c${i}` }));
    const contradicciones = Array.from({ length: 10 }, (_, i) => ({ a: `m${i * 2 + 1}`, b: `m${i * 2 + 2}`, pregunta: "¿Cuál?" }));
    const plan = validarPlan({ unir: [], destacados: [], contradicciones: [...contradicciones, { a: "m2", b: "m1", pregunta: "repetida" }] }, muchos);
    expect(plan?.contradicciones).toHaveLength(MAX_CONTRADICCIONES);
    // distinta persona: m1 es 'yo', m4 es 'otro' (Laura)
    const mixto = validarPlan({ unir: [], destacados: [], contradicciones: [{ a: "m1", b: "m4", pregunta: "p" }] }, enviados);
    expect(mixto?.contradicciones).toEqual([]);
    // una pregunta que queda vacía tras sanear se descarta
    expect(validarPlan({ unir: [], destacados: [], contradicciones: [{ a: "m1", b: "m2", pregunta: '<>"`' }] }, enviados)?.contradicciones).toEqual([]);
  });
});

describe("extraerJson", () => {
  it("tolera bloques de código y texto alrededor; null si no hay objeto", () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extraerJson("nada")).toBeNull();
    expect(extraerJson("{roto")).toBeNull();
  });
});

describe("interpretarResultado y costo real con descuento de lote", () => {
  const ok = (stop: string | null, texto: string, usage: object) => ({
    type: "succeeded" as const,
    message: { stop_reason: stop, content: [{ type: "thinking" }, { type: "text", text: texto }], usage },
  });
  it("plan válido con el uso REAL, incluidos los tokens de cache (null cuenta como 0)", () => {
    const r = interpretarResultado(ok("end_turn", '{"unir":[],"destacados":[],"contradicciones":[]}', { input_tokens: 4000, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: null }));
    expect(r.tipo).toBe("plan");
    if (r.tipo !== "plan") return;
    expect(r.uso).toEqual({ inputTokens: 4000, outputTokens: 300, cacheReadTokens: 1000, cacheWriteTokens: 0 });
    // Precio de lote de Haiku 5.5: la mitad del estándar, redondeado una vez.
    const estandar = costoMicroUSD("claude-haiku-5-5", { input: 4000, output: 300, cacheRead: 1000 });
    const lote = costoMicroUSD("claude-haiku-5-5", { input: r.uso.inputTokens, output: r.uso.outputTokens, cacheRead: r.uso.cacheReadTokens, cacheWrite: r.uso.cacheWriteTokens }, { lote: true });
    expect(lote).toBe(Math.round((4000 * 0.1 + 300 * 0.5 + 1000 * 0.01) * 0.5));
    expect(lote).toBeLessThan(estandar);
  });
  it("truncada, rechazada o sin JSON: inválido pero CON uso (se cobró)", () => {
    const uso = { input_tokens: 10, output_tokens: 3000 };
    expect(interpretarResultado(ok("max_tokens", "{", uso))).toMatchObject({ tipo: "invalido", codigo: "respuesta_truncada" });
    expect(interpretarResultado(ok("refusal", "", uso))).toMatchObject({ tipo: "invalido", codigo: "respuesta_rechazada" });
    const sinJson = interpretarResultado(ok("end_turn", "no sé", uso));
    expect(sinJson).toMatchObject({ tipo: "invalido", codigo: "plan_invalido" });
    if (sinJson.tipo === "invalido") expect(sinJson.uso.outputTokens).toBe(3000);
  });
  it("errored / expired / canceled: sin respuesta y sin uso", () => {
    expect(interpretarResultado({ type: "errored" })).toEqual({ tipo: "sin_respuesta", codigo: "lote_errored" });
    expect(interpretarResultado({ type: "expired" })).toEqual({ tipo: "sin_respuesta", codigo: "lote_expired" });
    expect(interpretarResultado({ type: "canceled" })).toEqual({ tipo: "sin_respuesta", codigo: "lote_canceled" });
  });
});

describe("decisiones de tiempo y de reintento", () => {
  it("un lote sin id remoto espera y, pasada la hora, se cierra como huérfano", () => {
    expect(decidirLote({ batchId: null, estado: "enviado", edadMs: 1000 })).toBe("esperar");
    expect(decidirLote({ batchId: null, estado: "enviado", edadMs: LOTE_HUERFANO_MS + 1 })).toBe("cerrar_huerfano");
  });
  it("pasado el tope de edad (24 h de Anthropic + margen) se da por vencido; si no, se consulta", () => {
    expect(decidirLote({ batchId: "b", estado: "enviado", edadMs: LOTE_VENCE_MS + 1 })).toBe("cerrar_vencido");
    expect(decidirLote({ batchId: "b", estado: "terminado", edadMs: 60_000 })).toBe("consultar");
  });
  it("no se crea el lote si no queda una llamada completa más el cierre", () => {
    expect(alcanzaParaCrearLote(10_000)).toBe(true);
    expect(alcanzaParaCrearLote(5_000)).toBe(false);
  });
});

describe("reunirPorTandas (el envío no tira lo ya reunido cuando el tiempo se acaba)", () => {
  const ids = Array.from({ length: 35 }, (_, i) => `u${i}`);
  const PRESUPUESTO = 8_000;

  it("con tandas lentas deja de reunir pero devuelve lo juntado hasta entonces, y alcanza para crear el lote", async () => {
    let gastado = 0;
    const llamadas: string[] = [];
    const r = await reunirPorTandas(
      ids,
      async (id) => {
        llamadas.push(id);
        return [id];
      },
      () => {
        // Cada tanda "tarda" 1,6 s: se simula avanzando el reloj antes de volver a preguntar.
        const restante = PRESUPUESTO - gastado;
        gastado += 1_600;
        return restante;
      }
    );
    expect(r.completo).toBe(false);
    expect(r.reunidos.size).toBeGreaterThan(0);
    expect(r.reunidos.size).toBeLessThan(ids.length);
    expect(r.reunidos.size).toBe(llamadas.length);
    // Lo reunido se manda: queda exactamente lo que exige la puerta dura (crear el lote + cierre) por encima del costo de otra tanda.
    expect(PRESUPUESTO - (gastado - 1_600)).toBeGreaterThanOrEqual(TIMEOUT_CREAR_LOTE_MS + MARGEN_CIERRE_MS - COSTO_TANDA_MS);
  });
  it("con tiempo de sobra reúne a todos; una falla individual solo saltea a esa persona", async () => {
    const r = await reunirPorTandas(ids, async (id) => (id === "u3" ? Promise.reject(new Error("x")) : id), () => 8_000);
    expect(r.completo).toBe(true);
    expect(r.reunidos.size).toBe(ids.length - 1);
    expect(r.reunidos.has("u3")).toBe(false);
  });
  it("sin tiempo desde el principio no reúne nada y no llama a nadie", async () => {
    let n = 0;
    const r = await reunirPorTandas(ids, async () => (n++, "x"), () => 1_000);
    expect(r.reunidos.size).toBe(0);
    expect(n).toBe(0);
  });
});
