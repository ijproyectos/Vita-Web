import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/familia/nucleo", () => ({ listarMisCuidadores: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./avisos", () => ({ entregarAviso: vi.fn() }));

const { listarMisCuidadores } = await import("@/lib/familia/nucleo");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { entregarAviso } = await import("./avisos");
const { pedirAyudaAFamilia } = await import("./pedido-ayuda");

const cuidador = (id: string, nombre: string) => ({ vinculoId: `v-${id}`, cuidadorId: id, nombre, rol: "editar", relacion: null });

// Sesión: solo se lee el nombre del perfil.
const sesion = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: "elsa gomez" } }) }) }) }),
} as unknown as SupabaseClient;

// Admin: la consulta de avisos recientes devuelve `filas` o un error.
function adminCon(filas: unknown[], error: unknown = null) {
  const consulta = { select: () => consulta, eq: () => consulta, contains: () => consulta, gte: () => consulta, limit: async () => ({ data: filas, error }) };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => consulta } as never);
}

const ok = { feed: true };

beforeEach(() => {
  vi.mocked(listarMisCuidadores).mockReset();
  vi.mocked(entregarAviso).mockReset();
  vi.mocked(listarMisCuidadores).mockResolvedValue([cuidador("c1", "Ana"), cuidador("c2", "Luis")] as never);
  vi.mocked(entregarAviso).mockResolvedValue(ok as never);
});

describe("pedirAyudaAFamilia", () => {
  it("sin cuidadores no entrega", async () => {
    vi.mocked(listarMisCuidadores).mockResolvedValue([]);
    adminCon([]);
    expect(await pedirAyudaAFamilia(sesion, "u1", "mareada")).toEqual({ status: "sin-cuidadores" });
    expect(entregarAviso).not.toHaveBeenCalled();
  });

  it("si falla la consulta de recientes, envía igual", async () => {
    adminCon([], { message: "boom" });
    const r = await pedirAyudaAFamilia(sesion, "u1", "mareada");
    expect(r).toEqual({ status: "enviado", nombres: ["Ana", "Luis"] });
    expect(entregarAviso).toHaveBeenCalledTimes(2);
  });

  it("mismo motivo reciente es repetido, con los cuidadores del aviso previo y sin entregar", async () => {
    adminCon([{ usuario_id: "c2", datos: { personaId: "u1", motivoClave: "mareada" } }]);
    const r = await pedirAyudaAFamilia(sesion, "u1", " Mareada ");
    expect(r).toEqual({ status: "repetido", nombres: ["Luis"] });
    expect(entregarAviso).not.toHaveBeenCalled();
  });

  it("motivo distinto reciente se entrega y guarda motivoClave", async () => {
    adminCon([{ usuario_id: "c1", datos: { personaId: "u1", motivoClave: "mareada" } }]);
    const r = await pedirAyudaAFamilia(sesion, "u1", "Me duele el pecho");
    expect(r.status).toBe("enviado");
    const aviso = vi.mocked(entregarAviso).mock.calls[0][2];
    expect(aviso.datos).toEqual({ personaId: "u1", motivoClave: "me duele el pecho" });
  });

  it("tope duro: con 3 pedidos recientes, aun con motivo distinto es repetido y no entrega", async () => {
    const fila = (c: string, m: string) => ({ usuario_id: c, datos: { personaId: "u1", motivoClave: m } });
    adminCon([fila("c1", "a"), fila("c2", "a"), fila("c1", "b"), fila("c2", "b"), fila("c1", "c"), fila("c2", "c")]);
    const r = await pedirAyudaAFamilia(sesion, "u1", "algo nuevo");
    expect(r).toEqual({ status: "repetido", nombres: ["Ana", "Luis"] });
    expect(entregarAviso).not.toHaveBeenCalled();
  });

  it("con 2 pedidos recientes todavía entrega", async () => {
    const fila = (c: string, m: string) => ({ usuario_id: c, datos: { personaId: "u1", motivoClave: m } });
    adminCon([fila("c1", "a"), fila("c1", "b")]);
    expect((await pedirAyudaAFamilia(sesion, "u1", "otra cosa")).status).toBe("enviado");
  });

  it("un push lento no frena a los demás: pasado el plazo se lo da por no entregado", async () => {
    vi.useFakeTimers();
    try {
      adminCon([]);
      vi.mocked(entregarAviso).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(ok as never);
      const p = pedirAyudaAFamilia(sesion, "u1", "mareada");
      await vi.advanceTimersByTimeAsync(5_001);
      expect(await p).toEqual({ status: "enviado", nombres: ["Luis"] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("si fallan todas las entregas es error, nunca enviado", async () => {
    adminCon([]);
    vi.mocked(entregarAviso).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ feed: false } as never);
    const r = await pedirAyudaAFamilia(sesion, "u1", "mareada");
    expect(r.status).toBe("error");
  });

  it("entrega parcial: enviado solo con los nombres entregados", async () => {
    adminCon([]);
    vi.mocked(entregarAviso).mockResolvedValueOnce({ feed: false } as never).mockResolvedValueOnce(ok as never);
    expect(await pedirAyudaAFamilia(sesion, "u1", "mareada")).toEqual({ status: "enviado", nombres: ["Luis"] });
  });
});
