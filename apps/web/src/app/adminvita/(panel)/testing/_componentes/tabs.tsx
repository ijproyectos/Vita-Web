"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/adminvita/testing", etiqueta: "Resumen", exacto: true },
  { href: "/adminvita/testing/mis-pruebas", etiqueta: "Mis pruebas", exacto: false },
  { href: "/adminvita/testing/rondas", etiqueta: "Rondas", exacto: false },
  { href: "/adminvita/testing/casos", etiqueta: "Casos", exacto: false },
  { href: "/adminvita/testing/bugs", etiqueta: "Bugs", exacto: false },
  { href: "/adminvita/testing/reportes", etiqueta: "Reportes de testers", exacto: false },
] as const;

export function TabsTesting() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de testing" className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-panel-track p-1">
      {TABS.map((t) => {
        const activo = t.exacto ? ruta === t.href : ruta.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={activo ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-teal ${activo ? "bg-teal text-on-ink" : "text-slate-brand hover:text-ink"}`}
          >
            {t.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
