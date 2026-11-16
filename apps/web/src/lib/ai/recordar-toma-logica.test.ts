import { describe, expect, it } from "vitest";
import { leerIdsDosis, resumirRecordatorios, textoPropuestaRecordatorio } from "./recordar-toma-logica";
import { resolverDestino } from "./destino";
import { claveSemantica } from "@/lib/chat/clave";
import { perfilSaludParaModelo } from "./lecturas";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import type { Perfil } from "@/lib/perfil/tipos";

const YO = "11111111-1111-4111-8111-111111111111";
const MAMA = "22222222-2222-4222-8222-222222222222";
const LECTOR = "33333333-3333-4333-8333-333333333333";
const m = (id: string, nombre: string, rol: "editar" | "ver"): MiembroFamilia => ({ vinculoId: id, id, nombre, color: null, rol, relacion: null, conectado: true });
const familia = [m(MAMA, "Rosa", "editar"), m(LECTOR, "Beto", "ver")];

describe("remind_dose: destino y confirmación", () => {
  it("rol Editar: exige la confirmación del servidor", () => {
    expect(resolverDestino("remind_dose", { persona_id: MAMA }, { usuarioId: YO, familia })).toMatchObject({ ok: true, destinoId: MAMA, requiereConfirmacion: true });
  });
  it("rol Lector: no puede (igual que el botón Recordarle)", () => {
    expect(resolverDestino("remind_dose", { persona_id: LECTOR }, { usuarioId: YO, familia })).toMatchObject({ ok: false });
  });
  it("alguien que no está en la familia: rechazado", () => {
    expect(resolverDestino("remind_dose", { persona_id: "44444444-4444-4444-8444-444444444444" }, { usuarioId: YO, familia })).toMatchObject({ ok: false });
  });
  it("la clave depende de las dosis, sin importar el orden", () => {
    const a = claveSemantica("remind_dose", { medication_ids: [MAMA, YO] });
    expect(a).toBe(claveSemantica("remind_dose", { medication_ids: [YO, MAMA] }));
    expect(a).not.toBe(claveSemantica("remind_dose", { medication_ids: [YO] }));
  });
});

describe("recordatorio: ids y textos veraces", () => {
  it("lee ids: sin repetir, ordenados, inválidos rechazados", () => {
    expect(leerIdsDosis(undefined)).toBeNull();
    expect(leerIdsDosis([MAMA, YO, MAMA])).toEqual([YO, MAMA]);
    expect(leerIdsDosis(["no-es-uuid"])).toBe("invalido");
    expect(leerIdsDosis("x")).toBe("invalido");
  });
  it("la pregunta nombra a la persona y las dosis", () => {
    expect(textoPropuestaRecordatorio("Rosa", [{ id: "a", nombre: "Enalapril", hora: "09:00:00" }])).toBe("¿Le mando un recordatorio a Rosa por Enalapril de las 09:00?");
  });
  it("solo dice ENVIADO si el servidor lo confirmó", () => {
    const ok = resumirRecordatorios("Rosa", [{ nombre: "Enalapril", r: { status: "enviado" } }]);
    expect(ok.enviadas).toBe(1);
    expect(ok.texto).toContain("ENVIADO");
    for (const r of [{ status: "repetido" }, { status: "sin-avisos" }, { status: "ya-tomada" }, { status: "error", message: "x" }] as const) {
      const res = resumirRecordatorios("Rosa", [{ nombre: "Enalapril", r }]);
      expect(res.enviadas).toBe(0);
      expect(res.texto).not.toContain("ENVIADO");
      expect(res.texto).toContain("NO afirmes");
    }
  });
});

describe("get_health_profile", () => {
  it("devuelve alergias y condiciones limpias, sin contacto ni obra social", () => {
    const perfil = {
      alergias: ["Penicilina"],
      condiciones: [{ label: "Hipertensión", tipo: "permanente", desde: "2019" }],
      genero: "Mujer",
      grupo_sanguineo: "0+",
      peso_kg: 70,
      altura_cm: 160,
      edad_rango: "Nació en 1950",
      fecha_nacimiento: null,
      obra_social: "OSDE",
      telefono: "123",
      contacto_emergencia_nombre: "Ana",
    } as unknown as Perfil;
    const r = perfilSaludParaModelo(perfil);
    expect(r).toMatchObject({ allergies: ["Penicilina"], conditions: [{ label: "Hipertensión", type: "permanente", since: "2019" }] });
    const json = JSON.stringify(r);
    for (const prohibido of ["OSDE", "123", "Ana"]) expect(json).not.toContain(prohibido);
  });
  it("sin perfil: lo dice", () => {
    expect(perfilSaludParaModelo(null)).toHaveProperty("error");
  });
});
