"use client";

import { useState } from "react";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { deshacerMemoriaAction } from "./chat-actions";

type Datos = {
  id: string;
  texto: string;
  /** Nombre de a quién se refiere; null = la propia persona. */
  sobre: string | null;
  tipo: "estable" | "pasajero";
  /** Texto del recuerdo anterior cuando esto fue una corrección. */
  corrige: string | null;
  /** Primera vez que vita guarda algo de esta persona: suma el aviso de privacidad. */
  primera: boolean;
};

// Lo que llega por SSE no se confía tal cual: se arma un objeto con tipos conocidos o no se muestra nada.
export function datosDeMemoria(accion: { [clave: string]: unknown }): Datos | null {
  const { id, texto, sobre, tipo, corrige, primera } = accion;
  if (typeof id !== "string" || typeof texto !== "string" || !texto) return null;
  return {
    id,
    texto,
    sobre: typeof sobre === "string" && sobre ? sobre : null,
    tipo: tipo === "pasajero" ? "pasajero" : "estable",
    corrige: typeof corrige === "string" && corrige ? corrige : null,
    primera: primera === true,
  };
}

type Estado = "listo" | "deshaciendo" | "deshecho" | "error";

// Tarjeta "Me acuerdo de esto" bajo el mensaje de vita cuando guarda un recuerdo. Deshacer corre con la
// sesión de la persona (Server Action): borra el recuerdo y, si corregía otro, restaura el anterior.
export function TarjetaMemoria({ datos, alCerrar }: { datos: Datos; alCerrar: () => void }) {
  const [estado, setEstado] = useState<Estado>("listo");

  async function deshacer() {
    setEstado("deshaciendo");
    try {
      const r = await deshacerMemoriaAction(datos.id);
      setEstado(r.status === "success" ? "deshecho" : "error");
    } catch {
      setEstado("error");
    }
  }

  const base = "ml-9 w-[82%] rounded-[20px] rounded-bl-[6px] bg-card p-3.5 shadow-card";

  if (estado === "deshecho") {
    return (
      <div className={base}>
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-subtle">
          <VitaIcon name="check" size={15} />
          Listo, ya no lo recuerdo{datos.corrige ? ". Volví a lo que recordaba antes." : "."}
        </div>
      </div>
    );
  }

  return (
    <div className={base}>
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-full bg-persona-1-tint text-persona-1-deep">
          <VitaIcon name="heart" size={15} />
        </div>
        <div className="font-heading text-[13px] font-bold">Me acuerdo de esto</div>
      </div>
      <div className="mt-2.5 rounded-[var(--radius-item)] bg-secondary px-3.5 py-3">
        <div className="text-[14px] font-semibold leading-snug">{datos.texto}</div>
        <div className="mt-1 text-xs font-medium text-subtle">
          {[datos.sobre ? `Sobre ${datos.sobre}` : null, datos.tipo === "pasajero" ? "Lo guardo por unos días" : null]
            .filter(Boolean)
            .join(" · ") || "Sobre vos"}
        </div>
        {datos.corrige && <div className="mt-1 text-xs font-medium text-subtle">Antes: {datos.corrige}</div>}
      </div>
      {datos.primera && (
        <p className="mt-2.5 text-[12.5px] font-medium leading-snug text-subtle">
          Me acuerdo de esto para la próxima. Lo podés ver o borrar en Privacidad.
        </p>
      )}
      {estado === "error" && (
        <p className="mt-2 text-[12.5px] font-semibold text-destructive">No pude deshacerlo. Probá de nuevo o borralo desde Privacidad.</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={deshacer}
          disabled={estado === "deshaciendo"}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-3.5 py-2 font-heading text-[12.5px] font-bold text-teal-deep disabled:opacity-60"
        >
          {estado === "deshaciendo" ? "Deshaciendo…" : "Deshacer"}
        </button>
        <Link
          href="/app/perfil/privacidad"
          onClick={alCerrar}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 font-heading text-[12.5px] font-bold text-teal-deep"
        >
          Ver lo que recuerdo
          <VitaIcon name="chevron-right" size={13} />
        </Link>
      </div>
    </div>
  );
}
