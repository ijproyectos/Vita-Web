import { describe, expect, it } from "vitest";
import { esVistaSoloMirar, unicoAdmin } from "./solo-mirar";
import type { CuidadorDePersona } from "./tipos";

const c = (parcial: Partial<CuidadorDePersona>): CuidadorDePersona => ({
  vinculoId: "v",
  cuidadorId: "u",
  nombre: "Micaela Ruiz",
  rol: "editar",
  relacion: null,
  estado: "aceptado",
  esYo: false,
  puedeGestionar: false,
  email: null,
  token: null,
  expiraAt: null,
  aceptadoAt: null,
  ...parcial,
});

describe("unicoAdmin", () => {
  it("devuelve el primer nombre del único Admin", () => {
    expect(unicoAdmin([c({}), c({ rol: "ver", nombre: "Tomás" })])).toBe("Micaela");
  });
  it("null si no se pudo leer la lista", () => {
    expect(unicoAdmin(null)).toBeNull();
  });
  it("null si no hay Admin", () => {
    expect(unicoAdmin([c({ rol: "ver" })])).toBeNull();
  });
  it("null si hay más de un Admin", () => {
    expect(unicoAdmin([c({}), c({ nombre: "Juan" })])).toBeNull();
  });
  it("ignora a quien soy yo y a las pendientes", () => {
    expect(unicoAdmin([c({ esYo: true }), c({ estado: "pendiente", nombre: "Ana" })])).toBeNull();
  });
  it("no muestra un nombre inventado", () => {
    expect(unicoAdmin([c({ nombre: "Sin nombre" })])).toBeNull();
  });
});

describe("esVistaSoloMirar", () => {
  it("solo es true para Lector de otra persona", () => {
    expect(esVistaSoloMirar({ esPropio: true, rol: "editar" })).toBe(false);
    expect(esVistaSoloMirar({ esPropio: true, rol: "ver" })).toBe(false);
    expect(esVistaSoloMirar({ esPropio: false, rol: "editar" })).toBe(false);
    expect(esVistaSoloMirar({ esPropio: false, rol: "ver" })).toBe(true);
  });
});
