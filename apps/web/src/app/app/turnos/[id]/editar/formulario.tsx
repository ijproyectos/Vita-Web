"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormularioTurno } from "@/components/vita/formulario-turno";
import type { Turno } from "@/lib/turnos/tipos";
import { editarTurnoAction } from "../../actions";

// Edición de un turno: el mismo formulario que el alta, con el turno cargado.
export function FormularioEditarTurno({
  turno,
  llevarDisponible,
  paraNombre,
  especialidadesUsadas,
  obraSocial,
}: {
  turno: Turno;
  llevarDisponible: boolean;
  paraNombre?: string;
  especialidadesUsadas: string[];
  obraSocial: string | null;
}) {
  const router = useRouter();
  return (
    <FormularioTurno
      accion={editarTurnoAction}
      onExito={() => {
        toast.success("Turno guardado");
        router.replace("/app/turnos");
      }}
      turno={turno}
      llevarDisponible={llevarDisponible}
      paraNombre={paraNombre}
      especialidadesUsadas={especialidadesUsadas}
      obraSocial={obraSocial}
      etiquetaGuardar="✓ Guardar cambios"
      volverA="/app/turnos"
    />
  );
}
