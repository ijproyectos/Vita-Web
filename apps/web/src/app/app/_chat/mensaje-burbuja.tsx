import Link from "next/link";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

export type MensajeChatUI = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  accion?: { type: string; [clave: string]: unknown };
  // Botones de respuesta rápida (confirmaciones de familia), armados por el servidor.
  opciones?: string[];
  // Opción afirmativa -> id de la acción pendiente en el servidor (confirmación atada).
  vinculos?: Record<string, string>;
  // Si este mensaje del usuario salió de un botón atado: se reenvía igual al reintentar.
  confirmacionId?: string;
  // Reintento sin duplicar: el pedido que se le mandó al servidor, y si no hubo respuesta.
  pedidoId?: string;
  sinRespuesta?: boolean;
};

// Burbujas del chat con vita — porta Message/ActionCard de VitaChat.jsx.
export function MensajeBurbuja({ m, cargando, alCerrar, esPropio, alReintentar, alElegirOpcion }: { m: MensajeChatUI; cargando: boolean; alCerrar: () => void; esPropio: boolean; alReintentar?: (m: MensajeChatUI) => void; alElegirOpcion?: (texto: string, confirmacionId?: string) => void }) {
  if (m.role === "user") {
    return (
      <div className="mb-2.5 flex flex-col items-end gap-1">
        <div className="max-w-[78%] rounded-[20px] rounded-br-[6px] bg-primary px-3.5 py-2.5 text-[14.5px] font-medium leading-snug text-primary-foreground">
          {m.content}
        </div>
        {m.sinRespuesta && alReintentar && (
          <div className="flex items-center gap-2 text-[12px] font-semibold text-destructive">
            <span>Sin respuesta</span>
            <button
              type="button"
              onClick={() => alReintentar(m)}
              className="rounded-full bg-card px-3 py-1 font-bold text-teal-deep shadow-item"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <VitaAvatar size={26} />
        <div className="max-w-[78%] rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] font-medium leading-snug text-foreground shadow-item">
          {cargando ? <PuntosEscribiendo /> : m.content}
        </div>
      </div>
      {m.accion && <TarjetaAccion accion={m.accion} alCerrar={alCerrar} esPropio={esPropio} />}
      {m.opciones && m.opciones.length > 0 && alElegirOpcion && (
        <div className="flex flex-wrap gap-2 pl-9" role="group" aria-label="Respuestas rápidas">
          {m.opciones.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => alElegirOpcion(o, m.vinculos?.[o])}
              className="min-h-11 rounded-full bg-card px-4 py-2.5 text-[14.5px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_var(--teal-100)]"
            >
              {o}
            </button>
          ))}
        </div>
      )}
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

// /app/rutina, /app/medicamentos y /app/turnos listan el perfil ACTIVO. Los
// enlaces solo valen si la acción fue sobre uno mismo y el activo es el propio;
// si fue sobre un familiar (accion.persona) la tarjeta dice para quién y no
// enlaza (evita llevar a la pantalla de otra persona sin cambiar de perfil).
function TarjetaAccion({
  accion,
  alCerrar,
  esPropio,
}: {
  accion: { type: string; [clave: string]: unknown };
  alCerrar: () => void;
  esPropio: boolean;
}) {
  const persona = typeof accion.persona === "string" ? accion.persona : null;
  const editable = esPropio && !persona;
  const base = "ml-9 w-[82%] rounded-[20px] rounded-bl-[6px] bg-card p-3.5 shadow-card";

  switch (accion.type) {
    case "medication_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="pill" texto={persona ? `Agregado a ${persona}` : "Medicamento agregado"} />
          <div className="mt-2.5 rounded-[var(--radius-item)] bg-secondary px-3.5 py-3">
            <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{String(accion.name)}</div>
            <div className="mt-0.5 text-xs font-medium text-subtle">
              {[accion.dose, accion.time && `${accion.time} hs`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && typeof accion.id === "string" && (
              <EnlaceTarjeta alCerrar={alCerrar} href={`/app/medicamentos?editar=${accion.id}`} texto="Ajustar detalles" primario />
            )}
            {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver en Rutina" />}
          </div>
        </div>
      );
    case "appointment_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="stethoscope" texto={persona ? `Turno agendado para ${persona}` : "Turno agendado"} />
          <div className="mt-2.5 rounded-[var(--radius-item)] bg-secondary px-3.5 py-3">
            <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{String(accion.specialty)}</div>
            <div className="mt-0.5 text-xs font-medium text-subtle">
              {String(accion.date)} · {String(accion.time)} hs
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && typeof accion.id === "string" && (
              <EnlaceTarjeta alCerrar={alCerrar} href={`/app/turnos?editar=${accion.id}`} texto="Completar turno" primario />
            )}
            {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver en Rutina" />}
          </div>
        </div>
      );
    case "show_today_medications":
    case "show_all_medications":
      return (
        <div className={cn(base, "flex items-center justify-between gap-3 py-3")}>
          <span className="text-[13.5px] font-medium text-subtle">
            {persona ? `Rutina de ${persona}` : "Tu rutina está actualizada."}
          </span>
          {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver rutina" inline />}
        </div>
      );
    case "open_screen": {
      // Solo navegación: se muestra aunque sea de otra persona. Defensivo con el href.
      if (typeof accion.href !== "string" || !(accion.href === "/app" || accion.href.startsWith("/app/"))) return null;
      const label = typeof accion.label === "string" && accion.label.trim() !== "" ? accion.label : "esta pantalla";
      return (
        <div className={cn(base, "flex items-center justify-between gap-3 py-3")}>
          <span className="flex items-center gap-2 text-[13.5px] font-medium text-subtle">
            <VitaIcon name="chevron-right" size={15} />
            {label}
          </span>
          <EnlaceTarjeta alCerrar={alCerrar} href={accion.href} texto={`Abrir ${label}`} primario inline />
        </div>
      );
    }
    default:
      return null;
  }
}

function CabeceraTarjeta({ icon, texto }: { icon: string; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-full bg-persona-1-tint text-persona-1-deep">
        <VitaIcon name={icon} size={15} />
      </div>
      <div className="font-heading text-[13px] font-bold">{texto}</div>
    </div>
  );
}

function EnlaceTarjeta({
  href,
  texto,
  inline,
  primario,
  alCerrar,
}: {
  href: string;
  texto: string;
  inline?: boolean;
  primario?: boolean;
  alCerrar: () => void;
}) {
  // El chat es un overlay fijo encima de la app: navegar sin cerrarlo deja
  // la pantalla nueva tapada. Se cierra y se navega.
  return (
    <Link
      href={href}
      onClick={alCerrar}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3.5 py-2 font-heading text-[12.5px] font-bold",
        primario ? "bg-primary text-primary-foreground" : "bg-secondary text-teal-deep",
        !inline && "mt-2.5"
      )}
    >
      {texto}
      <VitaIcon name="chevron-right" size={13} />
    </Link>
  );
}
