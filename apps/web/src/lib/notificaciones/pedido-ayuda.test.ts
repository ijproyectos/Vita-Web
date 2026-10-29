import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/familia/nucleo", () => ({ listarMisCuidadores: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./avisos", () => ({ crearAviso: vi.fn() }));
vi.mock("./push", () => ({ enviarPush: vi.fn() }));

const { listarMisCuidadores } = await import("@/lib/familia/nucleo");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { crearAviso } = await import("./avisos");
const { enviarPush } = await import("./push");
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


beforeEach(() => {
  vi.mocked(listarMisCuidadores).mockReset();
  vi.mocked(crearAviso).mockReset();
  vi.mocked(enviarPush).mockReset();
  vi.mocked(listarMisCuidadores).mockResolvedValue([cuidador("c1", "Ana"), cuidador("c2", "Luis")] as never);
  vi.mocked(crearAviso).mockResolvedValue(true);
  vi.mocked(enviarPush).mockResolvedValue({ total: 1, enviados: 1, fallidos: 0, eliminadas: 0 });
});

describe("pedirAyudaAFamilia", () => {
  it("sin cuidadores no entrega", async () => {
    vi.mocked(listarMisCuidadores).mockResolvedValue([]);
    adminCon([]);
    expect(await pedirAyudaAFamilia(sesion, "u1", "mareada")).toEqual({ status: "sin-cuidadores" });
    expect(crearAviso).not.toHaveBeenCalled();
  });

  it("si falla la consulta de recientes, envía igual", async () => {
    adminCon([], { message: "boom" });
    const r = await pedirAyudaAFamilia(sesion, "u1", "mareada");
    expect(r).toEqual({ status: "enviado", nombres: ["Ana", "Luis"] });
    expect(crearAviso).toHaveBeenCalledTimes(2);
  });

  it("mismo motivo reciente es repetido, con los cuidadores del aviso previo y sin entregar", async () => {
    adminCon([{ usuario_id: "c2", datos: { personaId: "u1", motivoClave: "mareada" } }]);
    const r = await pedirAyudaAFamilia(sesion, "u1", " Mareada ");
    expect(r).toEqual({ status: "repetido", nombres: ["Luis"] });
    expect(crearAviso).not.toHaveBeenCalled();
  });

  it("motivo distinto reciente se entrega y guarda motivoClave", async () => {
    adminCon([{ usuario_id: "c1", datos: { personaId: "u1", motivoClave: "mareada" } }]);
    const r = await pedirAyudaAFamilia(sesion, "u1", "Me duele el pecho");
    expect(r.status).toBe("enviado");
    const aviso = vi.mocked(crearAviso).mock.calls[0][2];
    expect(aviso.datos).toEqual({ personaId: "u1", motivoClave: "me duele el pecho" });
  });

  it("tope duro: con 3 pedidos recientes y un motivo NUEVO es tope (no enviado) y no entrega", async () => {
    const fila = (c: string, m: string) => ({ usuario_id: c, datos: { personaId: "u1", motivoClave: m } });
    adminCon([fila("c1", "a"), fila("c2", "a"), fila("c1", "b"), fila("c2", "b"), fila("c1", "c"), fila("c2", "c")]);
    const r = await pedirAyudaAFamilia(sesion, "u1", "algo nuevo");
    expect(r).toEqual({ status: "tope" });
    expect(crearAviso).not.toHaveBeenCalled();
    expect(enviarPush).not.toHaveBeenCalled();
  });

  it("tope duro con el MISMO motivo sigue siendo repetido", async () => {
    const fila = (c: string, m: string) => ({ usuario_id: c, datos: { personaId: "u1", motivoClave: m } });
    adminCon([fila("c1", "a"), fila("c2", "a"), fila("c1", "b"), fila("c1", "c")]);
    expect((await pedirAyudaAFamilia(sesion, "u1", "a")).status).toBe("repetido");
  });

  it("con 2 pedidos recientes todavía entrega", async () => {
    const fila = (c: string, m: string) => ({ usuario_id: c, datos: { personaId: "u1", motivoClave: m } });
    adminCon([fila("c1", "a"), fila("c1", "b")]);
    expect((await pedirAyudaAFamilia(sesion, "u1", "otra cosa")).status).toBe("enviado");
  });

  it("un push lento no frena a los demás ni quita a quien ya tiene el aviso en el feed", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      adminCon([]);
      vi.mocked(enviarPush).mockImplementationOnce(() => new Promise(() => {}));
      const p = pedirAyudaAFamilia(sesion, "u1", "mareada");
      await vi.advanceTimersByTimeAsync(5_001);
      expect(await p).toEqual({ status: "enviado", nombres: ["Ana", "Luis"] });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("si el push falla, el cuidador igual cuenta como avisado", async () => {
    adminCon([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(enviarPush).mockRejectedValue(new Error("x"));
    expect(await pedirAyudaAFamilia(sesion, "u1", "mareada")).toEqual({ status: "enviado", nombres: ["Ana", "Luis"] });
    warn.mockRestore();
  });

  it("si fallan todas las filas del feed es error, nunca enviado", async () => {
    adminCon([]);
    vi.mocked(crearAviso).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(false);
    const r = await pedirAyudaAFamilia(sesion, "u1", "mareada");
    expect(r.status).toBe("error");
    expect(enviarPush).not.toHaveBeenCalled();
  });

  it("entrega parcial: enviado solo con los nombres cuya fila del feed se guardó", async () => {
    adminCon([]);
    vi.mocked(crearAviso).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await pedirAyudaAFamilia(sesion, "u1", "mareada")).toEqual({ status: "enviado", nombres: ["Luis"] });
  });
});
