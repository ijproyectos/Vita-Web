"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { Segmentado } from "@/components/vita/segmentado";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { marcarAvisoLeidoAction, marcarTodosLeidosAction } from "@/lib/notificaciones/actions";

export type ItemAviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  leido: boolean;
  /** Ya formateado en hora AR ("08:30" hoy, "12 oct · 08:30" antes). */
  cuando: string;
  /** Persona cuidada a la que se refiere (feed del cuidador); null = aviso propio. */
  personaId: string | null;
  /** El aviso pide atención (ámbar), p. ej. un resumen con tomas sin hacer. */
  atencion: boolean;
};

export type PersonaAvisos = {
  id: string;
  nombre: string;
  relacion: string | null;
  color: ColorPerfil;
};

type Estilo = { icon: string; clases: string };

// Los cuatro tonos del diseño: alerta (naranja), ok (verde agua), turno
// (violeta) y stock (gris).
const ALERTA: Estilo = { icon: "alert-triangle", clases: "bg-aviso-tint text-aviso-ink" };
const OK: Estilo = { icon: "check", clases: "bg-persona-1-tint text-persona-1-deep" };
const TURNO: Estilo = { icon: "stethoscope", clases: "bg-persona-violeta-tint text-persona-violeta-deep" };
const STOCK: Estilo = { icon: "alert-triangle", clases: "bg-secondary text-slate-brand" };

const ESTILO_POR_TIPO: Record<string, Estilo> = {
  dosis: { icon: "pill", clases: OK.clases },
  dosis_pospuesta: { icon: "clock", clases: OK.clases },
  dosis_segundo: ALERTA,
  dosis_vencida_cuidador: ALERTA,
  dosis_resuelta_cuidador: OK,
  recordatorio_familiar: { icon: "bell", clases: OK.clases },
  turno_dia_antes: TURNO,
  turno_2h: TURNO,
  turno_persona_dia_antes: TURNO,
  stock_bajo: STOCK,
  stock_bajo_persona: STOCK,
  persona_en_vita: OK,
  pedido_ayuda: { icon: "alert-triangle", clases: "bg-destructive/10 text-destructive" },
  resumen_dia_persona: OK,
};

function estiloDe(item: ItemAviso): Estilo {
  if (item.tipo === "resumen_dia_persona" && item.atencion) return { icon: "clock", clases: ALERTA.clases };
  return ESTILO_POR_TIPO[item.tipo] ?? ESTILO_POR_TIPO.recordatorio_familiar;
}

type Grupo = {
  clave: string;
  titulo: string;
  nombre: string;
  color: ColorPerfil;
  items: ItemAviso[];
};

const FILTRO_TODOS = "todos";
const FILTRO_VOS = "vos";

export function ListaAvisos({
  items,
  personas,
  nombreUsuario,
  hayNoLeidos,
  hayOtrosAvisos,
}: {
  items: ItemAviso[];
  personas: PersonaAvisos[];
  nombreUsuario: string;
  hayNoLeidos: boolean;
  /** Hay recordatorios/stock vivos arriba: el vacío de un filtro no es "no hay nada". */
  hayOtrosAvisos: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<string>(FILTRO_TODOS);

  // El filtro aparece cuando el usuario cuida a alguien (o ya tiene avisos de una persona).
  const hayFamilia = personas.length > 0 || items.some((i) => i.personaId !== null);

  const opciones = [
    { valor: FILTRO_TODOS, etiqueta: "Todos" },
    ...personas.map((p) => ({ valor: p.id, etiqueta: personas.length === 1 ? (p.relacion ?? p.nombre) : p.nombre })),
    { valor: FILTRO_VOS, etiqueta: "Vos" },
  ];

  const porPersona = new Map(personas.map((p) => [p.id, p]));
  const grupos: Grupo[] = [];
  for (const p of personas) {
    grupos.push({
      clave: p.id,
      titulo: p.relacion && p.relacion.toLowerCase() !== p.nombre.toLowerCase() ? `${p.relacion} · ${p.nombre}` : p.nombre,
      nombre: p.nombre,
      color: p.color,
      items: items.filter((i) => i.personaId === p.id),
    });
  }
  // Avisos de una persona que ya no está en mi lista (vínculo terminado).
  const sueltos = items.filter((i) => i.personaId !== null && !porPersona.has(i.personaId));
  if (sueltos.length > 0) grupos.push({ clave: "otros", titulo: "Familia", nombre: "Familia", color: "violeta", items: sueltos });
  grupos.push({
    clave: FILTRO_VOS,
    titulo: "Vos",
    nombre: nombreUsuario,
    color: "teal",
    items: items.filter((i) => i.personaId === null),
  });

  const visibles = grupos.filter((g) => {
    if (g.items.length === 0) return false;
    if (filtro === FILTRO_TODOS) return true;
    if (filtro === FILTRO_VOS) return g.clave === FILTRO_VOS;
    return g.clave === filtro;
  });
  // Sin familia no hay encabezado de "Vos": la lista se lee sola.
  const conEncabezado = hayFamilia;

  function abrir(item: ItemAviso) {
    startTransition(async () => {
      try {
        if (!item.leido) await marcarAvisoLeidoAction(item.id);
      } catch {
        // marcar como leído es secundario: igual se navega.
      }
      if (item.url && item.url.startsWith("/")) router.push(item.url);
      else router.refresh();
    });
  }

  function marcarTodos() {
    startTransition(async () => {
      try {
        const r = await marcarTodosLeidosAction();
        if (r.status === "error") toast.error(r.message);
        else router.refresh();
      } catch {
        toast.error("No pudimos marcar los avisos como leídos.");
      }
    });
  }

  const etiquetaFiltro = opciones.find((o) => o.valor === filtro)?.etiqueta ?? "";

  return (
    <div className="flex flex-col gap-[18px]">
      {hayFamilia && <Segmentado opciones={opciones} valor={filtro} onChange={setFiltro} etiqueta="Filtrar avisos" />}

      {hayNoLeidos && (
        <button
          type="button"
          onClick={marcarTodos}
          disabled={pendiente}
          className="self-end rounded-full px-3 py-1.5 text-[12.5px] font-bold text-teal-deep disabled:opacity-60"
        >
          Marcar todo como leído
        </button>
      )}

      {visibles.map((g) => (
        <section key={g.clave}>
          {conEncabezado && (
            <div className="flex items-center gap-2 px-0.5 pb-2.5">
              <AvatarPersona nombre={g.nombre} color={g.color} size={22} />
              <h2 className={cn("eyebrow", CLASES_COLOR[g.color].texto)}>{g.titulo}</h2>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {g.items.map((item) => {
              const estilo = estiloDe(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => abrir(item)}
                    disabled={pendiente}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card p-[13px] text-left shadow-item disabled:opacity-70"
                  >
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-tile)]", estilo.clases)}>
                      <VitaIcon name={estilo.icon} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-heading text-[14.5px] leading-[1.3] tracking-[-0.02em]", item.leido ? "font-bold" : "font-extrabold")}>
                        {item.titulo}
                      </div>
                      {item.cuerpo && (
                        <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle text-pretty">{item.cuerpo}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
                      <span className="text-[11.5px] font-bold tabular-nums text-faint">{item.cuando}</span>
                      {!item.leido && <span aria-label="Sin leer" className="size-2 rounded-full bg-primary" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {visibles.length === 0 && !hayOtrosAvisos && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name="bell" size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">
            {filtro === FILTRO_TODOS
              ? "Todavía no hay avisos"
              : filtro === FILTRO_VOS
                ? "Todavía no tenés avisos"
                : `Todavía no hay avisos de ${etiquetaFiltro}`}
          </div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            {filtro === FILTRO_TODOS
              ? "Cuando cargues un remedio o un turno, acá vas a ver cada aviso."
              : "Cuando haya novedades, las ves acá."}
          </div>
        </div>
      )}
    </div>
  );
}
