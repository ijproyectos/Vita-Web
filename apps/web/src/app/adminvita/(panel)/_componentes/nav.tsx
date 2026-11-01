"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { VitaIcon } from "@/lib/vita-icons";

const ITEMS = [
  { href: "/adminvita", etiqueta: "Resumen", icono: "home", exacto: true },
  { href: "/adminvita/usuarios", etiqueta: "Usuarios", icono: "users", exacto: false },
  { href: "/adminvita/ia", etiqueta: "IA y costos", icono: "chart", exacto: false },
  { href: "/adminvita/vita-plus", etiqueta: "vita+", icono: "sparkle", exacto: false },
  { href: "/adminvita/codigos", etiqueta: "Códigos", icono: "lock", exacto: false },
  { href: "/adminvita/sistema", etiqueta: "Sistema", icono: "settings", exacto: false },
] as const;

export function NavAdmin() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto">
      {ITEMS.map((it) => {
        const activo = it.exacto ? ruta === it.href : ruta.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold ${
              activo ? "bg-teal text-on-ink" : "text-slate-brand hover:bg-line-soft"
            }`}
          >
            <VitaIcon name={it.icono} size={16} />
            {it.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
