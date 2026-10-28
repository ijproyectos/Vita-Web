import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { ErrorHorarioMedicamentoDuplicado } from "@/lib/medicamentos/duplicados";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/medicamentos/nucleo", () => ({ verificarHorariosDisponibles: vi.fn(), agregar: vi.fn(), listarTodos: vi.fn() }));
const { verificarHorariosDisponibles, agregar, listarTodos } = await import("@/lib/medicamentos/nucleo");
const { ejecutarToolIdempotente } = await import("./pedidos");

const familiar: MiembroFamilia = {
  id: "graciela", vinculoId: "v", nombre: "Graciela", rol: "editar", color: null, relacion: "Madre", conectado: false,
};
const input = { name: "  Metformina  ", scheduled_time: "8:00", recurring_days: ["monday"], persona_id: familiar.id };
function entorno(replay: unknown = null, familia = [familiar]) {
  const consulta = {
    select: vi.fn().mockReturnThis(), match: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: replay, error: null }),
    upsert: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
  };
  const from = vi.fn().mockReturnValue(consulta);
  return {
    consulta, from,
    ctx: { supabase: { from } as unknown as SupabaseClient, usuarioId: "propio", pedidoId: "pedido", sesionId: "sesion", mensajeUsuario: "agregar", respuestaUsuario: "otro" as const, familia },
  };
}
beforeEach(() => vi.resetAllMocks());

describe("alta duplicada antes de confirmación familiar", () => {
  it("Graciela ya lo tiene: no guarda pendientes, no inserta ni propone confirmar", async () => {
    vi.mocked(verificarHorariosDisponibles).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const { ctx, from, consulta } = entorno();
    const resultado = await ejecutarToolIdempotente("add_medication", input, ctx);
    expect(verificarHorariosDisponibles).toHaveBeenCalledWith(ctx.supabase, "graciela", [expect.objectContaining({ nombre: "Metformina", horaProgramada: "08:00", diasRecurrentes: ["lunes"] })]);
    expect(resultado.contenido).toContain("Graciela");
    expect(resultado.accionUI).toBeUndefined();
    expect(consulta.upsert).not.toHaveBeenCalled();
    expect(agregar).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it.each(["graciela", "propio"])("reproduce éxito para %s antes del precheck", async (persona_id) => {
    const resultado = { contenido: "guardado", accionUI: { type: "medication_added", id: "med", name: "Metformina", dose: null, time: "08:00" } };
    const { ctx, consulta } = entorno({ resultado });
    expect(await ejecutarToolIdempotente("add_medication", { ...input, persona_id }, ctx)).toEqual(resultado);
    expect(verificarHorariosDisponibles).not.toHaveBeenCalled();
    expect(consulta.upsert).not.toHaveBeenCalled();
  });

  it("sin acciones_agente el alta propia conserva fallback tras verificar medicamentos", async () => {
    vi.mocked(verificarHorariosDisponibles).mockResolvedValue();
    vi.mocked(agregar).mockResolvedValue({
      id: "med", nombre: "Metformina", dosis: null, hora_programada: "08:00", momento_dia: "mañana", dias_recurrentes: ["lunes"], condicion: null,
    } as never);
    const { ctx, consulta } = entorno();
    consulta.maybeSingle.mockResolvedValue({ data: null, error: { code: "42P01", message: 'relation "acciones_agente" does not exist' } });
    const resultado = await ejecutarToolIdempotente("add_medication", { ...input, persona_id: "propio" }, ctx);
    expect(verificarHorariosDisponibles).toHaveBeenCalledTimes(1);
    expect(agregar).toHaveBeenCalledTimes(1);
    expect(resultado.accionUI?.type).toBe("medication_added");
  });

  it("sin acciones_agente el alta familiar falla cerrado", async () => {
    vi.mocked(verificarHorariosDisponibles).mockResolvedValue();
    const { ctx, consulta } = entorno();
    const faltaTabla = { data: null, error: { code: "42P01", message: 'relation "acciones_agente" does not exist' } };
    consulta.maybeSingle.mockResolvedValue(faltaTabla);
    consulta.limit.mockResolvedValue(faltaTabla);
    const resultado = await ejecutarToolIdempotente("add_medication", input, ctx);
    expect(resultado.contenido).toContain("NO DISPONIBLE");
    expect(resultado.accionUI).toBeUndefined();
    expect(agregar).not.toHaveBeenCalled();
    expect(consulta.upsert).not.toHaveBeenCalled();
  });

  it("un error genérico del replay propio no se trata como tabla ausente", async () => {
    const { ctx, consulta } = entorno();
    consulta.maybeSingle.mockResolvedValue({ data: null, error: { code: "XX000", message: "internal failure" } });
    const resultado = await ejecutarToolIdempotente("add_medication", { ...input, persona_id: "propio" }, ctx);
    expect(resultado.accionUI).toBeUndefined();
    expect(agregar).not.toHaveBeenCalled();
    expect(verificarHorariosDisponibles).not.toHaveBeenCalled();
  });

  it("un lector no consulta medicamentos ni claims", async () => {
    const { ctx, from } = entorno(null, [{ ...familiar, rol: "ver" }]);
    const resultado = await ejecutarToolIdempotente("add_medication", input, ctx);
    expect(resultado.contenido).toContain("Lector");
    expect(from).not.toHaveBeenCalled();
    expect(verificarHorariosDisponibles).not.toHaveBeenCalled();
  });

  it("un fallo de lectura no permite confirmar ni escribir", async () => {
    vi.mocked(verificarHorariosDisponibles).mockRejectedValue(new Error("consulta falló"));
    const { ctx, consulta } = entorno();
    const resultado = await ejecutarToolIdempotente("add_medication", input, ctx);
    expect(resultado.accionUI).toBeUndefined();
    expect(resultado.contenido).toContain("error temporal");
    expect(consulta.upsert).not.toHaveBeenCalled();
    expect(agregar).not.toHaveBeenCalled();
  });

  it("un conflicto final después del precheck propio no emite tarjeta y libera el claim", async () => {
    vi.mocked(verificarHorariosDisponibles).mockResolvedValue();
    vi.mocked(agregar).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const { ctx, consulta } = entorno();
    consulta.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { id: "claim" }, error: null });
    const resultado = await ejecutarToolIdempotente("add_medication", { ...input, persona_id: "propio" }, ctx);
    expect(agregar).toHaveBeenCalledTimes(1);
    expect(resultado.accionUI).toBeUndefined();
    expect(consulta.delete).toHaveBeenCalledTimes(1);
  });

  it("ejecuta el input confirmado guardado y traduce su conflicto final", async () => {
    vi.mocked(verificarHorariosDisponibles).mockResolvedValue();
    vi.mocked(agregar).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const { ctx, consulta } = entorno();
    consulta.limit.mockResolvedValue({ data: [{ id: "confirmada", resultado: { pendiente: {
      tool: "add_medication", input: { ...input, dose: "500 mg" }, destinoId: familiar.id, persona: familiar.nombre, sesionId: "sesion",
    } } }], error: null });
    consulta.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { id: "claim" }, error: null });
    const resultado = await ejecutarToolIdempotente("add_medication", { ...input, dose: "850 mg" }, ctx);
    expect(agregar).toHaveBeenCalledWith(ctx.supabase, familiar.id, expect.objectContaining({ dosis: "500 mg" }));
    expect(resultado.accionUI).toBeUndefined();
    expect(resultado.contenido).toContain("Graciela");
  });

  it.each([{ name: undefined }, { scheduled_time: undefined }, { recurring_days: [3] }, { recurring_days: ["never"] }])("valida input desconocido antes de consultar medicamentos: %j", async (invalido) => {
    const { ctx, consulta } = entorno();
    const resultado = await ejecutarToolIdempotente("add_medication", { ...input, ...invalido }, ctx);
    expect(resultado.accionUI).toBeUndefined();
    expect(verificarHorariosDisponibles).not.toHaveBeenCalled();
    expect(consulta.upsert).not.toHaveBeenCalled();
  });
});

describe("cambio de horario duplicado antes de confirmación familiar", () => {
  const cambio = { medication_name: "Metformina", scheduled_time: "9:00", persona_id: familiar.id };
  const actual = { id: "med-1", nombre: "Metformina", hora_programada: "08:00", dias_recurrentes: ["lunes"] };

  it("el horario nuevo ya existe: avisa sin pedir confirmación ni guardar pendientes", async () => {
    vi.mocked(listarTodos).mockResolvedValue([actual] as never);
    vi.mocked(verificarHorariosDisponibles).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const { ctx, consulta } = entorno();
    const resultado = await ejecutarToolIdempotente("update_schedule", cambio, ctx);
    expect(verificarHorariosDisponibles).toHaveBeenCalledWith(
      ctx.supabase, "graciela",
      [{ nombre: "Metformina", horaProgramada: "09:00", diasRecurrentes: ["lunes"] }],
      ["med-1"]
    );
    expect(resultado.contenido).toContain("Graciela");
    expect(resultado.contenido).toContain("ya está agregado");
    expect(resultado.accionUI).toBeUndefined();
    expect(consulta.upsert).not.toHaveBeenCalled();
  });

  it("una hora inválida se informa como error de entrada", async () => {
    vi.mocked(listarTodos).mockResolvedValue([actual] as never);
    vi.mocked(verificarHorariosDisponibles).mockImplementation(async (_s, _u, candidatos) => {
      const { normalizarHoraDuplicados } = await import("@/lib/medicamentos/duplicados");
      normalizarHoraDuplicados(candidatos[0].horaProgramada);
    });
    const { ctx } = entorno();
    const resultado = await ejecutarToolIdempotente("update_schedule", { ...cambio, scheduled_time: "25:99" }, ctx);
    expect(resultado.contenido).toContain("Revisá los horarios.");
  });
});
