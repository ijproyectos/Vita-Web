import { describe, expect, it } from "vitest";
import { MS_VISIBLE_TRAS_VERLO, parsearVistos, registrarVistos, vencidosTrasVerlos } from "./pedido-ayuda-visto";

const T = 1_000_000;

describe("pedido de ayuda visto", () => {
  it("un aviso nuevo se anota con la hora actual y no vence", () => {
    const vistos = registrarVistos(["a"], {}, T);
    expect(vistos).toEqual({ a: T });
    expect(vencidosTrasVerlos(["a"], vistos, T)).toEqual([]);
  });

  it("vence una hora después de verlo, no antes", () => {
    const vistos = { a: T };
    expect(vencidosTrasVerlos(["a"], vistos, T + MS_VISIBLE_TRAS_VERLO - 1)).toEqual([]);
    expect(vencidosTrasVerlos(["a"], vistos, T + MS_VISIBLE_TRAS_VERLO)).toEqual(["a"]);
  });

  it("conserva la primera vez que se vio y olvida los que ya no están", () => {
    expect(registrarVistos(["a", "b"], { a: T, viejo: 1 }, T + 5)).toEqual({ a: T, b: T + 5 });
  });

  it("un guardado roto cuenta como nada visto", () => {
    expect(parsearVistos("no es json")).toEqual({});
    expect(parsearVistos("[1,2]")).toEqual({});
    expect(parsearVistos('{"a":"x","b":3}')).toEqual({ b: 3 });
    expect(parsearVistos(null)).toEqual({});
  });
});
