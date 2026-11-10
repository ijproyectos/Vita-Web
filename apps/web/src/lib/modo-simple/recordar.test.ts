import { describe, expect, it } from "vitest";
import {
  COOKIE_MODO_SIMPLE,
  cookieOlvidarModoSimple,
  cookieRecordarModoSimple,
  modoSimpleActivoPara,
  rutaPermitidaModoSimple,
} from "./recordar";

const ID = "6f1c2a9e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("modo simple recordado por dispositivo", () => {
  it("guarda el id de la cuenta, en todo el sitio y por un año", () => {
    const cookie = cookieRecordarModoSimple(ID);
    expect(cookie.startsWith(`${COOKIE_MODO_SIMPLE}=${ID};`)).toBe(true);
    expect(cookie).toContain("path=/;");
    expect(cookie).toContain(`max-age=${60 * 60 * 24 * 365};`);
  });

  it("olvidarlo vence la misma cookie (mismo nombre y path)", () => {
    const cookie = cookieOlvidarModoSimple();
    expect(cookie.startsWith(`${COOKIE_MODO_SIMPLE}=;`)).toBe(true);
    expect(cookie).toContain("path=/;");
    expect(cookie).toContain("max-age=0;");
  });

  it("solo está activo para la cuenta que lo activó", () => {
    expect(modoSimpleActivoPara(ID, ID)).toBe(true);
    expect(modoSimpleActivoPara(ID, "otra-cuenta")).toBe(false);
  });

  it("sin cookie, vacía o con el valor viejo no está activo", () => {
    expect(modoSimpleActivoPara(undefined, ID)).toBe(false);
    expect(modoSimpleActivoPara("", ID)).toBe(false);
    expect(modoSimpleActivoPara("1", ID)).toBe(false);
  });
});

describe("rutaPermitidaModoSimple", () => {
  it("deja el modo simple, el inicio y las pantallas a las que lleva", () => {
    expect(rutaPermitidaModoSimple("/app")).toBe(true);
    expect(rutaPermitidaModoSimple("/app/modo-simple")).toBe(true);
    expect(rutaPermitidaModoSimple("/app/modo-simple/")).toBe(true);
    expect(rutaPermitidaModoSimple("/app/mi-salud/monitoreo/agregar")).toBe(true);
    expect(rutaPermitidaModoSimple("/app/perfil/contacto-emergencia")).toBe(true);
  });

  it("devuelve al modo simple lo que abren los avisos del celular", () => {
    expect(rutaPermitidaModoSimple("/app/rutina")).toBe(false);
    expect(rutaPermitidaModoSimple("/app/pastillas")).toBe(false);
    expect(rutaPermitidaModoSimple("/app/medicamentos")).toBe(false);
    expect(rutaPermitidaModoSimple("/app/avisos")).toBe(false);
    expect(rutaPermitidaModoSimple("/app/perfil")).toBe(false);
    expect(rutaPermitidaModoSimple("/app/modo-simplex")).toBe(false);
  });

  it("no toca nada fuera de /app", () => {
    expect(rutaPermitidaModoSimple("/login")).toBe(true);
    expect(rutaPermitidaModoSimple("/cuidar")).toBe(true);
    expect(rutaPermitidaModoSimple("/application")).toBe(true);
  });
});
