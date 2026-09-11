import Link from "next/link";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

export type MensajeChatUI = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  accion?: { type: string; [clave: string]: unknown };
};

// Burbujas del chat con vita — porta Message/ActionCard de VitaChat.jsx.
export function MensajeBurbuja({ m, cargando }: { m: MensajeChatUI; cargando: boolean }) {
  if (m.role === "user") {
    return (
      <div className="mb-2.5 flex justify-end">
        <div className="max-w-[78%] rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-[#22d3ee] to-[#0e7490] px-3.5 py-2.5 text-[14.5px] leading-snug text-white shadow-[0_6px_14px_rgba(8,145,178,0.22)]">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <VitaAvatar size={26} />
        <div className="max-w-[78%] rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] leading-snug text-foreground shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
          {cargando ? <PuntosEscribiendo /> : m.content}
        </div>
      </div>
      {m.accion && <TarjetaAccion accion={m.accion} />}
    </div>
  );
}

function PuntosEscribiendo() {
  return (
    <span className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-primary"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function TarjetaAccion({ accion }: { accion: { type: string; [clave: string]: unknown } }) {
  const base = "ml-9 w-[82%] rounded-[20px] rounded-bl-[6px] bg-card p-3.5 shadow-[0_8px_24px_rgba(15,33,54,0.06)]";

  switch (accion.type) {
    case "medication_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="pill" texto="Medicamento agregado" />
          <div className="mt-2.5 rounded-[14px] bg-muted px-3.5 py-3">
            <div className="font-heading text-[15px] font-bold">{String(accion.name)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {[accion.dose, accion.time && `${accion.time} hs`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <EnlaceTarjeta href="/app/rutina" texto="Ver en Rutina" />
        </div>
      );
    case "appointment_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="stethoscope" texto="Turno agendado" />
          <div className="mt-2.5 rounded-[14px] bg-muted px-3.5 py-3">
            <div className="font-heading text-[15px] font-bold">{String(accion.specialty)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {String(accion.date)} · {String(accion.time)} hs
            </div>
          </div>
          <EnlaceTarjeta href="/app/rutina" texto="Ver en Rutina" />
        </div>
      );
    case "show_today_medications":
    case "show_all_medications":
      return (
        <div className={cn(base, "flex items-center justify-between gap-3 py-3")}>
          <span className="text-[13.5px] text-muted-foreground">Tu rutina está actualizada.</span>
          <EnlaceTarjeta href="/app/rutina" texto="Ver rutina" inline />
        </div>
      );
    default:
      return null;
  }
}

function CabeceraTarjeta({ icon, texto }: { icon: string; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-full bg-chip-teal-bg text-chip-teal-ink">
        <VitaIcon name={icon} size={15} />
      </div>
      <div className="font-heading text-[13px] font-bold">{texto}</div>
    </div>
  );
}

function EnlaceTarjeta({ href, texto, inline }: { href: string; texto: string; inline?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-3.5 py-2 font-heading text-[12.5px] font-bold text-foreground",
        !inline && "mt-2.5"
      )}
    >
      {texto}
      <VitaIcon name="chevron-right" size={13} />
    </Link>
  );
}
