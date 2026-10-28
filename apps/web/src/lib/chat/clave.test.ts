import { describe, expect, it } from "vitest";
import { claveSemantica } from "./clave";

describe("claveSemantica", () => {
  it("reformulaciones triviales dan la misma clave", () => {
    const a = claveSemantica("add_medication", { name: "Ibuprofeno", dose: "400mg", scheduled_time: "12:00" });
    const b = claveSemantica("add_medication", { name: "  ibuprófeno ", dose: "400 MG", scheduled_time: "12:00:00" });
    expect(b).toBe(a);
  });

  it("hora 9:00 y 09:00 coinciden; días en distinto orden coinciden", () => {
    expect(claveSemantica("add_medication", { name: "x", scheduled_time: "9:00", recurring_days: ["lun", "mar"] })).toBe(
      claveSemantica("add_medication", { name: "x", scheduled_time: "09:00", recurring_days: ["mar", "lun"] })
    );
  });

  it("campos no identificatorios (notas) no cambian la clave", () => {
    expect(claveSemantica("add_medication", { name: "x", dose: "1", scheduled_time: "08:00", notes: "a" })).toBe(
      claveSemantica("add_medication", { name: "x", dose: "1", scheduled_time: "08:00", notes: "b" })
    );
  });

  it("distinta dosis u hora dan claves distintas", () => {
    const base = { name: "x", dose: "400mg", scheduled_time: "12:00" };
    const k = claveSemantica("add_medication", base);
    expect(claveSemantica("add_medication", { ...base, dose: "800mg" })).not.toBe(k);
    expect(claveSemantica("add_medication", { ...base, scheduled_time: "13:00" })).not.toBe(k);
  });

  it("incluye el nombre de la tool", () => {
    expect(claveSemantica("mark_taken", { medication_name: "x" })).not.toBe(claveSemantica("delete_schedule", { medication_name: "x" }));
  });

  it("mark_all_taken no depende del input; tool desconocida usa el input entero", () => {
    expect(claveSemantica("mark_all_taken", { a: 1 })).toBe(claveSemantica("mark_all_taken", {}));
    expect(claveSemantica("otra", { a: 1 })).not.toBe(claveSemantica("otra", { a: 2 }));
  });

  it("turnos: distinta fecha -> distinta clave", () => {
    expect(claveSemantica("add_appointment", { date: "2026-10-01", time: "10:00" })).not.toBe(
      claveSemantica("add_appointment", { date: "2026-10-02", time: "10:00" })
    );
  });
});
