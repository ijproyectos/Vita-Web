import { describe, expect, it } from "vitest";
import { detectarEmergencia, textoEmergencia } from "@/lib/ai/emergencia";
import {
  calcularConsultas,
  cargaUsoSSE,
  eventosPorLimiteInteracciones,
  interpretarConsumo,
  LIMITE_INTERACCIONES_DIARIO_DEFAULT,
  mensajeLimiteInteracciones,
  resolverLimiteInteracciones,
  textoConsultasRestantes,
  turnoCuentaComoInteraccion,
  validarLimiteAdmin,
} from "./interacciones-logica";

describe("límite por defecto y override", () => {
  it("el límite general es 15", () => {
    expect(LIMITE_INTERACCIONES_DIARIO_DEFAULT).toBe(15);
  });
  it("sin override usa el general; con override válido manda el de la persona", () => {
    expect(resolverLimiteInteracciones(null)).toBe(15);
    expect(resolverLimiteInteracciones(undefined)).toBe(15);
    expect(resolverLimiteInteracciones(40)).toBe(40);
    expect(resolverLimiteInteracciones(1)).toBe(1);
    expect(resolverLimiteInteracciones(1000)).toBe(1000);
  });
  it("un override inválido cae al general", () => {
    expect(resolverLimiteInteracciones(0)).toBe(15);
    expect(resolverLimiteInteracciones(1001)).toBe(15);
    expect(resolverLimiteInteracciones(2.5)).toBe(15);
    expect(resolverLimiteInteracciones(Number.NaN)).toBe(15);
  });
});

describe("qué turnos cuentan como interacción", () => {
  it("un turno nuevo que va al modelo cuenta", () => {
    expect(turnoCuentaComoInteraccion({ reintento: false, estadoPrevio: "nuevo", resueltoSinModelo: false })).toBe(true);
  });
  it("la confirmación resuelta sin modelo no cuenta", () => {
    expect(turnoCuentaComoInteraccion({ reintento: false, estadoPrevio: "nuevo", resueltoSinModelo: true })).toBe(false);
  });
  it("el reintento de un turno ya guardado (ya contado) no cuenta", () => {
    expect(turnoCuentaComoInteraccion({ reintento: true, estadoPrevio: "guardado", resueltoSinModelo: false })).toBe(false);
    expect(turnoCuentaComoInteraccion({ reintento: true, estadoPrevio: "desconocido", resueltoSinModelo: false })).toBe(false);
  });
  it("el reintento cuyo mensaje nunca se guardó sí cuenta", () => {
    expect(turnoCuentaComoInteraccion({ reintento: true, estadoPrevio: "nuevo", resueltoSinModelo: false })).toBe(true);
  });
  it("la respuesta ya guardada no cuenta", () => {
    expect(turnoCuentaComoInteraccion({ reintento: true, estadoPrevio: "respondido", resueltoSinModelo: false })).toBe(false);
  });
});

describe("respuesta del contador (falla abierto)", () => {
  it("permitido con fila válida", () => {
    expect(interpretarConsumo([{ c_permitido: true, c_usadas: 3, c_limite: 15 }], false)).toEqual({
      permitido: true,
      consultas: { usadas: 3, limite: 15, restantes: 12 },
    });
  });
  it("bloqueado cuando la función dice que no hay cupo", () => {
    expect(interpretarConsumo([{ c_permitido: false, c_usadas: 15, c_limite: 15 }], false)).toEqual({
      permitido: false,
      consultas: { usadas: 15, limite: 15, restantes: 0 },
    });
  });
  it("un error del contador deja pasar", () => {
    expect(interpretarConsumo(null, true)).toEqual({ permitido: true, consultas: null });
  });
  it("una respuesta rara deja pasar", () => {
    expect(interpretarConsumo(null, false).permitido).toBe(true);
    expect(interpretarConsumo([], false).permitido).toBe(true);
    expect(interpretarConsumo([{ c_permitido: "no", c_usadas: 1, c_limite: 2 }], false).permitido).toBe(true);
    expect(interpretarConsumo([{ c_permitido: false, c_usadas: "x", c_limite: 2 }], false).permitido).toBe(true);
  });
});

describe("respuesta al llegar al límite", () => {
  it("el mensaje nombra el límite y el correo de soporte", () => {
    const m = mensajeLimiteInteracciones(15, false);
    expect(m).toContain("15 consultas de hoy");
    expect(m).toContain("medianoche");
    expect(m).toContain("hola@soyvita.com.ar");
  });
  it("en modo simple no usa palabras técnicas ni correo", () => {
    const m = mensajeLimiteInteracciones(15, true);
    expect(m).not.toMatch(/@|consultas|límite|IA/i);
  });
  it("sin emergencia: solo el error, sin reintento", () => {
    const e = eventosPorLimiteInteracciones({ limite: 15, modoSimple: false, textoEmergencia: null });
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ sinReintento: true });
  });
  it("con emergencia: el texto fijo de emergencia sale primero aunque se pasó del límite", () => {
    const tipo = detectarEmergencia("me quiero morir");
    expect(tipo).not.toBeNull();
    const texto = textoEmergencia(tipo!);
    const e = eventosPorLimiteInteracciones({ limite: 15, modoSimple: false, textoEmergencia: texto });
    expect(e[0]).toEqual({ chunk: texto });
    expect(texto).toMatch(/107|911/);
    expect(e[1]).toMatchObject({ sinReintento: true });
  });
});

describe("evento SSE de uso", () => {
  const uso = { usados: 1000, limite: 330000, restantes: 329000, porcentajeUsado: 0 };
  it("incluye las consultas si se conocen", () => {
    expect(cargaUsoSSE(uso, calcularConsultas(3, 15))).toEqual({ ...uso, consultas: { usadas: 3, limite: 15, restantes: 12 } });
  });
  it("mantiene el contrato anterior si no se conocen", () => {
    expect(cargaUsoSSE(uso, null)).toEqual(uso);
  });
});

describe("indicador de consultas", () => {
  it("usa palabras de todos los días", () => {
    expect(textoConsultasRestantes(calcularConsultas(3, 15))).toBe("Te quedan 12 consultas hoy");
    expect(textoConsultasRestantes(calcularConsultas(14, 15))).toBe("Te queda 1 consulta hoy");
    expect(textoConsultasRestantes(calcularConsultas(15, 15))).toMatch(/límite/);
  });
  it("calcularConsultas no devuelve negativos", () => {
    expect(calcularConsultas(20, 15).restantes).toBe(0);
    expect(calcularConsultas(-1, 15).usadas).toBe(0);
  });
});

describe("formulario del panel", () => {
  it("acepta un número entre 1 y 1000 y recorta el motivo", () => {
    expect(validarLimiteAdmin({ limite: "25", motivo: "  uso clínico  " })).toEqual({ ok: true, limite: 25, motivo: "uso clínico" });
    expect(validarLimiteAdmin({ limite: 1000, motivo: "" })).toEqual({ ok: true, limite: 1000, motivo: "" });
  });
  it("rechaza vacío, cero, fuera de rango, decimales y texto", () => {
    for (const limite of ["", "0", "1001", "2.5", "-3", "abc", "1e3", null, undefined]) {
      expect(validarLimiteAdmin({ limite, motivo: "" }).ok).toBe(false);
    }
  });
  it("rechaza un motivo de más de 200 caracteres", () => {
    expect(validarLimiteAdmin({ limite: "10", motivo: "x".repeat(201) }).ok).toBe(false);
    expect(validarLimiteAdmin({ limite: "10", motivo: "x".repeat(200) }).ok).toBe(true);
  });
  it("volver al general ignora el número", () => {
    expect(validarLimiteAdmin({ limite: "", motivo: "x", volverAlGeneral: true })).toEqual({ ok: true, limite: null, motivo: "" });
  });
});
