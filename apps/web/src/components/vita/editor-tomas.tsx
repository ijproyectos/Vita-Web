"use client";

import { useState } from "react";
import { FilaHora, SelectorHora } from "@/components/vita/selector-hora";
import { relacionDeToma, type TomaForm } from "@/lib/medicamentos/comidas";

// Filas "1.ª toma · hora" de un medicamento + el selector de hora (V7 D:3343).
// Las usan igual el alta y la edición, así se ven idénticas.
export function EditorTomas({
  tomas,
  onCambio,
}: {
  tomas: TomaForm[];
  onCambio: (tomas: TomaForm[]) => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const actual = editando !== null ? tomas[editando] : undefined;
  const horas = tomas.map((t) => t.hora);
  const repetidas = new Set(horas).size !== horas.length;

  return (
    <>
      <div className="flex flex-col gap-[9px]">
        {tomas.map((t, i) => (
          <FilaHora key={t.id ?? `n${i}`} etiqueta={`${i + 1}.ª toma`} hora={t.hora} relacion={relacionDeToma(t)} onClick={() => setEditando(i)} />
        ))}
      </div>
      {repetidas && <p className="mt-2 pl-1 text-xs font-semibold text-destructive">Hay dos tomas a la misma hora.</p>}
      <SelectorHora
        abierto={editando !== null}
        hora={actual?.hora ?? "08:00"}
        conComida={actual?.conComida ?? "no-importa"}
        conComidas
        onCerrar={() => setEditando(null)}
        onConfirmar={(hora, conComida) => {
          onCambio(tomas.map((t, i) => (i === editando ? { ...t, hora, conComida } : t)));
          setEditando(null);
        }}
      />
    </>
  );
}
