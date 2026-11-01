"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { VitaIcon } from "@/lib/vita-icons";

const ITEMS = [
  { href: "/adminvita", etiqueta: "Resumen", exacto: true },
  { href: "/adminvita/usuarios", etiqueta: "Usuarios", exacto: false },
  { href: "/adminvita/ia", etiqueta: "IA y costos", exacto: false },
  { href: "/adminvita/vita-plus", etiqueta: "vita+", exacto: false },
  { href: "/adminvita/codigos", etiqueta: "Códigos", exacto: false },
  { href: "/adminvita/notificaciones", etiqueta: "Notificaciones", exacto: false },
  { href: "/adminvita/administradores", etiqueta: "Administradores", exacto: false },
  { href: "/adminvita/sistema", etiqueta: "Sistema", exacto: false },
] as const;

export function NavAdmin() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto rounded-full bg-panel-track p-1.5">
      {ITEMS.map((it) => {
        const activo = it.exacto ? ruta === it.href : ruta.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={activo ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-teal motion-reduce:transition-none ${
              activo ? "bg-card text-ink shadow-panel" : "text-slate-brand hover:text-ink"
            }`}
          >
            {it.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

export function BotonActualizar() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      aria-label="Actualizar datos"
      title="Actualizar datos"
      onClick={() => iniciar(() => router.refresh())}
      className="flex size-10 items-center justify-center rounded-full bg-panel-track text-slate-brand transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-teal motion-reduce:transition-none"
    >
      <VitaIcon name="refresh" size={17} className={pendiente ? "animate-spin motion-reduce:animate-none" : ""} />
    </button>
  );
}
