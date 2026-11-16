import { describe, expect, it } from "vitest";
import { PREFERENCIAS_POR_DEFECTO } from "@/lib/notificaciones/avisos-tipos";
import {
  CURSOR_FIN,
  CURSOR_INICIAL,
  corteDeRetencion,
  destinosDePush,
  elegirParaPush,
  payloadObservacion,
  planificarCambios,
  textosDeAviso,
} from "./generar-logica";
import type { ObservacionNueva } from "./tipos";

const nueva = (clave: string): ObservacionNueva => ({
  tipo: "turno_cerca",
  severidad: "info",
  clave,
  titulo: "t",
  texto: "x",
  datos: {},
  href: "/app/turnos",
  vigente_hasta: "2026-11-20T00:00:00.000Z",
});

describe("planificarCambios", () => {
  it("guarda todo lo actual y vence lo que ya no se cumple", () => {
    const r = planificarCambios([{ id: "1", clave: "a" }, { id: "2", clave: "b" }], [nueva("b"), nueva("c")]);
    expect(r.aGuardar.map((n) => n.clave)).toEqual(["b", "c"]);
    expect(r.aVencer).toEqual(["1"]);
  });
  it("sin reglas vigentes vence todo; sin existentes no vence nada", () => {
    expect(planificarCambios([{ id: "1", clave: "a" }], []).aVencer).toEqual(["1"]);
    expect(planificarCambios([], [nueva("a")]).aVencer).toEqual([]);
  });
});

describe("cursor", () => {
  it("los extremos ordenan como uuid", () => {
    expect(CURSOR_INICIAL < "00000000-0000-0000-0000-000000000001").toBe(true);
    expect(CURSOR_FIN > "fffffffe-ffff-ffff-ffff-ffffffffffff").toBe(true);
  });
});

describe("corteDeRetencion", () => {
  it("30 días antes", () => {
    expect(corteDeRetencion(Date.parse("2026-12-18T12:00:00Z"))).toBe("2026-11-18T12:00:00.000Z");
  });
});

describe("elegirParaPush", () => {
  it("elige por prioridad y solo entre los tipos con push", () => {
    const r = elegirParaPush([{ tipo: "turno_cerca" }, { tipo: "estudio_fuera_rango" }, { tipo: "presion_alta" }]);
    expect(r?.tipo).toBe("presion_alta");
    expect(elegirParaPush([{ tipo: "turno_cerca" }, { tipo: "stock_bajo_dias" }])).toBeNull();
    expect(elegirParaPush([])).toBeNull();
  });
});

describe("destinosDePush", () => {
  const prefs = (parche: Partial<typeof PREFERENCIAS_POR_DEFECTO> = {}) => ({ ...PREFERENCIAS_POR_DEFECTO, ...parche });
  it("a la persona y a sus cuidadores Admin", () => {
    const d = destinosDePush({ tipo: "presion_alta", personaId: "p", cuidadoresEditores: ["c1", "c2"], prefsDe: () => prefs(), horaAR: "09:00" });
    expect(d).toEqual([
      { usuarioId: "p", esPersona: true },
      { usuarioId: "c1", esPersona: false },
      { usuarioId: "c2", esPersona: false },
    ]);
  });
  it("familia_sin_tomas solo va a los cuidadores", () => {
    const d = destinosDePush({ tipo: "familia_sin_tomas", personaId: "p", cuidadoresEditores: ["c1"], prefsDe: () => prefs(), horaAR: "09:00" });
    expect(d).toEqual([{ usuarioId: "c1", esPersona: false }]);
  });
  it("respeta el interruptor apagado y el silencio nocturno", () => {
    const d = destinosDePush({
      tipo: "glucemia_fuera_rango",
      personaId: "p",
      cuidadoresEditores: ["c1", "c2"],
      prefsDe: (id) => (id === "p" ? prefs({ observaciones: false }) : id === "c1" ? prefs({ silencio_desde: "08:00", silencio_hasta: "10:00" }) : prefs()),
      horaAR: "09:00",
    });
    expect(d).toEqual([{ usuarioId: "c2", esPersona: false }]);
  });
  it("no duplica a un cuidador que es la misma persona", () => {
    const d = destinosDePush({ tipo: "presion_alta", personaId: "p", cuidadoresEditores: ["p", "c1", "c1"], prefsDe: () => prefs(), horaAR: "09:00" });
    expect(d.map((x) => x.usuarioId)).toEqual(["p", "c1"]);
  });
});

describe("textos del aviso", () => {
  const obs = { titulo: "Presión alta en varias mediciones", texto: "x".repeat(300) };
  it("para la persona usa su título y recorta el cuerpo", () => {
    const t = textosDeAviso(obs, true, "Elsa");
    expect(t.titulo).toBe(obs.titulo);
    expect(t.cuerpo.length).toBeLessThanOrEqual(160);
  });
  it("para quien cuida nombra a la persona (solo el primer nombre, limpio)", () => {
    const t = textosDeAviso(obs, false, 'Elsa "<b>" Pérez');
    expect(t.titulo).toBe("vita notó algo en los datos de Elsa");
    expect(t.cuerpo).toBe(obs.titulo);
  });
  it("el payload abre la observación o, si el enlace no es de la app, la lista", () => {
    expect(payloadObservacion({ titulo: "a", cuerpo: "b", personaId: "p", href: "/app/pastillas" }).url).toBe("/app/pastillas");
    expect(payloadObservacion({ titulo: "a", cuerpo: "b", personaId: "p", href: "https://x.com" }).url).toBe("/app/observaciones");
    expect(payloadObservacion({ titulo: "a", cuerpo: "b", personaId: "p", href: null }).tag).toBe("observacion-p");
  });
});
