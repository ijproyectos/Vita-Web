"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormularioTurno } from "@/components/vita/formulario-turno";
import { crearTurnoAction } from "../rutina/actions";

// Alta de turno para el perfil activo. El formulario es el compartido con la
// edición (components/vita/formulario-turno); acá solo se cablea la acción.
export function FormularioAgregarTurno({
  llevarDisponible,
  paraNombre,
  especialidadesUsadas,
  obraSocial,
}: {
  llevarDisponible: boolean;
  paraNombre?: string;
  especialidadesUsadas: string[];
  obraSocial: string | null;
}) {
  const router = useRouter();
  return (
    <FormularioTurno
      accion={crearTurnoAction}
      onExito={() => {
        toast.success("Turno agendado");
        router.replace("/app/rutina");
      }}
      llevarDisponible={llevarDisponible}
      paraNombre={paraNombre}
      especialidadesUsadas={especialidadesUsadas}
      obraSocial={obraSocial}
      etiquetaGuardar={paraNombre ? `+ Agendar turno a ${paraNombre}` : "✓ Guardar turno"}
      volverA="/app/rutina"
    />
  );
}
