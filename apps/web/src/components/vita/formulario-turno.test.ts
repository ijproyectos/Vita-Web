import { describe, expect, it } from "vitest";
import { repartirLlevar } from "./formulario-turno";

describe("repartirLlevar", () => {
  it("lo guardado sobrevive aunque cambie la especialidad y recuerda lo tildado", () => {
    const r = repartirLlevar([{ t: "DNI", ok: true }, { t: "El electro anterior", ok: false }, { t: "Credencial de OSDE", ok: true }]);
    expect(r.conDni).toBe(true);
    expect(r.extras).toEqual(["El electro anterior", "Credencial de OSDE"]);
    expect([...r.tildados]).toEqual(["DNI", "Credencial de OSDE"]);
  });

  it("un turno nuevo arranca con el DNI", () => {
    expect(repartirLlevar(null).conDni).toBe(true);
  });
});
