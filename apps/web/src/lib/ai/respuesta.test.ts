import { describe, expect, it } from "vitest";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { clasificarRespuesta, mencionaFamiliar, normTexto } from "./respuesta";

describe("clasificarRespuesta", () => {
  it.each(["si", "sí", "Sí!", "dale", "ok", "claro", "hacelo", "Dale, cargalo", "por supuesto"])("afirmativo %j -> si", (t) => {
    expect(clasificarRespuesta(t, null)).toBe("si");
  });

  it.each([
    "claro que no",
    "ok, mejor no",
    "no",
    "nop",
    "nunca",
    "para nada",
    "ni loca",
    "Cancelar",
    "cancelalo",
    "NO!",
  ])("negación %j -> no", (t) => {
    expect(clasificarRespuesta(t, null)).toBe("no");
  });

  it("negación al comienzo gana sobre una afirmación", () => {
    expect(clasificarRespuesta("dale pero no", null)).toBe("no");
    expect(clasificarRespuesta("si... no", null)).toBe("no");
  });

  it.each(["para mí", "No, es para mí", "sí, para mí", "para mi"])("variante 'para mí' %j -> no", (t) => {
    expect(clasificarRespuesta(t, null)).toBe("no");
  });

  it("'para <persona>' exacto es sí", () => {
    expect(clasificarRespuesta("sí, para Elsa Gómez", "Elsa Gómez")).toBe("si");
    expect(clasificarRespuesta("Para Elsa Gómez", ["Elsa Gómez"])).toBe("si");
  });

  it("un perfil llamado 'Mi Nena' no se confunde con 'para mí'", () => {
    expect(clasificarRespuesta("Para Mi Nena", "Mi Nena")).toBe("si");
    expect(clasificarRespuesta("sí, para mi nena", ["Mi Nena"])).toBe("si");
  });

  it("'para mi mamá' (parentesco) no es 'para mí'", () => {
    expect(clasificarRespuesta("si, para mi mamá", null)).toBe("si");
  });

  it("prefiere el nombre más largo", () => {
    expect(clasificarRespuesta("sí, para Mi Nena Grande", ["Mi Nena", "Mi Nena Grande"])).toBe("si");
  });

  it("sí con negación tardía en frase larga -> otro (ni autoriza ni cancela)", () => {
    expect(clasificarRespuesta("sí, cargalo a las ocho y no te olvides del horario de la noche", null)).toBe("otro");
  });

  it("vacío o sin sentido -> otro", () => {
    expect(clasificarRespuesta("", null)).toBe("otro");
    expect(clasificarRespuesta("   ", null)).toBe("otro");
    expect(clasificarRespuesta("¿?", null)).toBe("otro");
    expect(clasificarRespuesta("qué hora es", null)).toBe("otro");
  });

  it("'si' dentro de otra palabra no afirma", () => {
    expect(clasificarRespuesta("siempre quiero otra cosa", null)).toBe("otro");
  });
});

describe("normTexto", () => {
  it("quita tildes, minúsculas y colapsa espacios; tolera null", () => {
    expect(normTexto("  SÍ   Mamá ")).toBe("si mama");
    expect(normTexto(null)).toBe("");
    expect(normTexto(undefined)).toBe("");
  });
});

const fam = (id: string, nombre: string, relacion: string | null = null): MiembroFamilia => ({
  vinculoId: `v-${id}`,
  id,
  nombre,
  color: null,
  rol: "editar",
  relacion,
  conectado: false,
});

describe("mencionaFamiliar", () => {
  const familia = [fam("1", "Elsa Gómez", "mamá"), fam("2", "Juan Pérez")];

  it("detecta nombre de pila, nombre completo y relación", () => {
    expect(mencionaFamiliar("agregale ibuprofeno a Elsa", familia).candidatos.map((c) => c.id)).toEqual(["1"]);
    expect(mencionaFamiliar("cargá para elsa gomez", familia).menciona).toBe(true);
    expect(mencionaFamiliar("lo de mamá", familia).candidatos.map((c) => c.id)).toEqual(["1"]);
  });

  it("parentesco genérico con posesivo devuelve toda la familia", () => {
    const r = mencionaFamiliar("agregá un remedio a mi abuelo", familia);
    expect(r.menciona).toBe(true);
    expect(r.candidatos).toHaveLength(2);
  });

  it("mensaje neutro o sin familia -> no menciona", () => {
    expect(mencionaFamiliar("qué me toca hoy", familia)).toEqual({ menciona: false, candidatos: [] });
    expect(mencionaFamiliar("a mi mamá", [])).toEqual({ menciona: false, candidatos: [] });
  });

  it("no matchea fragmentos de palabras", () => {
    expect(mencionaFamiliar("tengo un elsewhere", familia).menciona).toBe(false);
  });
});
