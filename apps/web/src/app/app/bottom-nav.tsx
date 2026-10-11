"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", icon: "home", label: "Inicio" },
  { href: "/app/rutina", icon: "routine", label: "Rutina" },
  { href: "/app/mi-salud", icon: "heart-plus", label: "Mi Salud" },
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
    <div
      className="fixed inset-x-3 z-30 mx-auto grid h-[76px] max-w-md grid-cols-[1fr_1fr_88px_1fr_1fr] items-center rounded-[32px] bg-card px-1.5 shadow-[0_12px_36px_color-mix(in_srgb,var(--ink)_12%,transparent)]"
      style={{ bottom: "var(--safe-bottom-nav)" }}
    >
      {izquierda.map((item) => (
        <NavItem key={item.href} {...item} activo={pathname === item.href} />
      ))}

      <div className="relative flex h-full items-start justify-center">
        <button
          type="button"
          onClick={() => abrir()}
          aria-label="Abrir chat con vita"
          className="absolute -top-12 flex size-[92px] items-center justify-center rounded-full bg-gradient-to-br from-brand-from to-brand-to shadow-[0_14px_28px_color-mix(in_srgb,var(--primary)_35%,transparent),0_6px_12px_color-mix(in_srgb,var(--primary)_22%,transparent)] transition-transform active:scale-95"
        >
          {/* El personaje, no el ícono plano — pedido explícito: el mismo
              avatar del chat también presente acá, en el botón central que
              abre la conversación desde cualquier pantalla, con más
              presencia — botón de 92px que sobresale de la barra y avatar
              3D de 84px, a pedido explícito ("una de las partes más usadas,
              debe estar visible"). "idle" porque acá no hay una conversación en curso
              todavía (es el gesto que la arranca), mismo criterio que el
              resto de los call sites estáticos de VitaAvatar. */}
          <VitaAvatar size={84} />
        </button>
        <span className="absolute bottom-[10px] font-heading text-[11px] font-bold tracking-tight text-primary">
          vita
        </span>
      </div>

      {derecha.map((item) => (
        <NavItem key={item.href} {...item} activo={pathname === item.href} />
      ))}
    </div>
  );
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
      className={cn(
        "flex flex-col items-center gap-1 rounded-[18px] px-1 py-2 font-sans text-[11px] font-semibold transition-colors",
        activo ? "text-primary" : "text-muted-foreground"
      )}
    >
      <VitaIcon name={icon} size={22} />
      <span>{label}</span>
      <span
        className={cn(
          "h-1 w-1 rounded-full bg-primary transition-opacity",
          activo ? "opacity-100" : "opacity-0"
        )}
      />
    </Link>
  );
}
