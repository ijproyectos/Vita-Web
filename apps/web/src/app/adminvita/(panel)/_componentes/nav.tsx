"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { urlVitaTrack } from "@/lib/admin/testing/vita-track";
import { VitaIcon } from "@/lib/vita-icons";

const ITEMS = [
  { href: "/adminvita", etiqueta: "Resumen", exacto: true },
  { href: "/adminvita/usuarios", etiqueta: "Usuarios", exacto: false },
  { href: "/adminvita/ia", etiqueta: "IA y costos", exacto: false },
  { href: "/adminvita/chat", etiqueta: "Chat", exacto: false },
  { href: "/adminvita/vita-plus", etiqueta: "vita+", exacto: false },
  { href: "/adminvita/codigos", etiqueta: "Códigos", exacto: false },
  { href: "/adminvita/notificaciones", etiqueta: "Notificaciones", exacto: false },
  { href: "/adminvita/testing", etiqueta: "Testing", exacto: false },
  { href: "/adminvita/administradores", etiqueta: "Administradores", exacto: false },
  { href: "/adminvita/sistema", etiqueta: "Sistema", exacto: false },
] as const;

// NEXT_PUBLIC_* se incrusta al compilar. Sin variable (o inválida) no hay link.
const VITA_TRACK = urlVitaTrack(process.env.NEXT_PUBLIC_VITA_TRACK_URL);

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
      {VITA_TRACK ? (
        <a
          href={VITA_TRACK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-slate-brand transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-teal motion-reduce:transition-none"
        >
          vita track
          <VitaIcon name="arrow-up-right" size={14} />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      ) : null}
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
