import { describe, expect, it } from "vitest";
import {
  CATALOGO_MEDICAMENTOS,
  completarEnLinea,
  etiquetaSugerencia,
  normalizar,
  sugerirMedicamentos,
} from "./catalogo";

describe("catálogo de medicamentos", () => {
  it("no repite nombres ni marcas (sin acentos ni mayúsculas)", () => {
    const vistos = new Set<string>();
    for (const e of CATALOGO_MEDICAMENTOS) {
      for (const valor of [e.nombre, ...(e.marcas ?? [])]) {
        const n = normalizar(valor);
        expect(vistos.has(n), `repetido: ${valor}`).toBe(false);
        vistos.add(n);
      }
    }
  });

  it("incluye los medicamentos de la encuesta de onboarding", () => {
    const nombres = CATALOGO_MEDICAMENTOS.map((e) => normalizar(e.nombre));
    expect(nombres).toContain("metformina");
    expect(nombres).toContain("levodopa/carbidopa");
  });
});

describe("sugerirMedicamentos", () => {
  it("ignora textos de menos de 2 caracteres", () => {
    expect(sugerirMedicamentos("")).toEqual([]);
    expect(sugerirMedicamentos("i")).toEqual([]);
    expect(sugerirMedicamentos(" p ")).toEqual([]);
  });

  it("encuentra por prefijo del nombre", () => {
    expect(sugerirMedicamentos("Ibup").map((s) => s.nombre)).toEqual(["Ibuprofeno"]);
  });

  it("no distingue acentos ni mayúsculas", () => {
    expect(sugerirMedicamentos("losar")[0].nombre).toBe("Losartán");
    expect(sugerirMedicamentos("LOSARTÁN")[0].nombre).toBe("Losartán");
    expect(sugerirMedicamentos("losár")[0].nombre).toBe("Losartán");
  });

  it("una marca sugiere el genérico", () => {
    const [s] = sugerirMedicamentos("tafi");
    expect(s.nombre).toBe("Paracetamol");
    expect(s.marca).toBe("Tafirol");
    expect(etiquetaSugerencia(s)).toBe("Tafirol (Paracetamol)");
  });

  it("pone primero los nombres y después las marcas", () => {
    const r = sugerirMedicamentos("as", 20);
    const primeraMarca = r.findIndex((s) => s.marca);
    const ultimoNombre = r.map((s) => !s.marca).lastIndexOf(true);
    expect(primeraMarca).toBeGreaterThan(-1);
    expect(ultimoNombre).toBeLessThan(primeraMarca);
  });

  it("respeta el límite", () => {
    expect(sugerirMedicamentos("ci", 3).length).toBeLessThanOrEqual(3);
    expect(sugerirMedicamentos("ci", 0)).toEqual([]);
  });

  it("devuelve varias coincidencias cuando hay más de una", () => {
    expect(sugerirMedicamentos("pa").length).toBeGreaterThan(1);
  });

  it("sin coincidencias devuelve vacío", () => {
    expect(sugerirMedicamentos("zzzz")).toEqual([]);
  });
});

describe("completarEnLinea", () => {
  it("completa cuando hay un único nombre", () => {
    expect(completarEnLinea("Ibup")).toBe("Ibuprofeno");
    expect(completarEnLinea("losa")).toBe("Losartán");
  });

  it("no completa con varias coincidencias, sin coincidencias o con el nombre ya completo", () => {
    expect(completarEnLinea("Ibuprofeno")).toBeNull();
    expect(completarEnLinea("pa")).toBeNull();
    expect(completarEnLinea("zzzz")).toBeNull();
    expect(completarEnLinea("i")).toBeNull();
  });
});
