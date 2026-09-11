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
  { href: "/app/mi-salud", icon: "heart-plus", label: "Mi Salud" },
  { href: "/app/perfil", icon: "user", label: "Perfil" },
];

// Pantallas de formulario/detalle ocultan el bottom nav — mismo criterio
// que el harness original del diseño
// (`active !== 'resumen-salud' && active !== 'agregar-turno' && ...`).
const SIN_NAV = ["/app/agregar-medicamento", "/app/agregar-turno", "/app/resumen-salud"];

export function BottomNav() {
  const pathname = usePathname();
  const { abrir } = useChatOverlay();

  if (SIN_NAV.some((p) => pathname.startsWith(p))) return null;

  const izquierda = ITEMS.slice(0, 2);
  const derecha = ITEMS.slice(2);

  return (
    <div className="fixed inset-x-3 bottom-[18px] z-30 mx-auto grid h-[76px] max-w-md grid-cols-[1fr_1fr_88px_1fr_1fr] items-center rounded-[32px] bg-card px-1.5 shadow-[0_12px_36px_rgba(15,33,54,0.12)]">
      {izquierda.map((item) => (
        <NavItem key={item.href} {...item} activo={pathname === item.href} />
      ))}

      <div className="relative flex h-full items-start justify-center">
        <button
          type="button"
          onClick={() => abrir()}
          aria-label="Abrir chat con vita"
          className="absolute -top-7 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] shadow-[0_14px_28px_rgba(8,145,178,0.35),0_6px_12px_rgba(8,145,178,0.22)] transition-transform active:scale-95"
        >
          <VMark size={30} />
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
        "flex flex-col items-center gap-1 rounded-[18px] px-1 py-2 font-body text-[11px] font-semibold transition-colors",
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
