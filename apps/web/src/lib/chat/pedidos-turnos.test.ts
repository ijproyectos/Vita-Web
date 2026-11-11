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
    expect(r.contenido).toContain("ya pasaron");
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

describe("ejecutar un turno confirmado", () => {
  const turno = {
    id: ID, usuario_id: "propio", especialidad: "Cardiología", fecha: "2099-01-10", hora: "10:30:00", profesional: null, lugar: null,
    motivo: null, recordatorio: null, acompanado: false, notas: null, created_at: "",
  };
  const accion = (tool: string, extra: Record<string, unknown> = {}) => ({
    tool, input: { appointment_id: ID }, destinoId: "propio", persona: "", sesionId: "sesion",
    objetivo: { turnoId: ID, snapshotTurno: { id: ID, especialidad: "Cardiología", fecha: "2099-01-10", hora: "10:30" }, texto: "¿Borro…?", ...extra },
  });
  const ctxEj = () => ({ supabase: {} as SupabaseClient, usuarioId: "propio", familia: [] });

  it("borra por id y avisa con su tarjeta", async () => {
    const { ejecutarObjetivo } = await import("./pedidos");
    vi.mocked(turnos.obtenerPorId).mockResolvedValue(turno as never);
    const r = await ejecutarObjetivo("delete_appointment", accion("delete_appointment"), ctxEj());
    expect(turnos.eliminar).toHaveBeenCalledWith(expect.anything(), "propio", ID);
    expect(r.accionUI).toEqual({ type: "appointment_deleted" });
    expect(r.textoUsuario).toContain("borré el turno de Cardiología");
  });

  it("si el turno cambió entre la pregunta y el sí, no toca nada", async () => {
    const { ejecutarObjetivo } = await import("./pedidos");
    vi.mocked(turnos.obtenerPorId).mockResolvedValue({ ...turno, hora: "12:00" } as never);
    const r = await ejecutarObjetivo("delete_appointment", accion("delete_appointment"), ctxEj());
    expect(turnos.eliminar).not.toHaveBeenCalled();
    expect(r.accionUI).toBeUndefined();
    expect(r.codigo).toBe("confirmacion_cambio");
  });

  it("cambia con los cambios guardados (no con lo que reformule el modelo)", async () => {
    const { ejecutarObjetivo } = await import("./pedidos");
    vi.mocked(turnos.obtenerPorId).mockResolvedValue(turno as never);
    vi.mocked(turnos.actualizar).mockResolvedValue(turno as never);
    const r = await ejecutarObjetivo("update_appointment", accion("update_appointment", { cambiosTurno: { hora: "09:00" } }), ctxEj());
    expect(turnos.actualizar).toHaveBeenCalledWith(expect.anything(), "propio", ID, { hora: "09:00" });
    expect(r.accionUI).toEqual({ type: "appointment_updated" });
  });

  it("si el núcleo falla (por ejemplo, no borró nada), no informa éxito", async () => {
    const { ejecutarObjetivo } = await import("./pedidos");
    vi.mocked(turnos.obtenerPorId).mockResolvedValue(turno as never);
    vi.mocked(turnos.eliminar).mockRejectedValue(new Error("No se pudo eliminar el turno."));
    const r = await ejecutarObjetivo("delete_appointment", accion("delete_appointment"), ctxEj());
    expect(r.accionUI).toBeUndefined();
    expect(r.codigo).toBe("confirmacion_no_verificada");
  });

  it("sin permiso de editar a esa persona, no ejecuta", async () => {
    const { ejecutarObjetivo } = await import("./pedidos");
    const r = await ejecutarObjetivo("delete_appointment", { ...accion("delete_appointment"), destinoId: "otra" }, ctxEj());
    expect(turnos.obtenerPorId).not.toHaveBeenCalled();
    expect(r.codigo).toBe("confirmacion_sin_permiso");
  });
});
