"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefNuevaMedicion } from "@/lib/mediciones/tipos";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { VMark } from "@/components/vita/v-mark";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// "Agregar a tu rutina" (V7 ADD SHEET): medicamento, turno, medición o
// pedírselo a vita. Con `tipo="salud"` (el "+" de Mi Salud) ofrece estudio y
// vita. "Contar pastillas" es app-only y se conserva en la rutina.
export function AgregarSheet({
  open,
  onOpenChange,
  tipo = "rutina",
  nombrePersona,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo?: "rutina" | "salud";
  /** Primer nombre cuando el perfil activo es otra persona. */
  nombrePersona?: string | null;
}) {
  const { abrir } = useChatOverlay();
  const pathname = usePathname();
  const titulo =
    tipo === "salud"
      ? nombrePersona ? `Agregar a la salud de ${nombrePersona}` : "Agregar a tu salud"
      : nombrePersona ? `Agregar a la rutina de ${nombrePersona}` : "Agregar a tu rutina";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-[28px] bg-card px-4 pb-[42px] pt-3.5">
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded bg-line-soft" />
        <SheetTitle className="px-1 font-heading text-lg font-extrabold tracking-[-0.02em]">{titulo}</SheetTitle>
        <SheetDescription className="px-1 pb-3.5 pt-1 text-[12.5px] font-medium text-subtle">¿Qué querés guardar hoy?</SheetDescription>
        <div className="flex flex-col gap-[9px]">
          {tipo === "rutina" && (
            <>
              <Opcion
                icon="pill"
                tinte="bg-chip-teal-bg text-chip-teal-ink"
                titulo="Medicamento"
                sub="Dosis, frecuencia y horarios"
                href="/app/agregar-medicamento"
              />
              <Opcion
                icon="stethoscope"
                tinte="bg-chip-amber-bg text-chip-amber-ink"
                titulo="Turno médico"
                sub="Especialidad, profesional, fecha"
                href="/app/agregar-turno"
              />
              <Opcion
                icon="chart"
                tinte="bg-chip-violet-bg text-chip-violet-ink"
                titulo="Medición"
                sub="Presión, glucemia o peso"
                href={hrefNuevaMedicion({ volver: pathname })}
              />
              <Opcion
                icon="camera"
                tinte="bg-chip-teal-bg text-chip-teal-ink"
                titulo="Contar pastillas"
                sub="Foto del blister y control de stock"
                href="/app/pastillas/contar"
              />
            </>
          )}
          {tipo === "salud" && (
            <Opcion
              icon="doc"
              tinte="bg-chip-amber-bg text-chip-amber-ink"
              titulo="Estudio"
              sub="Foto o PDF del resultado"
              href="/app/mi-salud/agregar-estudio"
            />
          )}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              abrir();
            }}
            className="flex items-center gap-[13px] rounded-[18px] bg-canvas/60 p-3.5 text-left transition-colors hover:bg-canvas"
          >
            <VMark size={44} forma="circulo" className="shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">Pedírselo a vita</div>
              <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Contame con tus palabras y lo agendo</div>
            </div>
            <VitaIcon name="chevron-right" size={17} className="text-faint" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Opcion({
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
    <Link href={href} className="flex items-center gap-[13px] rounded-[18px] bg-canvas/60 p-3.5 transition-colors hover:bg-canvas">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] ${tinte}`}>
        <VitaIcon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{titulo}</div>
        <div className="mt-0.5 text-[11.5px] font-medium text-subtle">{sub}</div>
      </div>
      <VitaIcon name="chevron-right" size={17} className="text-faint" />
    </Link>
  );
}
