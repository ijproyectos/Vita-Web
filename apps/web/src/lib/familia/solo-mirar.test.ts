import { describe, expect, it } from "vitest";
import { contenidoDeRespaldo, esVistaSoloMirar, rutaPermitidaSoloMirar, unicoAdmin } from "./solo-mirar";
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

describe("rutaPermitidaSoloMirar", () => {
  it.each([
    "/app",
    "/app/",
    "/app/resumen-salud",
    "/app/avisos",
    "/app/avisos/configuracion",
    "/app/perfil/seguridad",
    "/app/perfil/privacidad",
    "/app/perfil/privacidad/memoria",
    "/app/perfil/ayuda",
    "/app/perfil/ayuda/faq",
    "/app/perfil/ayuda/reportar",
    "/app/perfil/historial",
    "/app/perfil/historial/datos",
    "/app/perfil/compartir",
    "/app/perfil/eliminar-cuenta",
    "/app/modo-simple",
    "/app/modo-simple/charla",
    "/app/familia",
    "/app/familia/nuevo",
    "/app/familia/abc/cuidadores/xyz",
    "/app/vita-plus",
    "/app/vita-plus/gracias",
  ])("permite %s", (ruta) => {
    expect(rutaPermitidaSoloMirar(ruta)).toBe(true);
  });

  it.each([
    "/app/rutina",
    "/app/mi-salud",
    "/app/mi-salud/estudios/1",
    "/app/perfil",
    "/app/perfil/editar",
    "/app/medicamentos",
    "/app/turnos",
    "/app/condiciones",
    "/app/pastillas",
    "/app/pastillas/contar",
    "/app/agregar-medicamento",
    "/app/agregar-turno",
    "/app/resumen-salud/otra",
    "/app/perfil/contacto-emergencia",
    "/app/perfil/cuidadores",
    "/",
    "/cuidar",
  ])("bloquea %s", (ruta) => {
    expect(rutaPermitidaSoloMirar(ruta)).toBe(false);
  });

  it("compara por segmentos, no por prefijo de texto", () => {
    expect(rutaPermitidaSoloMirar("/app/avisos-x")).toBe(false);
    expect(rutaPermitidaSoloMirar("/app/familiar")).toBe(false);
    expect(rutaPermitidaSoloMirar("/app/modo-simple2")).toBe(false);
    expect(rutaPermitidaSoloMirar("/app/perfil/ayudante")).toBe(false);
    expect(rutaPermitidaSoloMirar("/app/vita-plus-x")).toBe(false);
    expect(rutaPermitidaSoloMirar("/application")).toBe(false);
  });
});

describe("contenidoDeRespaldo", () => {
  it("con lectura correcta muestra lo nuevo, sin aviso", () => {
    expect(contenidoDeRespaldo(false, "viejo", "nuevo")).toEqual({ contenido: "nuevo", aviso: false });
  });

  it("si falla una actualización deja lo último y lo avisa", () => {
    expect(contenidoDeRespaldo(true, "viejo", undefined)).toEqual({ contenido: "viejo", aviso: true });
  });

  it("si falla la primera carga lanza en vez de mostrar una pantalla vacía", () => {
    expect(() => contenidoDeRespaldo(true, null, undefined)).toThrow("No se pudieron leer");
  });
});
