"use client";

import { FormularioTurno } from "@/components/vita/formulario-turno";
import type { Turno } from "@/lib/turnos/tipos";

// Vista previa del formulario de turno con datos de ejemplo: guardar no hace nada.
const EJEMPLO: Turno = {
  id: "ejemplo",
  usuario_id: "ejemplo",
  especialidad: "Cardiología",
  profesional: "Dra. Paz",
  lugar: "Sanatorio Otamendi",
  direccion: "Azcuénaga 870, CABA",
  telefono: "11 4444 5555",
  fecha: "2026-11-20",
  hora: "10:30",
  motivo: null,
  recordatorio: null,
  acompanado: true,
  notas: "Ir en ayunas",
  llevar: [
    { t: "DNI", ok: true },
    { t: "El electro anterior", ok: false },
    { t: "Credencial de OSDE", ok: false },
  ],
  created_at: "2026-11-01T00:00:00Z",
};

export function VistaFormularioTurno({ modo }: { modo: "alta" | "editar" }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background px-[18px] pt-4">
      <div className="mb-4 font-heading text-xl font-extrabold">{modo === "editar" ? "Editar turno" : "Turno médico"}</div>
      <FormularioTurno
        accion={async () => ({ status: "success" })}
        onExito={() => {}}
        turno={modo === "editar" ? EJEMPLO : undefined}
        llevarDisponible
        especialidadesUsadas={["Cardiología", "Clínica"]}
        obraSocial="OSDE 310"
        etiquetaGuardar={modo === "editar" ? "✓ Guardar cambios" : "✓ Guardar turno"}
        volverA="/dev/formulario-turno"
      />
    </div>
  );
}
