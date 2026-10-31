import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calcularFirma,
  clasificarErrorRpc,
  clasificarFetchMp,
  construirBackUrl,
  construirCuerpoPreapproval,
  construirManifiesto,
  decidirPago,
  esInitPointMp,
  estadoDesdeMp,
  leerCabeceraFirma,
  leerNotificacion,
  leerPagoAutorizado,
  leerPreapproval,
  montoCoincide,
  origenPermitido,
  planificarDuplicados,
  tsReciente,
  verificarFirmaWebhook,
} from "./logica";

const SECRETO = "secreto-de-prueba";
const AHORA = 1_790_000_000_000; // ms

function cabecera(dataId: string, requestId: string, ts: string, secreto = SECRETO) {
  const v1 = createHmac("sha256", secreto).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("firma del webhook", () => {
  it("acepta una firma buena", () => {
    const ts = String(AHORA - 1000);
    const r = verificarFirmaWebhook({
      secreto: SECRETO,
      cabecera: cabecera("123", "req-1", ts),
      requestId: "req-1",
      dataIds: ["123"],
      ahoraMs: AHORA,
    });
    expect(r).toEqual({ ok: true, dataId: "123" });
  });

  it("acepta el manifiesto con el data.id alfanumérico en minúsculas", () => {
    const ts = String(AHORA);
    const r = verificarFirmaWebhook({
      secreto: SECRETO,
      cabecera: cabecera("2c93a0ab", "req-3", ts),
      requestId: "req-3",
      dataIds: ["2C93A0AB"],
      ahoraMs: AHORA,
    });
    expect(r).toEqual({ ok: true, dataId: "2C93A0AB" });
  });

  it("elige el data.id candidato que coincide (cuerpo vs query)", () => {
    const ts = String(AHORA);
    const r = verificarFirmaWebhook({
      secreto: SECRETO,
      cabecera: cabecera("777", "req-2", ts),
      requestId: "req-2",
      dataIds: ["999", "777"],
      ahoraMs: AHORA,
    });
    expect(r).toEqual({ ok: true, dataId: "777" });
  });

  it("rechaza firma mala (otro secreto, otro id, otro request-id)", () => {
    const ts = String(AHORA);
    const base = { requestId: "req-1", ahoraMs: AHORA, secreto: SECRETO };
    expect(verificarFirmaWebhook({ ...base, cabecera: cabecera("123", "req-1", ts, "otro"), dataIds: ["123"] })).toEqual({
      ok: false,
      motivo: "no_coincide",
    });
    expect(verificarFirmaWebhook({ ...base, cabecera: cabecera("123", "req-1", ts), dataIds: ["124"] })).toEqual({
      ok: false,
      motivo: "no_coincide",
    });
    expect(verificarFirmaWebhook({ ...base, requestId: "req-X", cabecera: cabecera("123", "req-1", ts), dataIds: ["123"] })).toEqual({
      ok: false,
      motivo: "no_coincide",
    });
  });

  it("rechaza un ts viejo (más de 24 h) o del futuro lejano, aunque la firma sea válida", () => {
    const viejo = String(AHORA - 25 * 60 * 60 * 1000);
    const futuro = String(AHORA + 10 * 60 * 1000);
    for (const ts of [viejo, futuro]) {
      const r = verificarFirmaWebhook({
        secreto: SECRETO,
        cabecera: cabecera("123", "req-1", ts),
        requestId: "req-1",
        dataIds: ["123"],
        ahoraMs: AHORA,
      });
      expect(r).toEqual({ ok: false, motivo: "vieja" });
    }
    // 23 h todavía vale (los reintentos de Mercado Pago llegan hasta ~24 h).
    expect(tsReciente(String(AHORA - 23 * 60 * 60 * 1000), AHORA)).toBe(true);
  });

  it("rechaza cabeceras ausentes o malformadas", () => {
    const base = { secreto: SECRETO, ahoraMs: AHORA, dataIds: ["123"] };
    expect(verificarFirmaWebhook({ ...base, cabecera: null, requestId: "r" })).toEqual({ ok: false, motivo: "falta" });
    expect(verificarFirmaWebhook({ ...base, cabecera: "ts=1,v1=aa", requestId: null })).toEqual({ ok: false, motivo: "falta" });
    expect(verificarFirmaWebhook({ ...base, cabecera: "basura", requestId: "r" })).toEqual({ ok: false, motivo: "malformada" });
    expect(verificarFirmaWebhook({ ...base, cabecera: "ts=1,v1=aa", requestId: "r" })).toEqual({ ok: false, motivo: "malformada" });
    expect(verificarFirmaWebhook({ ...base, dataIds: [null], cabecera: "ts=1", requestId: "r" })).toEqual({ ok: false, motivo: "falta" });
  });

  it("el manifiesto y la cabecera se leen como documenta Mercado Pago", () => {
    expect(construirManifiesto("1", "r", "2")).toBe("id:1;request-id:r;ts:2;");
    expect(calcularFirma("k", "m")).toMatch(/^[0-9a-f]{64}$/);
    expect(leerCabeceraFirma(`ts=123,v1=${"a".repeat(64)}`)).toEqual({ ts: "123", v1: "a".repeat(64) });
  });
});

describe("notificación", () => {
  it("lee type y data.id (string o número)", () => {
    expect(leerNotificacion({ type: "subscription_preapproval", data: { id: "abc" } })).toEqual({ tipo: "subscription_preapproval", dataId: "abc" });
    expect(leerNotificacion({ type: "x", data: { id: 55 } })).toEqual({ tipo: "x", dataId: "55" });
    expect(leerNotificacion(null)).toEqual({ tipo: null, dataId: null });
    expect(leerNotificacion({ data: { id: -1 } }).dataId).toBeNull();
  });
});

describe("back_url", () => {
  it("usa el origen https del sitio", () => {
    expect(construirBackUrl("https://vitappweb.netlify.app/cualquier/cosa?x=1")).toBe("https://vitappweb.netlify.app/app/vita-plus/gracias");
  });
  it("http solo en localhost", () => {
    expect(construirBackUrl("http://localhost:3000")).toBe("http://localhost:3000/app/vita-plus/gracias");
    expect(construirBackUrl("http://vita.example.com")).toBeNull();
  });
  it("rechaza vacío, malformado y credenciales", () => {
    expect(construirBackUrl(undefined)).toBeNull();
    expect(construirBackUrl("no es url")).toBeNull();
    expect(construirBackUrl("https://user:pw@vita.example.com")).toBeNull();
    expect(construirBackUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("init_point", () => {
  it("acepta https en mercadopago.com y .com.ar", () => {
    expect(esInitPointMp("https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc")).toBe(true);
    expect(esInitPointMp("https://mercadopago.com/x")).toBe(true);
  });
  it("rechaza otros hosts, http, puertos, credenciales y trucos de subdominio", () => {
    for (const malo of [
      "http://www.mercadopago.com.ar/x",
      "https://evil.com/mercadopago.com",
      "https://mercadopago.com.evil.com/x",
      "https://notmercadopago.com/x",
      "https://www.mercadopago.com.ar:8443/x",
      "https://u:p@www.mercadopago.com.ar/x",
      "https://www.mercadopago.cl/x",
      "",
      42,
      null,
    ]) {
      expect(esInitPointMp(malo)).toBe(false);
    }
  });
});

describe("cuerpo del preapproval", () => {
  it("lleva el monto en pesos enteros fijado al crear, sin plan asociado", () => {
    const cuerpo = construirCuerpoPreapproval({
      oferta: { razon: "vita+ mensual", meses: 1, pesos: 7784 },
      referenciaExterna: "ref-1",
      emailPagador: "a@b.com",
      backUrl: "https://x.com/app/vita-plus/gracias",
    });
    expect(cuerpo).toEqual({
      reason: "vita+ mensual",
      external_reference: "ref-1",
      payer_email: "a@b.com",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 7784, currency_id: "ARS" },
      back_url: "https://x.com/app/vita-plus/gracias",
      status: "pending",
    });
    expect(cuerpo).not.toHaveProperty("preapproval_plan_id");
  });
});

describe("decisión de pago", () => {
  const sub = { preapproval_id: "pre-1", ars_pesos: 7784 };
  type Pago = Parameters<typeof decidirPago>[0];
  const base = (): Pago => ({ preapprovalId: "pre-1", monto: 7784, moneda: "ARS", pagoId: "p-1", estadoPago: "approved" });
  const pago = (extra: Partial<Pago> = {}): Pago => ({ ...base(), ...extra });

  it("otorga con un pago aprobado cuyo monto es el guardado de ESA suscripción", () => {
    expect(decidirPago(pago(), sub)).toEqual({ tipo: "otorgar", pagoId: "p-1", pesos: 7784 });
  });

  it("el monto esperado depende de la suscripción, no de una constante", () => {
    expect(decidirPago(pago({ monto: 55973 }), { preapproval_id: "pre-1", ars_pesos: 55973 })).toMatchObject({ tipo: "otorgar" });
    expect(decidirPago(pago({ monto: 55973 }), sub)).toEqual({ tipo: "ignorar", motivo: "monto_distinto" });
  });

  it("ignora pagos no aprobados", () => {
    for (const estadoPago of ["pending", "rejected", "refunded", "in_process", null]) {
      expect(decidirPago(pago({ estadoPago }), sub)).toEqual({ tipo: "ignorar", motivo: "no_aprobado" });
    }
  });

  it("ignora otra moneda o un monto distinto (aunque sea por un peso)", () => {
    expect(decidirPago(pago({ moneda: "USD" }), sub)).toEqual({ tipo: "ignorar", motivo: "monto_distinto" });
    expect(decidirPago(pago({ monto: 7783 }), sub)).toEqual({ tipo: "ignorar", motivo: "monto_distinto" });
    expect(decidirPago(pago({ monto: 7784.5 }), sub)).toEqual({ tipo: "ignorar", motivo: "monto_distinto" });
  });

  it("ignora un pago de otra suscripción", () => {
    expect(decidirPago(pago({ preapprovalId: "pre-2" }), sub)).toEqual({ tipo: "ignorar", motivo: "otra_suscripcion" });
  });

  it("forma inesperada = reintentar, no descartar un posible pago", () => {
    expect(decidirPago(pago({ pagoId: null }), sub)).toEqual({ tipo: "forma_inesperada" });
    expect(decidirPago(pago({ preapprovalId: null }), sub)).toEqual({ tipo: "forma_inesperada" });
    expect(decidirPago({ ...base(), monto: "7784" }, sub)).toEqual({ tipo: "forma_inesperada" });
  });

  it("montoCoincide compara con tolerancia de centavos", () => {
    expect(montoCoincide(7784, "ars", 7784)).toBe(true);
    expect(montoCoincide(7784.0, "ARS", 7784)).toBe(true);
    expect(montoCoincide("7784", "ARS", 7784)).toBe(false);
    expect(montoCoincide(NaN, "ARS", 7784)).toBe(false);
  });
});

describe("recursos de Mercado Pago", () => {
  it("lee un pago autorizado", () => {
    expect(
      leerPagoAutorizado({ preapproval_id: "pre-1", transaction_amount: 100, currency_id: "ARS", payment: { id: 987, status: "approved" } })
    ).toEqual({ preapprovalId: "pre-1", monto: 100, moneda: "ARS", pagoId: "987", estadoPago: "approved" });
    expect(leerPagoAutorizado("x")).toBeNull();
  });

  it("lee un preapproval y ambas grafías de cancelación", () => {
    const p = leerPreapproval({ id: "pre-1", status: "canceled", external_reference: "r", auto_recurring: { transaction_amount: 10, currency_id: "ARS" } });
    expect(p).toMatchObject({ id: "pre-1", estado: "cancelled", referenciaExterna: "r", tieneMonto: true, monto: 10 });
    expect(estadoDesdeMp("cancelled")).toBe("cancelled");
    expect(estadoDesdeMp("raro")).toBeNull();
    expect(leerPreapproval({ status: "pending" })).toBeNull();
  });
});

describe("duplicados", () => {
  const vieja = { id: "a", preapproval_id: "pa", creada_at: "2026-10-01T00:00:00Z" };
  const nueva = { id: "b", preapproval_id: "pb", creada_at: "2026-10-02T00:00:00Z" };
  it("se queda con la autorizada más vieja", () => {
    expect(planificarDuplicados(nueva, [vieja, nueva])).toEqual({ cancelarEsta: true, cancelarOtras: [] });
    expect(planificarDuplicados(vieja, [vieja, nueva])).toEqual({ cancelarEsta: false, cancelarOtras: [nueva] });
    expect(planificarDuplicados(vieja, [])).toEqual({ cancelarEsta: false, cancelarOtras: [] });
  });
});

describe("clasificación", () => {
  it("fetch a Mercado Pago", () => {
    expect(clasificarFetchMp(200)).toBe("ok");
    expect(clasificarFetchMp(0)).toBe("transitorio");
    expect(clasificarFetchMp(404)).toBe("transitorio");
    expect(clasificarFetchMp(503)).toBe("transitorio");
    expect(clasificarFetchMp(401)).toBe("config");
    expect(clasificarFetchMp(400)).toBe("permanente");
  });
  it("errores de la RPC de inicio", () => {
    expect(clasificarErrorRpc({ message: "already_subscribed" })).toMatchObject({ http: 409, codigo: "ya_suscripto" });
    expect(clasificarErrorRpc({ message: "create_throttled" })).toMatchObject({ http: 429 });
    expect(clasificarErrorRpc(null)).toMatchObject({ http: 500 });
  });
  it("origen mismo-origen", () => {
    expect(origenPermitido(null, "vita.app")).toBe(true);
    expect(origenPermitido("https://vita.app", "vita.app")).toBe(true);
    expect(origenPermitido("https://evil.com", "vita.app")).toBe(false);
    expect(origenPermitido("basura", "vita.app")).toBe(false);
  });
});
