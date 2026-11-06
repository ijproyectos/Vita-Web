import { describe, expect, it } from "vitest";
import {
  agregarItem,
  estadoDesdePerfil,
  estadoVacio,
  leerCantidadRemedios,
  marcarResultado,
  mezclarEstado,
  pendientesDeGuardar,
  proximoPaso,
  quitarItem,
  separarNombresRemedios,
} from "./conversacion";

const HOY = "2026-11-06";

describe("proximoPaso / mezclarEstado", () => {
  it("recorre los pasos en orden y nunca repite uno contestado", () => {
    let e = estadoVacio();
    expect(proximoPaso(e)).toBe("nacimiento");
    e = mezclarEstado(e, { nacimiento: { tipo: "solo-edad", edad: 78 }, nacimientoRespondido: true });
    expect(proximoPaso(e)).toBe("condiciones");
    e = mezclarEstado(e, { condiciones: [] });
    expect(proximoPaso(e)).toBe("alergias");
    e = mezclarEstado(e, { alergias: ["Penicilina"] });
    expect(proximoPaso(e)).toBe("remedios");
    e = mezclarEstado(e, { remediosRespondido: true });
    expect(proximoPaso(e)).toBe("turnos");
    e = mezclarEstado(e, { turnosRespondido: true, medicionesRespondido: true });
    expect(proximoPaso(e)).toBeNull();
  });
  it("una respuesta vacía no borra lo ya contestado", () => {
    let e = mezclarEstado(estadoVacio(), { nacimiento: { tipo: "fecha", fecha: "1950-03-12", edad: 76 }, nacimientoRespondido: true, condiciones: ["Diabetes"] });
    e = mezclarEstado(e, { nacimiento: { tipo: "nada" }, condiciones: [], alergias: undefined });
    expect(e.nacimiento).toMatchObject({ tipo: "fecha" });
    expect(e.condiciones).toEqual(["Diabetes"]);
    expect(e.alergias).toBeNull();
    expect(e.nacimientoRespondido).toBe(true);
  });
  it("una fecha completa reemplaza a una edad, pero no al revés", () => {
    let e = mezclarEstado(estadoVacio(), { nacimiento: { tipo: "solo-edad", edad: 76 } });
    e = mezclarEstado(e, { nacimiento: { tipo: "fecha", fecha: "1950-03-12", edad: 76 } });
    expect(e.nacimiento?.tipo).toBe("fecha");
    e = mezclarEstado(e, { nacimiento: { tipo: "solo-edad", edad: 70 } });
    expect(e.nacimiento?.tipo).toBe("fecha");
  });
  it("las listas se unen sin duplicados", () => {
    const e = mezclarEstado(mezclarEstado(estadoVacio(), { condiciones: ["Diabetes"] }), { condiciones: ["diabetes", "Hipertensión"] });
    expect(e.condiciones).toEqual(["Diabetes", "Hipertensión"]);
  });
});

describe("estadoDesdePerfil", () => {
  it("retoma sin repetir lo ya guardado", () => {
    const e = estadoDesdePerfil(
      { fecha_nacimiento: "1950-03-12", condiciones: [{ label: "Diabetes" }], alergias: [], mediciones_en_casa: "presion" },
      { tieneRemedios: true, tieneTurnos: false },
      HOY
    );
    expect(e.nacimiento).toMatchObject({ tipo: "fecha", edad: 76 });
    expect(proximoPaso(e)).toBe("alergias");
  });
  it("un rango declarado alcanza para no volver a preguntar la edad", () => {
    expect(estadoDesdePerfil({ edad_rango: "30-39" }, { tieneRemedios: false, tieneTurnos: false }, HOY).nacimientoRespondido).toBe(true);
  });
  it("perfil inexistente = todo por preguntar", () => {
    expect(proximoPaso(estadoDesdePerfil(null, { tieneRemedios: false, tieneTurnos: false }, HOY))).toBe("nacimiento");
  });
});

describe("listas editables", () => {
  it("agrega varios, quita los no guardados y conserva los guardados", () => {
    let l = agregarItem<string>([], "a", "Losartán");
    l = agregarItem(l, "b", "Metformina");
    l = agregarItem(l, "c", "Aspirina");
    expect(l).toHaveLength(3);
    l = quitarItem(l, "b");
    expect(l.map((i) => i.id)).toEqual(["a", "c"]);
    l = marcarResultado(l, "a", { ok: true });
    l = quitarItem(l, "a");
    expect(l.map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("un fallo deja el elemento en la lista con su error y reintenta solo los pendientes", () => {
    let l = agregarItem(agregarItem<string>([], "a", "x"), "b", "y");
    l = marcarResultado(l, "a", { ok: true });
    l = marcarResultado(l, "b", { ok: false, error: "duplicado" });
    expect(l[1].error).toBe("duplicado");
    expect(pendientesDeGuardar(l).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("remedios", () => {
  it("separa una lista", () => {
    expect(separarNombresRemedios("losartán, metformina y aspirina")).toEqual(["Losartán", "Metformina", "Aspirina"]);
    expect(separarNombresRemedios("Losartán, losartán")).toEqual(["Losartán"]);
  });
  it("lee cantidades o listas", () => {
    expect(leerCantidadRemedios("3")).toEqual({ tipo: "cantidad", total: 3 });
    expect(leerCantidadRemedios("dos")).toEqual({ tipo: "cantidad", total: 2 });
    expect(leerCantidadRemedios("Losartán y Metformina")).toEqual({ tipo: "lista", nombres: ["Losartán", "Metformina"] });
    expect(leerCantidadRemedios("0")).toEqual({ tipo: "ilegible" });
    expect(leerCantidadRemedios("")).toEqual({ tipo: "ilegible" });
  });
});
