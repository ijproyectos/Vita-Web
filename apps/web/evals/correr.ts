// Runner de evals de vita. Por defecto NO llama a la API: imprime el plan y una cota de costo.
// Solo llama a Anthropic con --ejecutar Y ANTHROPIC_API_KEY presente (cuesta plata real).
//
// Uso: npm run evals [-- --ejecutar] [--caso <id>] [--max-usd <n>]
//
// Reusa el SYSTEM_PROMPT, las tools y los bloques de contexto REALES de la app (importados, nunca
// copiados). Las tools se simulan: el resultado sale del contexto del caso y de `resolverDestino`
// (la regla real de permisos/confirmación); no se prueba RLS ni persistencia.
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_TOKENS_CHAT, MODELO_IA } from "@/lib/ai/modelo";
import { mensajeEsperandoConfirmacion, mensajeFaltaConfirmacion, resolverDestino, TOOLS_DE_ESCRITURA } from "@/lib/ai/destino";
import { armarSystemChat, bloqueHoy, construirContextoPersonas, contextoDinamicoChat, SYSTEM_PROMPT } from "@/lib/ai/prompt-chat";
import { TOOLS } from "@/lib/ai/tools-definiciones";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { AHORA, CASOS, HOY_ISO, USUARIO_ID } from "./casos";
import { cotaSuperiorCaso, costoUSD, evaluarCaso, hayErrores, type UsoEval } from "./evaluar";
import type { CasoEval, LlamadaTool, RespuestaEval, ResultadoCaso } from "./tipos";

const MAX_VUELTAS = 6; // igual que MAX_TURNOS_TOOL_USE de la app

export function parsearArgumentos(argv: string[]): { ejecutar: boolean; caso?: string; maxUsd: number } {
  const valor = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const max = Number(valor("--max-usd") ?? 1);
  return { ejecutar: argv.includes("--ejecutar"), caso: valor("--caso"), maxUsd: Number.isFinite(max) && max > 0 ? max : 1 };
}

function miembros(caso: CasoEval): MiembroFamilia[] {
  return caso.contexto.familia.map((f) => ({
    vinculoId: `v-${f.id}`,
    id: f.id,
    nombre: f.nombre,
    color: null,
    rol: f.rol,
    relacion: f.relacion ?? null,
    conectado: false,
  }));
}

export function sistemaDelCaso(caso: CasoEval): Anthropic.TextBlockParam[] {
  const familia = miembros(caso);
  const abierto = familia.find((f) => f.id === caso.contexto.abiertoId);
  return armarSystemChat(
    contextoDinamicoChat({
      contextoPerfil: construirContextoPersonas(USUARIO_ID, familia, abierto),
      contextoHoy: bloqueHoy(caso.contexto.medicamentosHoy, caso.contexto.turnosHoy),
      ahora: AHORA,
      hoyISO: HOY_ISO,
    })
  );
}

/** Resultado simulado de una tool, aplicando la misma regla de destino/confirmación que la app. */
export function simularTool(caso: CasoEval, uso: LlamadaTool): string {
  const familia = miembros(caso);
  const destino = resolverDestino(uso.nombre, uso.input, { usuarioId: USUARIO_ID, familia, abiertoId: caso.contexto.abiertoId, mensajeUsuario: caso.mensaje });
  if (!destino.ok) return destino.contenido;
  if (destino.requiereConfirmacion && uso.input.confirmado !== true) {
    if (uso.nombre === "delete_schedule" || uso.nombre === "update_schedule") {
      return mensajeEsperandoConfirmacion(`¿Confirmás ${uso.nombre === "delete_schedule" ? "borrar" : "cambiar"} ${String(uso.input.medication_name ?? "el medicamento")}?`);
    }
    return mensajeFaltaConfirmacion(destino.persona ?? "esa persona");
  }
  if (destino.requiereConfirmacion && uso.nombre !== "delete_schedule" && uso.nombre !== "update_schedule" && !caso.confirmacionPrevia) {
    return mensajeFaltaConfirmacion(destino.persona ?? "esa persona"); // el servidor exige una confirmación real, no la del modelo
  }
  const fijo = caso.resultadosTool?.[uso.nombre];
  if (fijo) return fijo;
  switch (uso.nombre) {
    case "list_today_medications":
    case "list_all_medications":
      return caso.contexto.medicamentosHoy.join("; ") || "No hay medicamentos.";
    case "list_today_appointments":
      return caso.contexto.turnosHoy.join("; ") || "No hay turnos hoy.";
    default:
      return TOOLS_DE_ESCRITURA.has(uso.nombre) ? "Listo: se guardó correctamente." : "OK.";
  }
}

export function tokensPrefijoEstimados(): number {
  return Math.ceil((JSON.stringify(TOOLS).length + SYSTEM_PROMPT.length) / 4);
}

async function correrCaso(
  cliente: Anthropic,
  caso: CasoEval,
  gastado: () => number,
  maxUsd: number,
  uso: UsoEval
): Promise<{ respuesta: RespuestaEval; cortado: boolean }> {
  const mensajes: Anthropic.MessageParam[] = [...(caso.historial ?? []).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: caso.mensaje }];
  const system = sistemaDelCaso(caso);
  const llamadas: LlamadaTool[] = [];
  let texto = "";
  const peorLlamada = cotaSuperiorCaso(tokensPrefijoEstimados(), MAX_TOKENS_CHAT, 1);
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (gastado() + peorLlamada > maxUsd) return { respuesta: { texto, llamadas }, cortado: true };
    const r = await cliente.messages.create({
      model: MODELO_IA,
      max_tokens: MAX_TOKENS_CHAT,
      system,
      tools: TOOLS,
      messages: mensajes,
      cache_control: { type: "ephemeral" },
    });
    uso.input += r.usage.input_tokens;
    uso.output += r.usage.output_tokens;
    uso.cacheLectura += r.usage.cache_read_input_tokens ?? 0;
    uso.cacheEscritura += r.usage.cache_creation_input_tokens ?? 0;
    texto += r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    mensajes.push({ role: "assistant", content: r.content });
    if (r.stop_reason !== "tool_use") break;
    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const u of usos) {
      const llamada = { nombre: u.name, input: (u.input ?? {}) as Record<string, unknown> };
      llamadas.push(llamada);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: simularTool(caso, llamada) });
    }
    mensajes.push({ role: "user", content: resultados });
  }
  return { respuesta: { texto, llamadas }, cortado: false };
}

const usd = (n: number) => `US$${n.toFixed(4)}`;

async function main() {
  const args = parsearArgumentos(process.argv.slice(2));
  const casos = args.caso ? CASOS.filter((c) => c.id === args.caso) : CASOS;
  if (casos.length === 0) {
    console.error(`No existe el caso "${args.caso}". Casos: ${CASOS.map((c) => c.id).join(", ")}`);
    process.exit(2);
  }
  const prefijo = tokensPrefijoEstimados();
  const cota = casos.length * cotaSuperiorCaso(prefijo, MAX_TOKENS_CHAT, MAX_VUELTAS);
  const tipico = casos.length * costoUSD({ input: 300, output: 400, cacheLectura: prefijo, cacheEscritura: 0 }) * 2;

  console.log(`Modelo: ${MODELO_IA} | casos: ${casos.length} | prefijo (tools + prompt estático): ~${prefijo} tokens`);
  for (const c of casos) console.log(`  - ${c.id}${c.aspiracional ? " (aspiracional)" : ""}: ${c.descripcion}`);
  console.log(`Costo estimado: típico ~${usd(tipico)} (con caché caliente) | cota superior ${usd(cota)} (6 vueltas por caso, sin lecturas de caché)`);

  if (!args.ejecutar) {
    console.log("\nDry-run: no se llamó a la API. Para ejecutar de verdad (cuesta plata): npm run evals -- --ejecutar [--caso <id>] [--max-usd <n>]");
    return;
  }
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* sin .env.local: puede venir del entorno */
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nFalta ANTHROPIC_API_KEY (en el entorno o en apps/web/.env.local). No se llamó a la API.");
    process.exit(2);
  }
  console.log(`\nEjecutando contra la API (tope ${usd(args.maxUsd)})...\n`);
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const cliente = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });
  const uso: UsoEval = { input: 0, output: 0, cacheLectura: 0, cacheEscritura: 0 };
  const resultados: ResultadoCaso[] = [];
  let cortado = false;
  for (const caso of casos) {
    try {
      const r = await correrCaso(cliente, caso, () => costoUSD(uso), args.maxUsd, uso);
      if (r.cortado) {
        cortado = true;
        console.log(`Tope de ${usd(args.maxUsd)} alcanzado antes de "${caso.id}": se corta acá.`);
        break;
      }
      const res = evaluarCaso(caso, r.respuesta);
      resultados.push(res);
      console.log(`${res.ok ? "PASA " : res.aspiracional ? "AVISO" : "FALLA"}  ${caso.id}${res.fallas.length ? `\n         ${res.fallas.join("\n         ")}` : ""}`);
    } catch (e) {
      resultados.push({ id: caso.id, ok: false, aspiracional: !!caso.aspiracional, fallas: [`error de la API: ${e instanceof Error ? e.message : "desconocido"}`] });
      console.log(`FALLA  ${caso.id} (error de la API)`);
    }
  }
  const pasan = resultados.filter((r) => r.ok).length;
  console.log(`\n${pasan}/${resultados.length} casos pasan (${resultados.filter((r) => !r.ok && r.aspiracional).length} avisos aspiracionales).`);
  console.log(`Tokens: entrada ${uso.input}, salida ${uso.output}, caché lectura ${uso.cacheLectura}, caché escritura ${uso.cacheEscritura} | costo ${usd(costoUSD(uso))}`);
  if (cortado || hayErrores(resultados)) process.exitCode = 1;
}

// Solo corre como CLI, no al importarse desde los tests.
if (process.argv[1] && /correr\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Error inesperado");
    process.exit(1);
  });
}
