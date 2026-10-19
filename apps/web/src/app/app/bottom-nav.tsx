"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { cn } from "@/lib/utils";

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
  // Modo simple (fase 3.5): pantalla única sin nav ni FAB — el FAB de
  // chat se monta acá adentro de BottomNav, así que ocultar el nav lo
  // oculta también, sin tocar layout.tsx.
  "/app/modo-simple",
];

export function BottomNav() {
  const pathname = usePathname();
  const { abrir } = useChatOverlay();

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
        <NavItem key={item.href} {...item} activo={esActivo(pathname, item.href)} />
      ))}
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
}: {
  href: string;
  icon: string;
  label: string;
  activo: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-[5px] rounded-[18px] px-0.5 py-2 font-sans text-[10.5px] font-bold tracking-[-0.01em] transition-colors",
        activo ? "text-primary" : "text-subtle"
      )}
    >
      <VitaIcon name={icon} size={21} strokeWidth={1.9} />
      <span>{label}</span>
    </Link>
  );
}
