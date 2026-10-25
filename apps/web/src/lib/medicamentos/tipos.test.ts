import { describe, expect, it } from "vitest";
import { agruparMedicamentos, indicacionDeComida, textoDosis, type Medicamento } from "./tipos";

function med(parcial: Partial<Medicamento>): Medicamento {
  return {
    id: "id",
    usuario_id: "u",
    nombre: "Enalapril",
    dosis: "10",
    unidad: "mg",
    hora_programada: "08:00",
    momento_dia: "mañana",
    condicion: null,
    dias_recurrentes: [],
    frecuencia: null,
    con_comida: "no-importa",
    duracion: null,
    notas: null,
    inventario_id: null,
    created_at: "",
    updated_at: "",
    ...parcial,
  };
}

describe("textoDosis", () => {
  it("une dosis numérica con la unidad", () => {
    expect(textoDosis({ dosis: "500", unidad: "mg" })).toBe("500 mg");
  });
  it("no repite la unidad si la dosis ya trae letras", () => {
    expect(textoDosis({ dosis: "500mg", unidad: "mg" })).toBe("500mg");
  });
  it("devuelve vacío sin dosis o con dosis en blanco", () => {
    expect(textoDosis({ dosis: null, unidad: "mg" })).toBe("");
    expect(textoDosis({ dosis: "   ", unidad: "mg" })).toBe("");
  });
  it("recorta espacios y tolera unidad vacía", () => {
    expect(textoDosis({ dosis: " 5 ", unidad: "ml" })).toBe("5 ml");
    expect(textoDosis({ dosis: "5", unidad: "" })).toBe("5");
  });
});

describe("indicacionDeComida", () => {
  it("null cuando no importa la comida", () => {
    expect(indicacionDeComida({ con_comida: "no-importa", momento_dia: "tarde" })).toBeNull();
  });
  it("varía según el momento del día", () => {
    expect(indicacionDeComida({ con_comida: "con", momento_dia: "mañana" })).toBe("Con el desayuno");
    expect(indicacionDeComida({ con_comida: "antes", momento_dia: "mediodia" })).toBe("Antes del almuerzo");
    expect(indicacionDeComida({ con_comida: "despues", momento_dia: "tarde" })).toBe("Después de la merienda");
    expect(indicacionDeComida({ con_comida: "con", momento_dia: "noche" })).toBe("Con la cena");
  });
  it("null ante datos fuera del tipo (fila vieja de la DB)", () => {
    expect(
      indicacionDeComida({ con_comida: "raro" as never, momento_dia: "mañana" }),
    ).toBeNull();
    expect(
      indicacionDeComida({ con_comida: "con", momento_dia: "madrugada" as never }),
    ).toBeNull();
  });
});

describe("agruparMedicamentos", () => {
  it("lista vacía", () => {
    expect(agruparMedicamentos([])).toEqual([]);
  });

  it("agrupa por nombre+dosis normalizados y ordena las filas por hora", () => {
    const grupos = agruparMedicamentos([
      med({ id: "b", nombre: "Enalapril ", dosis: "10", hora_programada: "20:00" }),
      med({ id: "a", nombre: "enalapril", dosis: " 10 ", hora_programada: "08:00" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].id).toBe("a");
    expect(grupos[0].filas.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("distinta dosis = distinto grupo", () => {
    const grupos = agruparMedicamentos([
      med({ id: "a", dosis: "10" }),
      med({ id: "b", dosis: "20" }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("agrupa por inventario_id aunque el nombre difiera, y no se mezcla con los sin inventario", () => {
    const grupos = agruparMedicamentos([
      med({ id: "a", nombre: "Uno", inventario_id: "inv1", hora_programada: "08:00" }),
      med({ id: "b", nombre: "Otro", inventario_id: "inv1", hora_programada: "21:00" }),
      med({ id: "c", nombre: "Uno", inventario_id: null, hora_programada: "09:00" }),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.find((g) => g.id === "a")?.filas).toHaveLength(2);
  });

  it("ordena los grupos por primera hora y desempata por nombre", () => {
    const grupos = agruparMedicamentos([
      med({ id: "z", nombre: "Zeta", hora_programada: "08:00" }),
      med({ id: "t", nombre: "Tarde", hora_programada: "18:00" }),
      med({ id: "a", nombre: "Alfa", hora_programada: "08:00" }),
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(["Alfa", "Zeta", "Tarde"]);
  });

  it("no muta el arreglo de entrada", () => {
    const entrada = [
      med({ id: "b", hora_programada: "20:00" }),
      med({ id: "a", hora_programada: "08:00" }),
    ];
    agruparMedicamentos(entrada);
    expect(entrada.map((m) => m.id)).toEqual(["b", "a"]);
  });
});
