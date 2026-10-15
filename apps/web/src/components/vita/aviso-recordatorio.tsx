import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { horaCorta } from "@/lib/notificaciones/mensajes";
import { cn } from "@/lib/utils";

type Item = { medicamentoId: string; nombre: string; horaProgramada: string };

/**
 * Aviso tranquilo: un familiar le recordó una toma que sigue pendiente. El
 * server component que lo usa ya filtró las dosis tomadas, así que
 * desaparece solo apenas la toma se registra.
 */
export function AvisoRecordatorio({
  items,
  href,
  grande,
  className,
}: {
  items: Item[];
  href?: string;
  grande?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;

  const contenido = (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip-teal-bg text-chip-teal-ink">
        <VitaIcon name="bell" size={20} />
      </div>
      <div className="min-w-0 flex-1">
        {items.map((r) => (
          <div key={r.medicamentoId} className={cn("font-semibold", grande ? "text-[17px]" : "text-[13.5px]")}>
            Tu familiar te recuerda tomar {r.nombre} de las {horaCorta(r.horaProgramada)}
          </div>
        ))}
      </div>
    </div>
  );

  const clases = cn("rounded-[20px] bg-card p-4 shadow-card", className);
  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
