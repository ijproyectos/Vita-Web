import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/turnos/nucleo", () => ({ obtenerPorId: vi.fn(), actualizar: vi.fn(), eliminar: vi.fn(), agregar: vi.fn() }));
const turnos = await import("@/lib/turnos/nucleo");
const { ejecutarToolIdempotente } = await import("./pedidos");

const ID = "11111111-2222-4333-8444-555555555555";
function entorno() {
  const consulta = {
    select: vi.fn().mockReturnThis(), match: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
  };
  const from = vi.fn().mockReturnValue(consulta);
  return {
    consulta,
    ctx: { supabase: { from } as unknown as SupabaseClient, usuarioId: "propio", pedidoId: "pedido", sesionId: "sesion", mensajeUsuario: "borralo", respuestaUsuario: "otro" as const, familia: [] },
  };
}
beforeEach(() => vi.resetAllMocks());

describe("cambiar o borrar un turno desde el chat", () => {
  it("sin un id exacto no busca ni toca nada", async () => {
    const { ctx } = entorno();
    const r = await ejecutarToolIdempotente("delete_appointment", { appointment_id: "cardiologia" }, ctx);
    expect(r.contenido).toContain("appointment_id");
    expect(turnos.obtenerPorId).not.toHaveBeenCalled();
    expect(turnos.eliminar).not.toHaveBeenCalled();
  });

  it("si el turno no existe para esa persona, lo dice sin preguntar", async () => {
    vi.mocked(turnos.obtenerPorId).mockResolvedValue(null);
    const { ctx, consulta } = entorno();
    const r = await ejecutarToolIdempotente("delete_appointment", { appointment_id: ID }, ctx);
    expect(turnos.obtenerPorId).toHaveBeenCalledWith(ctx.supabase, "propio", ID);
    expect(r.contenido).toContain("No encontré ese turno");
    expect(r.accionUI).toBeUndefined();
    expect(consulta.upsert).not.toHaveBeenCalled();
    expect(turnos.eliminar).not.toHaveBeenCalled();
  });

  it("una fecha pasada se rechaza antes de preguntar", async () => {
    vi.mocked(turnos.obtenerPorId).mockResolvedValue({
      id: ID, usuario_id: "propio", especialidad: "Cardiología", fecha: "2099-01-10", hora: "10:30", profesional: null, lugar: null,
      motivo: null, recordatorio: null, acompanado: false, notas: null, created_at: "",
    } as never);
    const { ctx, consulta } = entorno();
    const r = await ejecutarToolIdempotente("update_appointment", { appointment_id: ID, date: "2000-01-01" }, ctx);
    expect(r.contenido).toContain("ya pasó");
    expect(consulta.upsert).not.toHaveBeenCalled();
    expect(turnos.actualizar).not.toHaveBeenCalled();
  });

  it("el ejecutor directo nunca borra sin confirmación", async () => {
    const { ejecutarTool } = await import("@/lib/ai/tools");
    const { ctx } = entorno();
    const r = await ejecutarTool("delete_appointment", { appointment_id: ID }, ctx);
    expect(r.contenido).toMatch(/CONFIRMACI[ÓO]N|requiere la confirmación/);
    expect(turnos.eliminar).not.toHaveBeenCalled();
    expect(turnos.obtenerPorId).not.toHaveBeenCalled();
  });
});
