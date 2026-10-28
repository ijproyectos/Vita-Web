import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIA_MS, esErrorTablaInexistente, limiteDeRetencion, purgarAnteriores, RETENCIONES } from "./retencion";

function falso(resp: { data?: unknown[] | null; error?: { code?: string; message: string } | null } | "lanza") {
  const llamadas: { tabla?: string; col?: string; limite?: string } = {};
  const cliente = {
    from(tabla: string) {
      llamadas.tabla = tabla;
      return {
        delete: () => ({
          lt: (col: string, limite: string) => {
            llamadas.col = col;
            llamadas.limite = limite;
            return {
              select: async () => {
                if (resp === "lanza") throw new Error("boom");
                return { data: resp.data ?? null, error: resp.error ?? null };
              },
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { cliente, llamadas };
}

const AHORA = Date.parse("2026-10-28T12:00:00Z");

describe("retención", () => {
  it("las ventanas pedidas", () => {
    expect(RETENCIONES.registros_chat.ms).toBe(90 * DIA_MS);
    expect(RETENCIONES.limites_pedidos.ms).toBe(2 * DIA_MS);
    expect(RETENCIONES.limites_pedidos.columna).toBe("ventana_inicio");
    expect(RETENCIONES.acciones_agente.ms).toBe(48 * 3_600_000);
  });
  it("limiteDeRetencion", () => {
    expect(limiteDeRetencion(AHORA, 2 * DIA_MS)).toBe("2026-10-26T12:00:00.000Z");
  });
  it("esErrorTablaInexistente", () => {
    expect(esErrorTablaInexistente({ code: "PGRST205" })).toBe(true);
    expect(esErrorTablaInexistente({ code: "42P01" })).toBe(true);
    expect(esErrorTablaInexistente({ code: "23505" })).toBe(false);
    expect(esErrorTablaInexistente(null)).toBe(false);
  });
  it("purga y cuenta filas", async () => {
    const { cliente, llamadas } = falso({ data: [{}, {}, {}] });
    expect(await purgarAnteriores(cliente, "acciones_agente", AHORA)).toBe(3);
    expect(llamadas).toEqual({ tabla: "acciones_agente", col: "created_at", limite: "2026-10-26T12:00:00.000Z" });
  });
  it("limites_pedidos se purga por ventana_inicio", async () => {
    const { cliente, llamadas } = falso({ data: [{}] });
    expect(await purgarAnteriores(cliente, "limites_pedidos", AHORA)).toBe(1);
    expect(llamadas).toEqual({ tabla: "limites_pedidos", col: "ventana_inicio", limite: "2026-10-26T12:00:00.000Z" });
  });
  it("tabla inexistente degrada a 0", async () => {
    const { cliente } = falso({ error: { code: "42P01", message: "no existe" } });
    expect(await purgarAnteriores(cliente, "registros_chat", AHORA)).toBe(0);
  });
  it("otro error se informa sin lanzar", async () => {
    expect(await purgarAnteriores(falso({ error: { code: "XX", message: "mal" } }).cliente, "registros_chat", AHORA)).toEqual({ error: "mal" });
    expect(await purgarAnteriores(falso("lanza").cliente, "registros_chat", AHORA)).toEqual({ error: "boom" });
  });
});
