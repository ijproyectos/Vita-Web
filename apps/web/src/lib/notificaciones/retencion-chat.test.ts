import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { borrarPorTandas, DIA_MS, purgarMensajesDeChat, RETENCION_MENSAJES_CHAT_MS, TANDA_MENSAJES } from "./retencion";

type Msg = { id: string; sesion_id: string; created_at: string };
type Ses = { id: string; updated_at: string };

// Cliente falso en memoria: solo lo que usa purgarMensajesDeChat (select/lt/order/limit/in y delete/in).
function clienteFalso(mensajes: Msg[], sesiones: Ses[]) {
  const tablas: Record<string, (Msg | Ses)[]> = { mensajes_chat: mensajes, sesiones_chat: sesiones };
  const cliente = {
    rpc: async (nombre: string, args: { p_corte: string; p_max: number }) => {
      if (nombre !== "purgar_sesiones_vacias") return { data: null, error: { code: "PGRST202", message: "no" } };
      const msgs = tablas.mensajes_chat as Msg[];
      const ses = tablas.sesiones_chat as Ses[];
      const ultima = new Set<string>();
      if (ses.length > 0) ultima.add([...ses].sort((x, y) => (x.updated_at < y.updated_at ? 1 : -1))[0].id);
      const vacias = ses.filter((x) => x.updated_at < args.p_corte && !msgs.some((m) => m.sesion_id === x.id) && !ultima.has(x.id)).slice(0, args.p_max);
      tablas.sesiones_chat = ses.filter((x) => !vacias.includes(x));
      return { data: vacias.length, error: null };
    },
    from(nombre: string) {
      const filas = () => tablas[nombre] as Record<string, string>[];
      return {
        select(cols: string) {
          let res = filas();
          const q = {
            lt(col: string, v: string) {
              res = res.filter((f) => f[col] < v);
              return q;
            },
            order() {
              return q;
            },
            limit(n: number) {
              res = res.slice(0, n);
              return q;
            },
            in(col: string, vals: string[]) {
              res = res.filter((f) => vals.includes(f[col]));
              return q;
            },
            then(ok: (r: { data: unknown; error: null }) => void) {
              ok({ data: res.map((f) => Object.fromEntries(cols.split(",").map((c) => [c.trim(), f[c.trim()]]))), error: null });
            },
          };
          return q;
        },
        delete() {
          return {
            in: async (_col: string, vals: string[]) => {
              tablas[nombre] = filas().filter((f) => !vals.includes(f.id)) as unknown as (Msg | Ses)[];
              if (nombre === "sesiones_chat") {
                tablas.mensajes_chat = (tablas.mensajes_chat as Msg[]).filter((m) => !vals.includes(m.sesion_id));
              }
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { cliente, tablas };
}

const AHORA = Date.parse("2026-11-06T18:00:00Z");
const iso = (diasAtras: number) => new Date(AHORA - diasAtras * DIA_MS).toISOString();

describe("retención del chat", () => {
  it("la ventana es de 7 días", () => {
    expect(RETENCION_MENSAJES_CHAT_MS).toBe(7 * DIA_MS);
  });

  it("borrarPorTandas corta cuando una tanda sale incompleta o al llegar al tope", async () => {
    const respuestas = [10, 10, 4, 10];
    let i = 0;
    expect(await borrarPorTandas(async () => respuestas[i++], 10, 25)).toBe(24);
    expect(i).toBe(3);
    let j = 0;
    expect(await borrarPorTandas(async () => (j++, 10), 10, 3)).toBe(30);
    expect(j).toBe(3);
  });

  it("borra los mensajes de más de 7 días, conserva el resto y quita las sesiones vacías", async () => {
    const { cliente, tablas } = clienteFalso(
      [
        { id: "m1", sesion_id: "viejo", created_at: iso(9) },
        { id: "m2", sesion_id: "activa", created_at: iso(8) },
        { id: "m3", sesion_id: "activa", created_at: iso(6.9) },
        { id: "m4", sesion_id: "activa", created_at: iso(0.1) },
      ],
      [
        { id: "viejo", updated_at: iso(9) },
        { id: "activa", updated_at: iso(0.1) },
      ]
    );
    const r = await purgarMensajesDeChat(cliente, AHORA);
    expect(r).toEqual({ mensajes: 2, sesiones: 1 });
    expect((tablas.mensajes_chat as Msg[]).map((m) => m.id)).toEqual(["m3", "m4"]);
    expect((tablas.sesiones_chat as Ses[]).map((s) => s.id)).toEqual(["activa"]);
  });

  it("nunca borra la sesión más reciente, aunque esté vacía", async () => {
    const { cliente, tablas } = clienteFalso([], [{ id: "unica", updated_at: iso(20) }]);
    expect(await purgarMensajesDeChat(cliente, AHORA)).toEqual({ mensajes: 0, sesiones: 0 });
    expect(tablas.sesiones_chat).toHaveLength(1);
  });

  it("drena un atraso grande en varias tandas", async () => {
    const muchos: Msg[] = Array.from({ length: TANDA_MENSAJES * 2 + 5 }, (_, n) => ({ id: `m${n}`, sesion_id: "s", created_at: iso(10) }));
    const { cliente, tablas } = clienteFalso(muchos, [{ id: "s", updated_at: iso(0.5) }]);
    const r = await purgarMensajesDeChat(cliente, AHORA);
    expect(r).toEqual({ mensajes: TANDA_MENSAJES * 2 + 5, sesiones: 0 });
    expect(tablas.mensajes_chat).toHaveLength(0);
    expect(tablas.sesiones_chat).toHaveLength(1);
  });

  it("un fallo se informa sin lanzar", async () => {
    const roto = {
      from: () => ({
        select: () => ({ lt: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: "XX", message: "mal" } }) }) }) }),
      }),
    } as unknown as SupabaseClient;
    expect(await purgarMensajesDeChat(roto, AHORA)).toEqual({ error: "mal" });
  });
});
