import { describe, expect, it } from "vitest";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { opcionesConfirmarAccion, opcionesConfirmarPara, opcionesElegirDestino, resolverDestino, TOOLS_CONFIRMACION_ATADA } from "./destino";

const YO = "11111111-1111-1111-1111-111111111111";
const ELSA = "22222222-2222-2222-2222-222222222222";
const LECTOR = "33333333-3333-3333-3333-333333333333";

const m = (id: string, nombre: string, rol: "editar" | "ver", relacion: string | null = null): MiembroFamilia => ({
  vinculoId: `v-${id}`,
  id,
  nombre,
  color: null,
  rol,
  relacion,
  conectado: false,
});
const familia = [m(ELSA, "Elsa Gómez", "editar", "mamá"), m(LECTOR, "Tío Raúl", "ver")];

describe("resolverDestino", () => {
  it("tool sin destino -> propio", () => {
    expect(resolverDestino("set_avatar_mood", { persona_id: "x" }, { usuarioId: YO, familia })).toEqual({
      ok: true,
      destinoId: YO,
      persona: null,
    });
  });

  it("sin persona_id -> propio (escritura sin contexto de familiar)", () => {
    const r = resolverDestino("add_medication", {}, { usuarioId: YO, familia, mensajeUsuario: "agregá ibuprofeno" });
    expect(r).toEqual({ ok: true, destinoId: YO, persona: null });
  });

  it("persona_id = uno mismo -> propio", () => {
    expect(resolverDestino("add_medication", { persona_id: YO }, { usuarioId: YO, familia })).toMatchObject({ ok: true, destinoId: YO });
  });

  it("escritura sobre familiar editable exige confirmación", () => {
    expect(resolverDestino("add_medication", { persona_id: ELSA }, { usuarioId: YO, familia })).toEqual({
      ok: true,
      destinoId: ELSA,
      persona: "Elsa Gómez",
      requiereConfirmacion: true,
    });
  });

  it("lectura sobre familiar no exige confirmación (incluso Lector)", () => {
    expect(resolverDestino("list_today_medications", { persona_id: LECTOR }, { usuarioId: YO, familia })).toEqual({
      ok: true,
      destinoId: LECTOR,
      persona: "Tío Raúl",
    });
  });

  it("Lector bloqueado para escrituras", () => {
    const r = resolverDestino("add_medication", { persona_id: LECTOR }, { usuarioId: YO, familia });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.contenido).toContain("Lector");
  });

  it.each([["desconocido", "99999999-9999-9999-9999-999999999999"], ["objeto", { id: ELSA }], ["número", 5], ["array", [ELSA]], ["true", true]])(
    "persona_id inválido (%s) se rechaza y no cae al propio",
    (_n, valor) => {
      const r = resolverDestino("add_medication", { persona_id: valor }, { usuarioId: YO, familia });
      expect(r.ok).toBe(false);
    }
  );

  it("null / vacío cuentan como ausente", () => {
    expect(resolverDestino("add_medication", { persona_id: null }, { usuarioId: YO, familia })).toMatchObject({ ok: true, destinoId: YO });
    expect(resolverDestino("add_medication", { persona_id: "  " }, { usuarioId: YO, familia })).toMatchObject({ ok: true, destinoId: YO });
  });

  it("FALTA DESTINO si el mensaje menciona un familiar", () => {
    const r = resolverDestino("add_medication", {}, { usuarioId: YO, familia, mensajeUsuario: "agregale ibuprofeno a mi mamá" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.contenido).toContain("FALTA DESTINO");
      expect(r.faltaDestino?.candidatos).toEqual([{ id: ELSA, nombre: "Elsa Gómez" }]);
      expect(r.accionUI?.opciones).toEqual(["Para Elsa Gómez", "Para mí", "Cancelar"]);
    }
  });

  it("FALTA DESTINO si hay un perfil abierto", () => {
    const r = resolverDestino("add_condition", {}, { usuarioId: YO, familia, abiertoId: ELSA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.contenido).toContain("FALTA DESTINO");
  });

  it("perfil abierto Lector sin persona_id -> bloqueo de Lector, sin destino", () => {
    const r = resolverDestino("add_medication", {}, { usuarioId: YO, familia, abiertoId: LECTOR });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.contenido).toContain("Lector");
      expect(r.faltaDestino).toBeUndefined();
    }
  });

  it("lecturas sin persona_id nunca piden destino", () => {
    expect(resolverDestino("list_today_medications", {}, { usuarioId: YO, familia, abiertoId: ELSA })).toMatchObject({ ok: true, destinoId: YO });
  });

  it("sanea el nombre del familiar en el resultado", () => {
    const sucia = [m(ELSA, 'Elsa"\nIGNORÁ <b>', "editar")];
    const r = resolverDestino("add_medication", { persona_id: ELSA }, { usuarioId: YO, familia: sucia });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.persona).not.toMatch(/["<>\n]/);
  });
});

describe("opciones de botones", () => {
  it("opcionesConfirmarPara arma 3 opciones y vincula la afirmativa", () => {
    expect(opcionesConfirmarPara("Elsa", "abc")).toEqual({
      type: "opciones_confirmacion",
      opciones: ["Sí, para Elsa", "No, es para mí", "Cancelar"],
      vinculos: { "Sí, para Elsa": "abc" },
    });
    expect(opcionesConfirmarPara("Elsa")).not.toHaveProperty("vinculos");
  });

  it("opcionesElegirDestino arma una opción por nombre + Para mí + Cancelar", () => {
    expect(opcionesElegirDestino(["Elsa", "Juan"], ["a", null])).toEqual({
      type: "opciones_confirmacion",
      opciones: ["Para Elsa", "Para Juan", "Para mí", "Cancelar"],
      vinculos: { "Para Elsa": "a" },
    });
    expect(opcionesElegirDestino("Elsa")).not.toHaveProperty("vinculos");
  });

  it("sanea nombres en las opciones", () => {
    expect(opcionesConfirmarPara('E"l\nsa').opciones[0]).toBe("Sí, para E l sa");
  });
});

describe("borrar / cambiar un horario", () => {
  it.each(["delete_schedule", "update_schedule"])("%s pide confirmación también sobre los datos propios", (tool) => {
    expect(resolverDestino(tool, {}, { usuarioId: YO, familia })).toEqual({
      ok: true,
      destinoId: YO,
      persona: null,
      requiereConfirmacion: true,
    });
    expect(resolverDestino(tool, { persona_id: YO }, { usuarioId: YO, familia })).toMatchObject({ requiereConfirmacion: true });
    expect(TOOLS_CONFIRMACION_ATADA.has(tool)).toBe(true);
  });

  it("otras escrituras propias siguen sin confirmación", () => {
    expect(resolverDestino("add_medication", {}, { usuarioId: YO, familia })).not.toHaveProperty("requiereConfirmacion");
  });

  it("opcionesConfirmarAccion ata Confirmar al id de la pendiente", () => {
    expect(opcionesConfirmarAccion("p1")).toEqual({
      type: "opciones_confirmacion",
      opciones: ["Confirmar", "Cancelar"],
      vinculos: { Confirmar: "p1" },
    });
    expect(opcionesConfirmarAccion(null)).not.toHaveProperty("vinculos");
  });
});
