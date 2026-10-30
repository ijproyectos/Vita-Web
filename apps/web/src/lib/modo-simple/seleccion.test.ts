import { describe, expect, it } from "vitest";
import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import { elegirProximoTurno, proximoGrupoPendiente } from "./seleccion";

function toma(id: string, hora: string, tomado = false): MedicamentoConToma {
  return {
    id, hora_programada: hora, tomado, nombre: "Medicamento de prueba",
    usuario_id: "persona-de-prueba", dosis: "10", unidad: "mg",
    momento_dia: "mañana", condicion: null, dias_recurrentes: [],
    frecuencia: null, con_comida: "no-importa", duracion: null, notas: null,
    inventario_id: null, created_at: "", updated_at: "", toma_id: null,
  };
}

describe("selección de tomas en modo simple", () => {
  it("después de confirmar la toma de ahora, mantiene la de las 18 como futura", () => {
    const r = proximoGrupoPendiente([toma("mañana", "08:00", true), toma("losartan", "18:00")], "08:01");
    expect(r.primera).toBeNull();
    expect(r.enGrupo).toEqual([]);
    expect(r.resto.map((m) => m.id)).toEqual(["losartan"]);
  });

  it("no incluye las 18 en la confirmación de las 15 aunque sean de la tarde", () => {
    const r = proximoGrupoPendiente([toma("actual", "15:00"), toma("futura", "18:00")], "15:00");
    expect(r.enGrupo.map((m) => m.id)).toEqual(["actual"]);
    expect(r.resto.map((m) => m.id)).toEqual(["futura"]);
  });

  it("activa la toma al llegar la hora, nunca un minuto antes", () => {
    const hoy = [toma("losartan", "18:00:00")];
    expect(proximoGrupoPendiente(hoy, "17:59").enGrupo).toEqual([]);
    expect(proximoGrupoPendiente(hoy, "18:00").enGrupo.map((m) => m.id)).toEqual(["losartan"]);
  });

  it("permite confirmar juntas las dosis del mismo horario", () => {
    const r = proximoGrupoPendiente([toma("a", "08:00"), toma("b", "08:00:00"), toma("c", "09:00")], "08:00");
    expect(r.enGrupo.map((m) => m.id)).toEqual(["a", "b"]);
    expect(r.resto.map((m) => m.id)).toEqual(["c"]);
  });

  it("conserva una toma atrasada sin mezclarla con otro horario ya cumplido", () => {
    const hoy = [toma("segunda", "09:00"), toma("primera", "08:00"), toma("futura", "18:00")];
    const r = proximoGrupoPendiente(hoy, "10:00");
    expect(r.enGrupo.map((m) => m.id)).toEqual(["primera"]);
    expect(r.resto.map((m) => m.id)).toEqual(["segunda", "futura"]);
    expect(hoy[0].id).toBe("segunda");
  });

  it("no declara completado el día si todas las pendientes son futuras", () => {
    const r = proximoGrupoPendiente([toma("a", "18:00"), toma("b", "21:00")], "07:00");
    expect(r.enGrupo).toEqual([]);
    expect(r.momento).toBeNull();
    expect(r.resto).toHaveLength(2);
  });

  it("no arrastra la toma de la noche al grupo de la madrugada del mismo día", () => {
    const r = proximoGrupoPendiente([toma("madrugada", "01:00"), toma("noche", "21:00")], "01:00");
    expect(r.enGrupo.map((m) => m.id)).toEqual(["madrugada"]);
    expect(r.resto.map((m) => m.id)).toEqual(["noche"]);
  });

  it("sin medicación o con todo tomado, no hay grupo ni siguientes", () => {
    for (const hoy of [[], [toma("a", "08:00", true)]]) {
      const r = proximoGrupoPendiente(hoy, "18:00");
      expect(r.enGrupo).toEqual([]);
      expect(r.resto).toEqual([]);
    }
  });

  it("ordena por hora normalizada: 8:00 va antes que 09:00", () => {
    const r = proximoGrupoPendiente([toma("nueve", "09:00"), toma("ocho", "8:00")], "10:00");
    expect(r.primera?.id).toBe("ocho");
    expect(r.enGrupo.map((m) => m.id)).toEqual(["ocho"]);
    expect(r.resto.map((m) => m.id)).toEqual(["nueve"]);
  });

  it("una hora inválida no queda como futura: se devuelve aparte", () => {
    const r = proximoGrupoPendiente([toma("rota", "25:99"), toma("ok", "18:00")], "07:00");
    expect(r.invalidas.map((m) => m.id)).toEqual(["rota"]);
    expect(r.resto.map((m) => m.id)).toEqual(["ok"]);
    expect(r.pendientes.map((m) => m.id)).toEqual(["ok"]);
    expect(r.enGrupo).toEqual([]);
  });
});

describe("elegirProximoTurno", () => {
  const hoy = "2026-10-29";
  const pasados = Array.from({ length: 6 }, (_, i) => ({ fecha: hoy, hora: `0${i + 1}:00:00` }));
  it("salta los turnos de hoy que ya pasaron, aunque sean más de 5", () => {
    const futuro = { fecha: "2026-10-31", hora: "10:00:00" };
    expect(elegirProximoTurno([...pasados, futuro], hoy, "12:00")).toBe(futuro);
  });
  it("hoy a la misma hora o más tarde todavía cuenta", () => {
    const ahora = { fecha: hoy, hora: "12:00:00" };
    expect(elegirProximoTurno([...pasados, ahora], hoy, "12:00")).toBe(ahora);
  });
  it("una fila de un día anterior con hora tardía no cuenta", () => {
    const ayerTarde = { fecha: "2026-10-28", hora: "23:00:00" };
    const futuro = { fecha: "2026-10-30", hora: "08:00:00" };
    expect(elegirProximoTurno([ayerTarde, futuro], hoy, "12:00")).toBe(futuro);
    expect(elegirProximoTurno([ayerTarde], hoy, "12:00")).toBeNull();
  });
  it("devuelve el primero en el orden recibido (la lista debe venir ordenada)", () => {
    const a = { fecha: "2026-10-31", hora: "10:00:00" };
    const b = { fecha: "2026-10-30", hora: "10:00:00" };
    expect(elegirProximoTurno([a, b], hoy, "12:00")).toBe(a);
  });
  it("sin ninguno vigente devuelve null", () => {
    expect(elegirProximoTurno(pasados, hoy, "12:00")).toBeNull();
  });
});
