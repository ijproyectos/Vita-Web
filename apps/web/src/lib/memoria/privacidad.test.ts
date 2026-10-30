import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/familia/nucleo", () => ({ listarFamilia: async () => [] }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { olvidarTodo } from "./privacidad";

type Llamada = { tabla: string; op: string; valores?: Record<string, unknown>; filtros: string[] };

// Cliente falso: registra cada update y contesta filas con id; la RPC responde "función inexistente" (040 sin aplicar).
function clienteFalso(rpcResponde: { data?: unknown; error?: { code: string; message: string } | null }) {
  const llamadas: Llamada[] = [];
  const supabase = {
    rpc: async () => ({ data: null, error: null, ...rpcResponde }),
    from(tabla: string) {
      const llamada: Llamada = { tabla, op: "", filtros: [] };
      const b: Record<string, unknown> = {};
      b.update = (valores: Record<string, unknown>) => {
        llamada.op = "update";
        llamada.valores = valores;
        llamadas.push(llamada);
        return b;
      };
      for (const f of ["eq", "neq"]) b[f] = (c: string, v: unknown) => (llamada.filtros.push(`${f}:${c}=${String(v)}`), b);
      b.select = async () => ({ data: [{ id: "a" }, { id: "b" }], error: null });
      return b;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, llamadas };
}

describe("olvidarTodo", () => {
  it("con la RPC: devuelve los conteos", async () => {
    const { supabase } = clienteFalso({ data: [{ o_recuerdos: 3, o_mensajes: 5 }] });
    expect(await olvidarTodo(supabase, "u1")).toEqual({ ok: true, recuerdos: 3, mensajes: 5 });
  });
  it("sin la 040: borra los recuerdos Y excluye TODOS los mensajes del usuario", async () => {
    const { supabase, llamadas } = clienteFalso({ error: { code: "PGRST202", message: "Could not find the function" } });
    const r = await olvidarTodo(supabase, "u1");
    expect(r).toEqual({ ok: true, recuerdos: 2, mensajes: 2 });
    const memorias = llamadas.find((l) => l.tabla === "memorias")!;
    expect(memorias.valores).toMatchObject({ estado: "borrado", texto: null });
    const mensajes = llamadas.find((l) => l.tabla === "mensajes_chat")!;
    expect(mensajes.valores).toEqual({ excluido_memoria: true });
    expect(mensajes.filtros).toContain("eq:usuario_id=u1");
  });
  it("un error real de la RPC no sigue por el camino alternativo", async () => {
    const { supabase, llamadas } = clienteFalso({ error: { code: "42501", message: "permission denied" } });
    expect(await olvidarTodo(supabase, "u1")).toEqual({ ok: false });
    expect(llamadas).toHaveLength(0);
  });
});
