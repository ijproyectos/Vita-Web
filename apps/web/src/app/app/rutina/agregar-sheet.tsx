"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// "Agregar a tu rutina" — porta AddSheet de RutinaScreen.jsx (3 opciones:
// medicamento, turno, o pedírselo a vita en texto libre).
export function AgregarSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { abrir } = useChatOverlay();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
        <SheetHeader>
          <SheetTitle>Agregar a tu rutina</SheetTitle>
          <SheetDescription>¿Qué querés guardar hoy?</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <OpcionAgregar
            icon="pill"
            tinte="bg-chip-teal-bg text-chip-teal-ink"
            titulo="Medicamento"
            sub="Dosis, horario y duración"
            href="/app/agregar-medicamento"
          />
          <OpcionAgregar
            icon="stethoscope"
            tinte="bg-[#ecfeff] text-[#155e75]"
            titulo="Turno médico"
            sub="Especialidad, profesional, fecha"
            href="/app/agregar-turno"
          />
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              abrir();
            }}
            className="flex items-center gap-3 rounded-[20px] bg-card p-3.5 text-left shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0891b2] to-[#0e7490] text-white">
              <VitaIcon name="sparkle" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[15px] font-bold">
                Pedírselo a vita <span className="ml-1 text-xs text-primary">✨</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">Contame con tus palabras y lo agendo</div>
            </div>
            <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OpcionAgregar({
  icon,
  tinte,
  titulo,
  sub,
  href,
}: {
  icon: string;
  tinte: string;
  titulo: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[20px] bg-card p-3.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tinte}`}>
        <VitaIcon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[15px] font-bold">{titulo}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      </div>
      <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
    </Link>
  );
}
