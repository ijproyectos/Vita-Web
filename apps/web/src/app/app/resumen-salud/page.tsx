import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { edadTexto } from "@/lib/perfil/formato";
import { metaDeCondicion } from "@/lib/perfil/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";
import { BotonPedirAVita } from "./boton-pedir-a-vita";

// Resumen de salud (V7 "Perfil clínico"): solo lectura. Grilla de medidas,
// condiciones y alergias, medicación activa y atajos. Editar los datos vive
// en Perfil › Editar; condiciones y medicamentos tienen sus propias pantallas.
export default async function ResumenSaludPage() {
  await requireUser();
  const supabase = await createClient();
  // Familia: el resumen es del perfil activo.
  const activo = await obtenerPerfilActivo();
  const [perfil, todos, adherencia] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, activo.id),
    medicamentos.listarTodos(supabase, activo.id).catch(() => []),
    activo.esPropio ? medicamentos.calcularAdherencia(supabase, activo.id).catch(() => null) : Promise.resolve(null),
  ]);

  if (!perfil) return null; // requireUser ya garantiza sesión; perfiles se crea en el callback de auth

  const edad = edadTexto(perfil);
  const edadNum = perfil.fecha_nacimiento ? edad?.replace(" años", "") : null;
  const alturaM = perfil.altura_cm ? (perfil.altura_cm / 100).toFixed(2).replace(".", ",") : null;
  const peso = perfil.peso_kg != null ? String(Number(perfil.peso_kg.toFixed(1))).replace(".", ",") : null;
  const bio = [
    { label: "Altura", valor: alturaM, unidad: "m" },
    { label: "Peso", valor: peso, unidad: "kg" },
    { label: "Grupo", valor: perfil.grupo_sanguineo, unidad: "" },
    { label: "Edad", valor: edadNum ?? perfil.edad_rango, unidad: edadNum ? "años" : "" },
  ];
  const aniosConVita = perfil.created_at
    ? Math.max(0, (new Date().getTime() - new Date(perfil.created_at).getTime()) / (365.25 * 24 * 3600 * 1000))
    : 0;

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Perfil clínico" title="Resumen de salud" />
      <BannerPerfil perfil={activo} />

      <div className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] bg-foreground/[0.06]">
          {bio.map((b) => (
            <div key={b.label} className="bg-card px-4 py-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-subtle">{b.label}</div>
              <div className="mt-[5px] font-heading text-[22px] font-bold tracking-[-0.04em] tabular-nums">
                {b.valor || "—"}
                {b.valor && b.unidad && <span className="ml-[3px] text-xs font-bold text-subtle">{b.unidad}</span>}
              </div>
            </div>
          ))}
        </div>
        <Link href="/app/perfil/editar" className="mt-3 flex items-center justify-end gap-0.5 text-[12.5px] font-bold text-teal-deep">
          {activo.rol === "editar" ? "Editar datos personales" : "Ver datos personales"}
          <VitaIcon name="chevron-right" size={14} />
        </Link>
      </div>

      <Link href="/app/condiciones" className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center justify-between">
          <div className="font-heading text-base font-extrabold tracking-[-0.02em]">Condiciones y alergias</div>
          <div className="text-[12.5px] font-bold text-teal-deep">{activo.rol === "editar" ? "Editar" : "Ver"}</div>
        </div>
        <div className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-3.5 border-t border-dashed border-foreground/15 pt-3.5">
          <div className="pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-brand">Diagnóstico</div>
          <div className="flex flex-col">
            {perfil.condiciones.length === 0 ? (
              <span className="text-sm font-medium leading-[1.6] text-subtle">Sin condiciones cargadas</span>
            ) : (
              perfil.condiciones.map((c) => (
                <div key={c.label} className="text-sm font-semibold leading-[1.6]">
                  {c.label} <span className="font-medium text-slate-brand">{metaDeCondicion(c)}</span>
                </div>
              ))
            )}
          </div>
          <div className="pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-chip-rose-ink">Alergias</div>
          <div className="flex flex-col">
            {perfil.alergias.length === 0 ? (
              <span className="text-sm font-medium leading-[1.6] text-subtle">Sin alergias cargadas</span>
            ) : (
              perfil.alergias.map((a) => (
                <div key={a} className="text-sm font-extrabold leading-[1.6] text-chip-rose-ink">
                  {a}
                </div>
              ))
            )}
          </div>
        </div>
      </Link>

      <div className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center justify-between">
          <div className="font-heading text-base font-extrabold tracking-[-0.02em]">Medicación activa</div>
          <Link href="/app/medicamentos" className="text-[12.5px] font-bold text-teal-deep">
            {activo.rol === "editar" ? "Editar" : "Ver"}
          </Link>
        </div>
        {todos.length === 0 ? (
          <p className="mt-2 text-[13px] font-medium text-subtle">Sin medicamentos cargados.</p>
        ) : (
          <div className="mt-2 flex flex-col">
            {todos.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-b border-foreground/[0.06] py-[11px] last:border-b-0">
                <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[12px] bg-persona-1-tint text-persona-1-deep">
                  <VitaIcon name="pill" size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold tracking-[-0.01em]">{m.nombre}</div>
                  <div className="mt-0.5 text-[11.5px] font-medium tabular-nums text-subtle">
                    {[m.dosis ? `${m.dosis} ${m.unidad}` : null, `${m.hora_programada.slice(0, 5)} hs`].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activo.esPropio && <BotonPedirAVita />}

      {adherencia && (
        <div className="grid grid-cols-2 rounded-[20px] bg-card py-3.5 shadow-card">
          <Stat label="Racha" valor={`${adherencia.rachaDias} d`} />
          <Stat label="Años con vita" valor={aniosConVita < 0.1 ? "<1" : aniosConVita.toFixed(1)} divisor />
        </div>
      )}
    </div>
  );
}

function Stat({ label, valor, divisor }: { label: string; valor: string; divisor?: boolean }) {
  return (
    <div className={divisor ? "border-l border-foreground/[0.06] text-center" : "text-center"}>
      <div className="font-heading text-[20px] font-extrabold tracking-[-0.03em]">{valor}</div>
      <div className="eyebrow mt-0.5 text-subtle">{label}</div>
    </div>
  );
}
