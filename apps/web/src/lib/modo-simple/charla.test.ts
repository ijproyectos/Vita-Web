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
  TEXTO_SIN_CONEXION_PEDIDO,
  textoRespuestaFinal,
  destinoTrasIniciar,
  escuchaTrabada,
  textoParaEnviar,
  textoSinMic,
  ESPERA_SIN_OIR_MS,
  LARGO_MAXIMO_MENSAJE,
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
  it("cortada sin nada de texto es un problema de conexión, no de escucha", () => {
    expect(textoRespuestaFinal("", true, null)).toBe(TEXTO_SIN_CONEXION_PEDIDO);
  });
});

describe("escucha automática (iOS)", () => {
  it("destino tras intentar abrir el micrófono", () => {
    expect(destinoTrasIniciar({ ok: true })).toBe("escuchando");
    expect(destinoTrasIniciar({ ok: true, suspendido: true })).toBe("tocar-mic");
    expect(destinoTrasIniciar({ ok: false, motivo: "permiso-denegado" })).toBe("escribir");
    expect(destinoTrasIniciar({ ok: false, motivo: "no-soportado" })).toBe("escribir");
  });
  it("el watchdog solo salta con contexto suspendido y pasado el plazo", () => {
    expect(escuchaTrabada("escuchando", true, ESPERA_SIN_OIR_MS)).toBe(true);
    expect(escuchaTrabada("escuchando", true, ESPERA_SIN_OIR_MS - 1)).toBe(false);
    expect(escuchaTrabada("escuchando", false, 60_000)).toBe(false);
    expect(escuchaTrabada("grabando", true, 60_000)).toBe(false);
  });
  it("textos de sin micrófono y mensaje escrito", () => {
    expect(textoSinMic("permiso-denegado")).toMatch(/permiso/);
    expect(textoSinMic("no-soportado")).toMatch(/no deja usar/);
    expect(textoParaEnviar("   ")).toBe("");
    expect(textoParaEnviar("  hola  ")).toBe("hola");
    expect(textoParaEnviar("a".repeat(LARGO_MAXIMO_MENSAJE + 10))).toHaveLength(LARGO_MAXIMO_MENSAJE);
  });
});
