// Runner del eval del chat de vita (manual, NO corre en CI). Uso:
//   npx tsx evals/chat/ejecutar.ts [--filtro <texto del id>] [--repeticiones N] [--sin-juez]
// Usa el SYSTEM_PROMPT (con cache_control), TOOLS/TOOLS_SIMPLE y el helper de contexto dinámico REALES de la app.
// Las tools NO se ejecutan: se califica el primer turno del modelo y, en los casos de 2 pasos, un segundo turno
// con un tool_result enlatado. Sin base de datos: solo habla con Anthropic.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_TOKENS_CHAT, MAX_TOKENS_RESUMEN, MODELO_IA, MODELO_RESUMEN } from "@/lib/ai/modelo";
import { contextoDinamicoParaModo, toolsParaModo } from "@/lib/ai/modo-simple";
import { armarSystemChat, bloqueHoy, construirContextoPersonas, contextoDinamicoChat, SYSTEM_PROMPT } from "@/lib/ai/prompt-chat";
import { costoUSD } from "@/lib/uso-ia/precios";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { calificar, leerVeredicto, percentil, unir, type Resultado, type Respuesta } from "./calificar";
import { AHORA, CASOS, HOY_ISO, USUARIO_ID, type Caso } from "./casos";

const CONCURRENCIA = 4;

export function parsearArgumentos(argv: string[]): { filtro?: string; repeticiones: number; sinJuez: boolean } {
  const valor = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const rep = Math.floor(Number(valor("--repeticiones") ?? 1));
  return { filtro: valor("--filtro"), repeticiones: Number.isFinite(rep) && rep >= 1 ? rep : 1, sinJuez: argv.includes("--sin-juez") };
}

function miembros(caso: Caso): MiembroFamilia[] {
  return caso.contexto.familia.map((f) => ({ vinculoId: `v-${f.id}`, id: f.id, nombre: f.nombre, color: null, rol: f.rol, relacion: f.relacion, conectado: false }));
}

/** `system` y `tools` del caso, armados con las mismas piezas que /api/chat. */
export function armarPeticion(caso: Caso): { system: Anthropic.TextBlockParam[]; tools: Anthropic.Tool[] } {
  const modo = caso.modo ?? "normal";
  const familia = miembros(caso);
  const abierto = familia.find((f) => f.id === caso.contexto.abiertoId);
  const dinamico = contextoDinamicoChat({
    contextoPerfil: construirContextoPersonas(USUARIO_ID, familia, abierto),
    contextoHoy: bloqueHoy(caso.contexto.medicamentosHoy, caso.contexto.turnosHoy),
    ahora: AHORA,
    hoyISO: HOY_ISO,
  });
  return { system: armarSystemChat(contextoDinamicoParaModo(modo, dinamico)), tools: toolsParaModo(modo) };
}

type Uso = { input: number; output: number; cacheRead: number; cacheWrite: number };
const usoVacio = (): Uso => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function sumar(uso: Uso, u: Anthropic.Usage) {
  uso.input += u.input_tokens;
  uso.output += u.output_tokens;
  uso.cacheRead += u.cache_read_input_tokens ?? 0;
  uso.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

function leer(m: Anthropic.Message): Respuesta {
  return {
    texto: m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(""),
    llamadas: m.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ nombre: b.name, input: (b.input ?? {}) as Record<string, unknown> })),
  };
}

export type ResultadoCaso = {
  id: string;
  categoria: string;
  repeticion: number;
  ok: boolean;
  fallas: string[];
  avisos: string[];
  puntajeTono?: number;
  motivoTono?: string;
  latenciaMs: number;
  texto: string;
  llamadas: Respuesta["llamadas"];
  textoSegundoTurno?: string;
  llamadasSegundoTurno?: Respuesta["llamadas"];
  uso: Uso;
  usoJuez: Uso;
};

async function juzgar(cliente: Anthropic, caso: Caso, texto: string, usoJuez: Uso): Promise<{ puntaje: number; motivo: string } | null> {
  const r = await cliente.messages.create({
    model: MODELO_RESUMEN,
    max_tokens: MAX_TOKENS_RESUMEN,
    system: "Sos un evaluador de tono de un asistente de salud argentino. Respondé SOLO con JSON: {\"puntaje\": 1-5, \"motivo\": \"una frase\"}.",
    messages: [{ role: "user", content: `Criterio: ${caso.juez}\n\nMensaje del usuario: ${caso.mensaje}\n\nRespuesta del asistente:\n${texto || "(sin texto)"}\n\nPuntuá de 1 (no cumple) a 5 (cumple perfecto).` }],
  });
  sumar(usoJuez, r.usage);
  return leerVeredicto(leer(r).texto);
}

async function correrCaso(cliente: Anthropic, caso: Caso, repeticion: number, sinJuez: boolean): Promise<ResultadoCaso> {
  const inicio = performance.now();
  const uso = usoVacio();
  const usoJuez = usoVacio();
  const { system, tools } = armarPeticion(caso);
  const mensajes: Anthropic.MessageParam[] = [...(caso.historial ?? []), { role: "user", content: caso.mensaje }];
  const base = { id: caso.id, categoria: caso.categoria, repeticion, uso, usoJuez };
  try {
    const m1 = await cliente.messages.create({ model: MODELO_IA, max_tokens: MAX_TOKENS_CHAT, system, tools, messages: mensajes });
    sumar(uso, m1.usage);
    const r1 = leer(m1);
    let res: Resultado = calificar(caso.reglas, r1);
    let r2: Respuesta | undefined;
    if (caso.segundo) {
      const usos = m1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (usos.length === 0) {
        res = unir(res, { ok: false, fallas: ["el caso es de 2 pasos pero el modelo no llamó a ninguna tool en el primer turno"], avisos: [] });
      } else {
        const resultados: Anthropic.ToolResultBlockParam[] = usos.map((u) => ({ type: "tool_result", tool_use_id: u.id, content: caso.segundo?.resultadosTool[u.name] ?? "OK." }));
        const m2 = await cliente.messages.create({
          model: MODELO_IA,
          max_tokens: MAX_TOKENS_CHAT,
          system,
          tools,
          messages: [...mensajes, { role: "assistant", content: m1.content }, { role: "user", content: resultados }],
        });
        sumar(uso, m2.usage);
        r2 = leer(m2);
        res = unir(res, calificar(caso.segundo.reglas, r2));
      }
    }
    let puntajeTono: number | undefined;
    let motivoTono: string | undefined;
    if (caso.juez && !sinJuez) {
      const v = await juzgar(cliente, caso, (r2?.texto || r1.texto), usoJuez).catch(() => null);
      puntajeTono = v?.puntaje;
      motivoTono = v?.motivo;
    }
    return { ...base, ok: res.ok, fallas: res.fallas, avisos: res.avisos, puntajeTono, motivoTono, latenciaMs: performance.now() - inicio, texto: r1.texto, llamadas: r1.llamadas, textoSegundoTurno: r2?.texto, llamadasSegundoTurno: r2?.llamadas };
  } catch (e) {
    return { ...base, ok: false, fallas: [`error de la API: ${e instanceof Error ? e.message : "desconocido"}`], avisos: [], latenciaMs: performance.now() - inicio, texto: "", llamadas: [] };
  }
}

/** Estimación previa: 2 escrituras de caché por prefijo (normal/simple), el resto lecturas, ~250 tokens de salida por llamada. */
export function estimarCosto(casos: Caso[], repeticiones: number): { llamadas: number; prefijoTokens: number; usd: number } {
  const { tools } = armarPeticion(casos[0]);
  const prefijoTokens = Math.ceil((JSON.stringify(tools).length + SYSTEM_PROMPT.length) / 4);
  const llamadas = casos.reduce((n, c) => n + (c.segundo ? 2 : 1), 0) * repeticiones;
  const escrituras = Math.min(llamadas, 2 * 4);
  const dinamico = 900;
  const usd =
    costoUSD(MODELO_IA, { input: dinamico * llamadas, output: 250 * llamadas, cacheRead: prefijoTokens * (llamadas - escrituras), cacheWrite: prefijoTokens * escrituras }) +
    costoUSD(MODELO_RESUMEN, { input: 400 * 3 * repeticiones, output: 80 * 3 * repeticiones });
  return { llamadas, prefijoTokens, usd };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

const usd = (n: number) => `US$${n.toFixed(4)}`;

async function main() {
  const args = parsearArgumentos(process.argv.slice(2));
  const casos = args.filtro ? CASOS.filter((c) => c.id.includes(args.filtro as string)) : CASOS;
  if (casos.length === 0) {
    console.error(`Ningún caso coincide con "${args.filtro}". Casos: ${CASOS.map((c) => c.id).join(", ")}`);
    process.exit(2);
  }
  const est = estimarCosto(casos, args.repeticiones);
  console.log(`Modelo: ${MODELO_IA} | casos: ${casos.length} x ${args.repeticiones} | llamadas estimadas: ${est.llamadas} | prefijo ~${est.prefijoTokens} tokens`);
  console.log(`Costo estimado: ~${usd(est.usd)} (con caché de prompt; el primer request de cada prefijo la escribe)`);

  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* puede venir del entorno */
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nFalta ANTHROPIC_API_KEY (entorno o apps/web/.env.local). No se llamó a la API.");
    process.exit(2);
  }
  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const tareas = casos.flatMap((c) => Array.from({ length: args.repeticiones }, (_, i) => ({ c, i })));
  // Calentamiento: el primer caso de cada modo corre solo, para que el resto lea el prefijo cacheado en vez de reescribirlo en paralelo.
  const calentar = [tareas.find((t) => (t.c.modo ?? "normal") === "normal"), tareas.find((t) => t.c.modo === "simple")].filter((t): t is (typeof tareas)[number] => !!t);
  const resto = tareas.filter((t) => !calentar.includes(t));
  const resultados: ResultadoCaso[] = [];
  for (const t of calentar) resultados.push(await correrCaso(cliente, t.c, t.i + 1, args.sinJuez));
  resultados.push(...(await pool(resto, CONCURRENCIA, (t) => correrCaso(cliente, t.c, t.i + 1, args.sinJuez))));

  // Tabla por caso (PASS solo si pasaron todas las repeticiones).
  console.log("\nResultado por caso");
  let pasan = 0;
  for (const c of casos) {
    const rs = resultados.filter((r) => r.id === c.id);
    const ok = rs.filter((r) => r.ok).length;
    const pasa = ok === rs.length;
    if (pasa) pasan++;
    const avisos = [...new Set(rs.flatMap((r) => r.avisos))];
    const tono = rs.map((r) => r.puntajeTono).filter((p): p is number => p !== undefined);
    console.log(`${pasa ? "PASS" : "FAIL"}  ${c.id.padEnd(34)} ${c.categoria.padEnd(12)} ${ok}/${rs.length}${tono.length ? `  tono ${(tono.reduce((a, b) => a + b, 0) / tono.length).toFixed(1)}/5` : ""}`);
    for (const f of [...new Set(rs.flatMap((r) => r.fallas))]) console.log(`        - ${f}`);
    for (const a of avisos) console.log(`        ! aviso: ${a}`);
  }

  const uso = resultados.reduce((a, r) => ({ input: a.input + r.uso.input, output: a.output + r.uso.output, cacheRead: a.cacheRead + r.uso.cacheRead, cacheWrite: a.cacheWrite + r.uso.cacheWrite }), usoVacio());
  const usoJuez = resultados.reduce((a, r) => ({ input: a.input + r.usoJuez.input, output: a.output + r.usoJuez.output, cacheRead: 0, cacheWrite: 0 }), usoVacio());
  const costo = costoUSD(MODELO_IA, uso) + costoUSD(MODELO_RESUMEN, usoJuez);
  const lat = resultados.map((r) => r.latenciaMs);
  const tasa = (pasan / casos.length) * 100;
  const tonos = resultados.map((r) => r.puntajeTono).filter((p): p is number => p !== undefined);
  console.log(`\nTasa de PASS: ${pasan}/${casos.length} (${tasa.toFixed(1)}%)${tonos.length ? ` | tono promedio ${(tonos.reduce((a, b) => a + b, 0) / tonos.length).toFixed(2)}/5 (blando)` : ""}`);
  console.log(`Tokens: entrada ${uso.input}, salida ${uso.output}, caché lectura ${uso.cacheRead}, caché escritura ${uso.cacheWrite} (+ juez ${usoJuez.input}/${usoJuez.output})`);
  console.log(`Costo real: ${usd(costo)} | latencia p50 ${(percentil(lat, 50) / 1000).toFixed(1)} s, p90 ${(percentil(lat, 90) / 1000).toFixed(1)} s`);

  const carpeta = join(dirname(fileURLToPath(import.meta.url)), "resultados");
  mkdirSync(carpeta, { recursive: true });
  const archivo = join(carpeta, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(archivo, JSON.stringify({ modelo: MODELO_IA, casos: casos.length, repeticiones: args.repeticiones, tasaPass: tasa, costoUSD: costo, latenciaP50Ms: percentil(lat, 50), latenciaP90Ms: percentil(lat, 90), uso, resultados }, null, 2));
  console.log(`Reporte: ${archivo}`);
  if (pasan < casos.length) process.exitCode = 1;
}

// Solo corre como CLI, no al importarse.
if (process.argv[1] && /ejecutar\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Error inesperado");
    process.exit(1);
  });
}
