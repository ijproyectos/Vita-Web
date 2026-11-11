import { describe, expect, it } from "vitest";
import {
  CATALOGO_MEDICAMENTOS,
  normalizar,
  drogaDeMarca,
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

  it("encuentra por el principio del genérico y de la marca", () => {
    expect(sugerirMedicamentos("Ibup").map((s) => s.marca ?? s.nombre)).toEqual(["Ibupirac", "Ibuprofeno"]);
  });

  it("encuentra por cualquier parte del nombre, como las especialidades", () => {
    const r = sugerirMedicamentos("gliflo").map((s) => s.nombre);
    expect(r).toContain("Dapagliflozina");
    expect(r).toContain("Empagliflozina");
  });

  it("la marca aparece como marca, con su droga", () => {
    const [s] = sugerirMedicamentos("forx");
    expect(s).toMatchObject({ marca: "Forxiga", nombre: "Dapagliflozina" });
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
  });

  it("pone primero los que empiezan con el texto y después los que lo contienen", () => {
    const r = sugerirMedicamentos("pra", 20).map((s) => normalizar(s.marca ?? s.nombre));
    const primeraQueContiene = r.findIndex((n) => !n.startsWith("pra"));
    expect(primeraQueContiene).toBeGreaterThan(0);
    expect(r.slice(primeraQueContiene).every((n) => !n.startsWith("pra"))).toBe(true);
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

describe("drogaDeMarca", () => {
  it("una marca exacta da su droga", () => {
    expect(drogaDeMarca("forxiga")).toBe("Dapagliflozina");
    expect(drogaDeMarca(" Ibupirac ")).toBe("Ibuprofeno");
  });

  it("el genérico, una marca a medias o algo desconocido no", () => {
    expect(drogaDeMarca("Dapagliflozina")).toBeNull();
    expect(drogaDeMarca("Forx")).toBeNull();
    expect(drogaDeMarca("Remedio inventado")).toBeNull();
  });
});
