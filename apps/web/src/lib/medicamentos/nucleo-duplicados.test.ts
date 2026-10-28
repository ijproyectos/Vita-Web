import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorHorarioMedicamentoDuplicado } from "./duplicados";
import type { DatosNuevoMedicamento, Medicamento } from "./tipos";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventario/nucleo", () => ({ ajustarStock: vi.fn(), buscarInventarioId: vi.fn() }));
const { buscarInventarioId } = await import("@/lib/inventario/nucleo");
const { agregar, agregarMultiMomento, actualizarHorario, actualizarGrupo, verificarHorariosDisponibles } = await import("./nucleo");

const fila = (cambios: Partial<Medicamento> = {}): Medicamento => ({
  id: "m1", usuario_id: "persona", nombre: "Losartán", dosis: "50", unidad: "mg",
  hora_programada: "08:00", momento_dia: "mañana", condicion: null, dias_recurrentes: [],
  frecuencia: null, con_comida: "no-importa", duracion: null, notas: null,
  inventario_id: null, created_at: "", updated_at: "", ...cambios,
});
const alta: DatosNuevoMedicamento = { nombre: " losartán ", horaProgramada: "8:00", momentoDia: "mañana" };

// Builder diferido: registra mutaciones al await y respeta los filtros recibidos.
function baseFalsa(filas: Medicamento[] = [], falloLectura = false, falloEscritura: {code: string; message: string} | null = null) {
  const mutaciones: { tabla: string; operacion: string; valores: unknown; filtros: Record<string, unknown> }[] = [];
  const lecturas: Record<string, unknown>[] = [];
  const from = vi.fn((tabla: string) => {
    let operacion = "select";
    let valores: unknown;
    let singular = false;
    const filtros: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      insert: (v: unknown) => { operacion = "insert"; valores = v; return builder; },
      update: (v: unknown) => { operacion = "update"; valores = v; return builder; },
      delete: () => { operacion = "delete"; return builder; },
      eq: (k: string, v: unknown) => { filtros[k] = v; return builder; },
      in: (k: string, v: unknown) => { filtros[k] = v; return builder; },
      order: () => builder,
      single: () => { singular = true; return builder; },
      then: (resolve: (v: unknown) => unknown) => {
        if (operacion === "select") {
          lecturas.push({ ...filtros });
          const data = filas.filter((f) => Object.entries(filtros).every(([k, v]) => Array.isArray(v) ? v.includes(f[k as keyof Medicamento]) : f[k as keyof Medicamento] === v));
          return Promise.resolve({ data, error: falloLectura ? { message: "sin conexión" } : null }).then(resolve);
        }
        mutaciones.push({ tabla, operacion, valores, filtros: { ...filtros } });
        return Promise.resolve({ data: singular ? valores : Array.isArray(valores) ? valores : [valores], error: falloEscritura }).then(resolve);
      },
    };
    return builder;
  });
  return { cliente: { from } as unknown as SupabaseClient, mutaciones, lecturas };
}

beforeEach(() => vi.mocked(buscarInventarioId).mockReset());

describe("núcleo impide duplicados antes de mutar", () => {
  it.each([undefined, "100", "50"])("dosis %s no evade un duplicado", async (dosis) => {
    const db = baseFalsa([fila()]);
    await expect(agregar(db.cliente, "persona", { ...alta, dosis })).rejects.toBeInstanceOf(ErrorHorarioMedicamentoDuplicado);
    expect(db.mutaciones).toEqual([]);
  });
  it("no permite que días inválidos evadan la comprobación", async () => {
    const db = baseFalsa([fila()]);
    await expect(agregar(db.cliente, "persona", { ...alta, diasRecurrentes: ["Lunes"] as never })).rejects.toThrow("días");
    expect(db.mutaciones).toEqual([]);
  });
  it("consulta una sola vez por persona y compara candidatos entre sí", async () => {
    const db = baseFalsa();
    await expect(verificarHorariosDisponibles(db.cliente, "persona", [alta, { ...alta, horaProgramada: "08:00:00" }])).rejects.toBeInstanceOf(ErrorHorarioMedicamentoDuplicado);
    expect(db.lecturas).toEqual([{ usuario_id: "persona" }]);
  });
  it("valida todo el lote antes de consultar inventario o insertar", async () => {
    for (const horas of [["09:00", "8:00"], ["09:00", "9:00"], ["09:00", "24:00"]]) {
      const db = baseFalsa([fila()]);
      await expect(agregarMultiMomento(db.cliente, "persona", { nombre: alta.nombre, tomas: horas.map((hora) => ({ hora, conComida: "con" })) })).rejects.toThrow();
      expect(db.mutaciones).toEqual([]);
    }
    expect(buscarInventarioId).not.toHaveBeenCalled();
  });
  it("alta múltiple conserva stock y usa un INSERT de horas canónicas", async () => {
    vi.mocked(buscarInventarioId).mockResolvedValue("stock");
    const db = baseFalsa();
    await agregarMultiMomento(db.cliente, "persona", { nombre: "Losartán", tomas: [{ hora: "8:00", conComida: "con" }, { hora: "22:00:00", conComida: "antes" }] });
    expect(db.mutaciones).toHaveLength(1);
    expect(db.mutaciones[0].valores).toEqual(expect.arrayContaining([
      expect.objectContaining({ hora_programada: "08:00", inventario_id: "stock" }),
      expect.objectContaining({ hora_programada: "22:00", inventario_id: "stock" }),
    ]));
  });
  it.each(["persona distinta", "hora distinta", "días disjuntos", "nombre distinto"])("permite %s", async (caso) => {
    const existente = fila(caso === "persona distinta" ? { usuario_id: "otra" } : caso === "días disjuntos" ? { dias_recurrentes: ["lunes"] } : {});
    const db = baseFalsa([existente]);
    await agregar(db.cliente, "persona", { ...alta, ...(caso === "hora distinta" ? { horaProgramada: "9:00" } : caso === "nombre distinto" ? { nombre: "Losartan" } : caso === "días disjuntos" ? { diasRecurrentes: ["martes"] } : {}) });
    expect(db.mutaciones).toHaveLength(1);
  });
  it("actualiza días con identidad final y excluye solo su propia fila", async () => {
    const db = baseFalsa([fila({ dias_recurrentes: ["lunes"] }), fila({ id: "m2", dias_recurrentes: ["martes"] })]);
    await actualizarHorario(db.cliente, "persona", "m1", { horaProgramada: "8:00" });
    expect(db.mutaciones).toHaveLength(1);
    db.mutaciones.length = 0;
    await expect(actualizarHorario(db.cliente, "persona", "m1", { diasRecurrentes: ["martes"] })).rejects.toBeInstanceOf(ErrorHorarioMedicamentoDuplicado);
    expect(db.mutaciones).toEqual([]);
  });
  it("grupo verifica conflictos externos y lote final antes de escribir", async () => {
    for (const tomas of [[{ id: "m1", hora: "9:00", conComida: "con" as const }], [{ id: "m1", hora: "10:00", conComida: "con" as const }, { hora: "10:00:00", conComida: "antes" as const }]]) {
      const db = baseFalsa([fila(), fila({ id: "externo", hora_programada: "09:00" })]);
      await expect(actualizarGrupo(db.cliente, "persona", ["m1", "id-inexistente"], { nombre: "LOSARTÁN", dosis: "100", unidad: "mg", tomas })).rejects.toBeInstanceOf(ErrorHorarioMedicamentoDuplicado);
      expect(db.mutaciones).toEqual([]);
    }
  });
  it("grupo conserva días por fila y permite igual hora con días disjuntos", async () => {
    const db = baseFalsa([fila({ dias_recurrentes: ["lunes"] }), fila({ id: "m2", hora_programada: "09:00", dias_recurrentes: ["martes"] })]);
    await actualizarGrupo(db.cliente, "persona", ["m1", "m2"], { nombre: "Losartán", dosis: "50", unidad: "mg", tomas: [{ id: "m1", hora: "8:00", conComida: "con" }, { id: "m2", hora: "08:00:00", conComida: "con" }] });
    expect(db.mutaciones).toHaveLength(2);
  });
  it.each([false, true])("rechaza colisiones transitorias del grupo antes de mutar (swap=%s)", async (swap) => {
    const db = baseFalsa([fila(), fila({ id: "m2", hora_programada: "09:00" })]);
    const tomas = [{ id: "m1", hora: "09:00", conComida: "con" as const }, ...(swap ? [{ id: "m2", hora: "08:00", conComida: "con" as const }] : [])];
    await expect(actualizarGrupo(db.cliente, "persona", ["m1", "m2"], { nombre: "Losartán", dosis: "50", unidad: "mg", tomas })).rejects.toThrow("Guardá primero un horario libre");
    expect(db.mutaciones).toEqual([]);
  });
  it("todas las escrituras fallan cerrado si no pueden leer", async () => {
    const db = baseFalsa([fila()], true);
    const operaciones = [
      () => agregar(db.cliente, "persona", alta),
      () => agregarMultiMomento(db.cliente, "persona", { nombre: "Losartán", momentos: ["mañana"] }),
      () => actualizarHorario(db.cliente, "persona", "m1", { horaProgramada: "09:00" }),
      () => actualizarGrupo(db.cliente, "persona", ["m1"], { nombre: "Losartán", dosis: "50", unidad: "mg", tomas: [{ id: "m1", hora: "09:00", conComida: "con" }] }),
    ];
    for (const operacion of operaciones) await expect(operacion()).rejects.toThrow("sin conexión");
    expect(db.mutaciones).toEqual([]);
    expect(buscarInventarioId).not.toHaveBeenCalled();
  });
  it("una hora histórica inválida de otro nombre no bloquea el alta", async () => {
    const db = baseFalsa([fila({ nombre: "Otro", hora_programada: "99:99" })]);
    await agregar(db.cliente, "persona", alta);
    expect(db.mutaciones).toHaveLength(1);
  });
  it("traduce conflictos concurrentes DB al mismo error de dominio", async () => {
    const db = baseFalsa([], false, { code: "23P01", message: 'conflicts with exclusion constraint "medicamentos_sin_horarios_duplicados"' });
    await expect(agregar(db.cliente, "persona", alta)).rejects.toBeInstanceOf(ErrorHorarioMedicamentoDuplicado);
  });
});
