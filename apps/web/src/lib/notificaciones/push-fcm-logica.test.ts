import { describe, expect, it } from "vitest";
import {
  armarData,
  armarMensajeFcm,
  clasificarErrorFcm,
  esRutaRelativaSegura,
  esTokenNativoValido,
  normalizarUrl,
} from "./push-fcm-logica";

const base = { title: "Hora de tu pastilla", body: "Enalapril 10 mg", url: "/app/medicamentos/m1", tag: "dosis-m1" };

describe("normalizarUrl", () => {
  it("keeps relative paths", () => {
    expect(normalizarUrl("/cuidar/abc?x=1")).toBe("/cuidar/abc?x=1");
  });
  it.each(["https://evil.test/x", "//evil.test", "/\\evil.test", "app", "", "/a\nb", undefined, 42])(
    "falls back to /app for %j",
    (u) => {
      expect(normalizarUrl(u)).toBe("/app");
      expect(esRutaRelativaSegura(u)).toBe(false);
    }
  );
});

describe("armarMensajeFcm", () => {
  it("maps title/body/tag/channel and ignores web-only fields", () => {
    const m = armarMensajeFcm("tok", { ...base, requireInteraction: true, renotify: true });
    expect(m.token).toBe("tok");
    expect(m.notification).toEqual({ title: base.title, body: base.body });
    expect(m.android.priority).toBe("HIGH");
    expect(m.android.notification).toEqual({ tag: "dosis-m1", channel_id: "avisos" });
    expect(m.data).toEqual({ url: base.url, tag: "dosis-m1" });
  });
  it("replaces an unsafe url with /app", () => {
    expect(armarMensajeFcm("t", { ...base, url: "https://evil.test" }).data.url).toBe("/app");
  });
  it("caps title and body", () => {
    const m = armarMensajeFcm("t", { ...base, title: "x".repeat(500), body: "y".repeat(5000) });
    expect(m.notification.title.length).toBeLessThanOrEqual(120);
    expect(m.notification.body.length).toBeLessThanOrEqual(600);
  });
});

describe("armarData", () => {
  it("merges datos as strings, never overriding url/tag or reserved keys", () => {
    const d = armarData({
      url: "/app",
      tag: "t",
      datos: { medicamentoId: "m1", url: "https://evil.test", tag: "otro", from: "x", "google.a": "y", "gcm.b": "z" },
    });
    expect(d).toEqual({ url: "/app", tag: "t", medicamentoId: "m1" });
  });
  it("drops entries that exceed the byte budget", () => {
    const datos: Record<string, string> = {};
    for (let i = 0; i < 20; i++) datos[`k${i}`] = "v".repeat(512);
    const d = armarData({ url: "/app", tag: "t", datos });
    const total = Object.entries(d).reduce((n, [k, v]) => n + k.length + v.length, 0);
    expect(total).toBeLessThanOrEqual(2048);
  });
});

describe("clasificarErrorFcm", () => {
  it("404 deletes the token", () => {
    expect(clasificarErrorFcm({ status: 404 })).toBe("token-muerto");
  });
  it("UNREGISTERED in details deletes the token", () => {
    const cuerpo = { error: { code: 404, status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } };
    expect(clasificarErrorFcm({ status: 404, cuerpo })).toBe("token-muerto");
    expect(clasificarErrorFcm({ status: 400, cuerpo: { error: { details: [{ errorCode: "UNREGISTERED" }] } } })).toBe("token-muerto");
  });
  it("INVALID_ARGUMENT about the token deletes it", () => {
    const cuerpo = { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } };
    expect(clasificarErrorFcm({ status: 400, cuerpo })).toBe("token-muerto");
    const porCampo = { error: { status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "message.token" }] }] } };
    expect(clasificarErrorFcm({ status: 400, cuerpo: porCampo })).toBe("token-muerto");
  });
  it("INVALID_ARGUMENT about the payload keeps the token", () => {
    const cuerpo = { error: { status: "INVALID_ARGUMENT", message: "Invalid value at message.data" } };
    expect(clasificarErrorFcm({ status: 400, cuerpo })).toBe("fallido");
  });
  it.each([
    [401, { error: { status: "UNAUTHENTICATED" } }],
    [429, { error: { status: "QUOTA_EXCEEDED" } }],
    [503, undefined],
    [undefined, undefined],
  ])("status %j is a plain failure", (status, cuerpo) => {
    expect(clasificarErrorFcm({ status, cuerpo })).toBe("fallido");
  });
});

describe("esTokenNativoValido", () => {
  const ok = "fXyZ123:APA91bH_-abcdefghijklmnopqrstuvwxyz0123456789";
  it("accepts a realistic token", () => expect(esTokenNativoValido(ok)).toBe(true));
  it.each(["", "short", "has space ".repeat(5), "x".repeat(4097), 5, null, "abc/def".repeat(10)])("rejects %j", (t) => {
    expect(esTokenNativoValido(t)).toBe(false);
  });
});
