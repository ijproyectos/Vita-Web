"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { claveMedicamento } from "@/lib/inventario/tipos";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import type { DatosDetalleMedicamento } from "@/lib/rutina/detalle-datos";
import { marcarTomadoAction } from "./actions";
import { DetalleMedicamento } from "./detalle-medicamento";

// Abre la hoja de detalle de un medicamento desde cualquier lista. Es la misma
// hoja de la Rutina: este host solo resuelve sus datos y el "Ya la tomé".
export function DetalleMedicamentoHost({
  abiertoId,
  indiceColor,
  datos,
  perfil,
  onEditar,
  onCerrar,
}: {
  abiertoId: string | null;
  indiceColor: number;
  datos: DatosDetalleMedicamento;
  perfil: PerfilActivo;
  onEditar?: (id: string) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>({});

  const med = abiertoId ? (datos.todosLosMeds.find((m) => m.id === abiertoId) ?? null) : null;
  const hermanos = med
    ? datos.todosLosMeds.filter((m) => claveMedicamento(m.nombre, m.dosis) === claveMedicamento(med.nombre, med.dosis))
    : [];
  const esDeHoy = med ? med.id in datos.tomadoHoy : false;
  const tomado = med ? (local[med.id] ?? datos.tomadoHoy[med.id] ?? false) : false;

  function alternar() {
    if (!med) return;
    const id = med.id;
    const nuevo = !tomado;
    setLocal((p) => ({ ...p, [id]: nuevo }));
    startTransition(async () => {
      try {
        const r = await marcarTomadoAction(id, nuevo);
        if (r.status === "error") {
          setLocal((p) => ({ ...p, [id]: !nuevo }));
          toast.error(r.message);
          return;
        }
        router.refresh();
      } catch {
        setLocal((p) => ({ ...p, [id]: !nuevo }));
        toast.error("No se pudo registrar la toma.");
      }
    });
  }

  return (
    <DetalleMedicamento
      med={med}
      hermanos={hermanos}
      tomas={datos.tomas}
      hoy={datos.hoy}
      stock={med ? (datos.stockPorMedicamento[med.id] ?? null) : null}
      tomado={tomado}
      color={colorChipPorIndice(indiceColor)}
      perfil={perfil}
      puedeEditar={perfil.rol === "editar" && esDeHoy}
      pendiente={pendiente}
      onAlternar={alternar}
      onEditar={onEditar && med ? () => onEditar(med.id) : undefined}
      onCerrar={onCerrar}
    />
  );
}
