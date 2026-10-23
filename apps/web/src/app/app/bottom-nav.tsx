"use client";

import Link, { useLinkStatus } from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { cn } from "@/lib/utils";
import { SelectorPerfil } from "@/components/vita/selector-perfil";
import type { OpcionPerfil } from "@/lib/familia/tipos";

const ITEMS = [
  { href: "/app", icon: "home", label: "Inicio" },
  { href: "/app/rutina", icon: "routine", label: "Rutina" },
  { href: "/app/mi-salud", icon: "activity", label: "Mi Salud" },
  { href: "/app/perfil", icon: "user", label: "Perfil" },
];

// Pantallas de formulario/detalle ocultan el bottom nav — mismo criterio
// que el harness original del diseño
// (`active !== 'resumen-salud' && active !== 'agregar-turno' && ...`).
const SIN_NAV = [
  "/app/agregar-medicamento",
  "/app/agregar-turno",
  "/app/resumen-salud",
  "/app/mi-salud/agregar-estudio",
  "/app/mi-salud/monitoreo/agregar",
  // Modo simple (fase 3.5): pantalla única sin nav ni FAB — el FAB de
  // chat se monta acá adentro de BottomNav, así que ocultar el nav lo
  // oculta también, sin tocar layout.tsx.
  "/app/modo-simple",
  "/app/vita-plus",
];

// Pulsación larga en "Perfil" (V7): abre el selector de perfiles sin entrar a la pantalla.
const MS_PULSACION_LARGA = 480;

export function BottomNav({ opciones, activoId }: { opciones: OpcionPerfil[] | null; activoId: string }) {
  const pathname = usePathname();
  const { abrir } = useChatOverlay();
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  if (SIN_NAV.some((p) => pathname.startsWith(p))) return null;

  const izquierda = ITEMS.slice(0, 2);
  const derecha = ITEMS.slice(2);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-3 z-30 mx-auto grid h-[74px] max-w-md grid-cols-[1fr_1fr_86px_1fr_1fr] items-center rounded-[30px] bg-card px-1.5 shadow-nav"
      style={{ bottom: "var(--safe-bottom-nav)" }}
    >
      {izquierda.map((item) => (
        <NavItem key={item.href} {...item} activo={esActivo(pathname, item.href)} />
      ))}

      <div className="relative flex h-full justify-center">
        {/* V7: el FAB central muestra el isotipo (V sobre teal), no el
            personaje. Mismo botón y misma función: abre el chat con vita. */}
        <button
          type="button"
          onClick={() => abrir()}
          aria-label="Abrir chat con vita"
          className="absolute -top-[26px] flex size-16 items-center justify-center rounded-full shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_40%,transparent)] transition-transform active:scale-[0.93] motion-reduce:transition-none"
        >
          <VMark size={64} forma="circulo" />
        </button>
        <span
          aria-hidden
          className="absolute bottom-[11px] font-heading text-[10.5px] font-extrabold tracking-[-0.02em] text-primary"
        >
          vita
        </span>
      </div>

      {derecha.map((item) => (
        <NavItem
          key={item.href}
          {...item}
          activo={esActivo(pathname, item.href)}
          alPulsacionLarga={item.href === "/app/perfil" && opciones ? () => setSelectorAbierto(true) : undefined}
        />
      ))}
      {opciones && (
        <SelectorPerfil opciones={opciones} activoId={activoId} abierto={selectorAbierto} onAbiertoChange={setSelectorAbierto} />
      )}
    </nav>
  );
}

// "/app" solo es activo en Home; el resto también en sus subrutas.
function esActivo(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  icon,
  label,
  activo,
  alPulsacionLarga,
}: {
  href: string;
  icon: string;
  label: string;
  activo: boolean;
  alPulsacionLarga?: () => void;
}) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disparada = useRef(false);

  function empezar() {
    if (!alPulsacionLarga) return;
    disparada.current = false;
    temporizador.current = setTimeout(() => {
      disparada.current = true;
      try {
        navigator.vibrate?.(15);
      } catch {
        /* sin vibración: no importa */
      }
      alPulsacionLarga();
    }, MS_PULSACION_LARGA);
  }

  function cancelar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }

  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      onPointerDown={empezar}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onPointerCancel={cancelar}
      onContextMenu={alPulsacionLarga ? (e) => e.preventDefault() : undefined}
      onClick={(e) => {
        // La pulsación larga ya abrió el selector: no se navega al soltar.
        if (disparada.current) {
          e.preventDefault();
          disparada.current = false;
        }
      }}
      draggable={false}
      className={cn(
        "flex select-none flex-col items-center gap-[5px] rounded-[18px] px-0.5 py-2 font-sans text-[10.5px] font-bold tracking-[-0.01em] transition-colors [-webkit-touch-callout:none]",
        activo ? "text-primary" : "text-subtle"
      )}
    >
      <ContenidoNavItem icon={icon} label={label} />
    </Link>
  );
}

// useLinkStatus solo funciona como hijo del <Link>: da feedback inmediato
// (ícono pulsando) mientras el servidor responde, así no se vuelve a tocar.
function ContenidoNavItem({ icon, label }: { icon: string; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <VitaIcon name={icon} size={21} strokeWidth={1.9} className={pending ? "animate-pulse" : undefined} />
      <span className={pending ? "opacity-60" : undefined}>{label}</span>
    </>
  );
}
