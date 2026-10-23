"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { RELACIONES_CUIDADOR, type ColorPerfil, type RolVinculo } from "@/lib/familia/tipos";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { TarjetasPermiso } from "@/components/vita/tarjetas-permiso";
import { invitarCuidadorAction, type ResultadoInvitar } from "../actions";

export type PersonaInvitable = { id: string; nombre: string; sub: string; color: ColorPerfil; propia: boolean };

const ETIQUETA = "eyebrow px-1 pb-2.5 text-subtle";
const CAMPO =
  "w-full rounded-full bg-card px-[18px] py-[15px] text-[14.5px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus:shadow-[0_0_0_2px_var(--primary)]";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export function FormularioInvitar({ personas, personaInicial }: { personas: PersonaInvitable[]; personaInicial: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [relacion, setRelacion] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState(personaInicial);
  const [rol, setRol] = useState<RolVinculo>("ver");
  const [pendiente, startTransition] = useTransition();
  const [enviada, setEnviada] = useState<Extract<ResultadoInvitar, { status: "success" }> | null>(null);
  const [copiado, setCopiado] = useState(false);

  const persona = personas.find((p) => p.id === personaId) ?? personas[0];
  const primerNombre = nombre.trim().split(/\s+/)[0] || "tu familiar";
  const listo = nombre.trim().length > 0 && EMAIL_RE.test(email.trim());

  function crear() {
    if (!nombre.trim()) return toast("Escribí su nombre");
    if (!EMAIL_RE.test(email.trim())) return toast("Ingresá un email válido");
    startTransition(async () => {
      try {
        const r = await invitarCuidadorAction({ personaId, nombre, email, relacion, rol });
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        setEnviada(r);
        router.refresh();
      } catch {
        toast.error("No pudimos crear la invitación. Probá de nuevo.");
      }
    });
  }

  function textoInvitacion(url: string) {
    const quien = persona.propia ? "a mí" : `a ${persona.nombre}`;
    return `Hola ${primerNombre}, te invito a cuidar ${quien} en vita. Aceptá la invitación con tu cuenta de Google (${email.trim()}): ${url}`;
  }

  function whatsapp(url: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoInvitacion(url))}`, "_blank", "noopener,noreferrer");
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No pudimos copiar el link.");
    }
  }

  if (enviada) {
    const rolNombre = rol === "editar" ? "Admin" : "Lector";
    const quien = persona.propia ? "a vos" : persona.nombre;
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col items-center rounded-[22px] bg-card px-[18px] pb-5 pt-[22px] text-center shadow-card">
          <div className="eyebrow text-subtle">Invitación para {primerNombre}</div>
          <div className="mt-3.5 w-full rounded-[16px] bg-secondary px-3.5 py-3 text-left">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Link de invitación</div>
            <div className="mt-1 break-all text-[12.5px] font-semibold leading-[1.4] text-teal-deep">{enviada.url}</div>
          </div>
          <p className="mt-3.5 max-w-[300px] text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            {primerNombre} entra con la cuenta de Google de <b className="text-foreground">{enviada.email}</b> y ya ve{" "}
            {quien === "a vos" ? "tus remedios" : `a ${quien}`}. Entra como {rolNombre}.
          </p>
          <div className="mt-[18px] flex w-full gap-2">
            <button
              type="button"
              onClick={() => whatsapp(enviada.url)}
              className="flex-1 rounded-full bg-primary py-[13px] font-heading text-sm font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
            >
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              onClick={() => copiar(enviada.url)}
              className="rounded-full bg-card px-[22px] py-[13px] font-heading text-sm font-extrabold text-teal-deep shadow-[inset_0_0_0_1.5px_var(--chip-teal-bg)]"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
        <p className="px-1 text-pretty text-[12.5px] font-medium leading-[1.45] text-subtle">
          {enviada.emailEnviado
            ? `Le mandamos la invitación por mail a ${enviada.email}. `
            : "No pudimos mandar el mail: compartí el link. "}
          La invitación vence en 7 días.
        </p>
        <button
          type="button"
          onClick={() => router.push("/app/familia")}
          className="rounded-full bg-primary py-[15px] font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <label className="flex flex-col">
        <span className={ETIQUETA}>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Martina" className={CAMPO} />
      </label>

      <label className="flex flex-col">
        <span className={ETIQUETA}>Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="martina@gmail.com"
          className={CAMPO}
        />
        <span className="px-1 pt-2 text-[11.5px] font-medium leading-[1.4] text-subtle">
          Con este mail entra a vita: tiene que ser el de su cuenta de Google.
        </span>
      </label>

      <div className="flex flex-col">
        <span className={ETIQUETA}>Relación</span>
        <div role="radiogroup" aria-label="Relación" className="flex flex-wrap gap-2">
          {RELACIONES_CUIDADOR.map((r) => {
            const on = relacion === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRelacion(on ? null : r)}
                className={cn(
                  "rounded-full px-4 py-[11px] font-heading text-sm font-extrabold transition-colors",
                  on ? "bg-primary text-primary-foreground shadow-cta" : "bg-card shadow-item"
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col">
        <span className={ETIQUETA}>Va a cuidar a</span>
        <div role="radiogroup" aria-label="Va a cuidar a" className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {personas.map((p, i) => {
            const on = p.id === personaId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPersonaId(p.id)}
                className={cn("flex w-full items-center gap-[13px] px-4 py-3.5 text-left", i > 0 && "border-t border-foreground/[0.06]")}
              >
                <AvatarPersona nombre={p.nombre} color={p.color} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{p.nombre}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] font-medium text-subtle">{p.sub}</span>
                </span>
                {on && (
                  <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[5px] text-[11.5px] font-extrabold", "bg-chip-teal-bg text-chip-teal-ink")}>
                    <VitaIcon name="check" size={12} strokeWidth={3} />
                    Elegida
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col">
        <span className={ETIQUETA}>Permiso</span>
        <TarjetasPermiso valor={rol} onChange={setRol} etiqueta="Permiso" puedeAdministrarCuidadores={!persona.propia} />
      </div>

      <button
        type="button"
        onClick={crear}
        disabled={pendiente}
        className={cn(
          "rounded-full py-[15px] font-heading text-[14.5px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-70",
          listo ? "bg-primary shadow-cta" : "bg-line-strong shadow-none"
        )}
      >
        {pendiente ? "Creando…" : "Crear invitación"}
      </button>
    </div>
  );
}
