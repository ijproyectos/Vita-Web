import { describe, expect, it } from "vitest";
import {
  etiquetaMedicion,
  leerMedicionPropuesta,
  textoAyudaEnviada,
  textoPreguntaMedicion,
  textoSaludoAnimo,
  textoSinInternet,
  TEXTO_CORTADA,
  TEXTO_NO_ENTENDI,
  textoRespuestaFinal,
} from "./charla";

describe("textos de la charla", () => {
  it("saluda con y sin nombre", () => {
    expect(textoSaludoAnimo("Elsa")).toBe("Hola, Elsa. ¿Cómo estás hoy?");
    expect(textoSaludoAnimo("  ")).toBe("Hola. ¿Cómo estás hoy?");
  });
  it("sin internet", () => {
    expect(textoSinInternet("Elsa")).toBe("Ahora no tengo internet, Elsa. Tus pastillas y turnos siguen guardados y te aviso igual.");
    expect(textoSinInternet("")).toMatch(/^Ahora no tengo internet\. /);
  });
  it("ayuda enviada: singular, plural y vacío", () => {
    expect(textoAyudaEnviada(["Mica"])).toBe("Mica recibió tu pedido");
    expect(textoAyudaEnviada(["Mica", "Juan"])).toBe("Mica y Juan recibieron tu pedido");
    expect(textoAyudaEnviada([])).toBe("");
  });
});

describe("medición propuesta", () => {
  it("azúcar y presión", () => {
    const az = leerMedicionPropuesta({ type: "medicion_propuesta", tipo: "glucemia", valor: 110 });
    expect(az).toEqual({ tipo: "glucemia", valor: 110, valorSecundario: null });
    expect(textoPreguntaMedicion(az!)).toBe("Azúcar 110. ¿Lo anoto así?");
    const pr = leerMedicionPropuesta({ tipo: "presion", valor: 130, valorSecundario: 80 });
    expect(textoPreguntaMedicion(pr!)).toBe("Presión 130/80. ¿Lo anoto así?");
    expect(etiquetaMedicion(pr!).unidad).toBe("mmHg");
  });
  it("rechaza formas inválidas", () => {
    expect(leerMedicionPropuesta({ tipo: "peso", valor: 70 })).toBeNull();
    expect(leerMedicionPropuesta({ tipo: "glucemia", valor: "110" })).toBeNull();
    expect(leerMedicionPropuesta({ tipo: "presion", valor: 130 })).toBeNull();
  });
});

describe("textoRespuestaFinal", () => {
  it("respuesta completa se muestra tal cual", () => {
    expect(textoRespuestaFinal(" Hola, Elsa. ", false, null)).toBe("Hola, Elsa.");
  });
  it("respuesta cortada avisa que quedó incompleta", () => {
    expect(textoRespuestaFinal("Tu turno es", true, null)).toBe(`Tu turno es ${TEXTO_CORTADA}`);
  });
  it("sin texto usa el error del servidor o el genérico", () => {
    expect(textoRespuestaFinal("", true, "Mandaste muchos mensajes.")).toBe("Mandaste muchos mensajes.");
    expect(textoRespuestaFinal("  ", false, null)).toBe(TEXTO_NO_ENTENDI);
  });
});
