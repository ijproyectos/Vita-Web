"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Send, Pill, History, Plus } from "lucide-react";
import { HistorialSheet } from "./historial-sheet";
import type { MensajeChat, SesionChat } from "@/lib/chat/tipos";

type Mensaje = {
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO — de la DB si ya se persistió, si no Date local
  verMedicamentos?: boolean;
};

const MENSAJE_INICIAL: Mensaje = {
  role: "assistant",
  content:
    "Hola, soy tu asistente de Vitapp. Puedo mostrarte tus medicamentos de hoy, agregar uno nuevo, o marcar que ya tomaste alguno. ¿En qué te ayudo?",
  timestamp: new Date().toISOString(),
};

function formatoHora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function manejarAccion(accion: { type: string; [clave: string]: unknown }, agregarVerMedicamentos: () => void) {
  switch (accion.type) {
    case "show_today_medications":
    case "show_all_medications":
      agregarVerMedicamentos();
      break;
    case "medication_taken":
      toast.success(`"${accion.medication_name}" marcado como tomado.`);
      break;
    case "all_medications_taken":
      toast.success("Marcaste todos los medicamentos de hoy como tomados.");
      break;
    case "medication_deleted":
      toast.success("Medicamento eliminado.");
      break;
  }
}

export function ChatView({
  sesionId: sesionIdInicial,
  mensajesIniciales,
  sesiones,
}: {
  sesionId: string | null;
  mensajesIniciales: MensajeChat[];
  sesiones: SesionChat[];
}) {
  const router = useRouter();
  const [sesionId, setSesionId] = useState(sesionIdInicial);
  const [mensajes, setMensajes] = useState<Mensaje[]>(
    mensajesIniciales.length > 0
      ? mensajesIniciales.map((m) => ({ role: m.role, content: m.contenido, timestamp: m.created_at }))
      : [MENSAJE_INICIAL]
  );
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  function scrollAlFinal() {
    requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    const texto = entrada.trim();
    if (!texto || enviando) return;

    const ahora = new Date().toISOString();
    setMensajes((prev) => [
      ...prev,
      { role: "user", content: texto, timestamp: ahora },
      { role: "assistant", content: "", timestamp: ahora },
    ]);
    setEntrada("");
    setEnviando(true);
    scrollAlFinal();

    // El servidor solo manda el evento "session" cuando el sesionId que
    // le pasamos no era válido (no había, o no era del usuario — ver
    // sesionPerteneceAUsuario en lib/chat/nucleo.ts) y tuvo que crear/
    // reasignar uno — en cualquiera de esos dos casos hay que
    // resincronizar la URL al terminar.
    let sesionAsignada: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesionId, mensaje: texto }),
      });

      if (!res.body) throw new Error("Sin respuesta del servidor.");
      const lector = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lineas = buffer.split("\n\n");
        buffer = lineas.pop() ?? "";

        for (const linea of lineas) {
          if (!linea.startsWith("data: ")) continue;
          const payload = linea.slice("data: ".length);
          if (payload === "[DONE]") continue;

          const evento = JSON.parse(payload) as
            | { chunk: string }
            | { action: { type: string; [clave: string]: unknown } }
            | { error: string }
            | { session: string };

          if ("session" in evento) {
            sesionAsignada = evento.session;
            setSesionId(evento.session);
          } else if ("chunk" in evento) {
            setMensajes((prev) => {
              const copia = [...prev];
              copia[copia.length - 1] = {
                ...copia[copia.length - 1],
                content: copia[copia.length - 1].content + evento.chunk,
              };
              return copia;
            });
            scrollAlFinal();
          } else if ("action" in evento) {
            manejarAccion(evento.action, () => {
              setMensajes((prev) => {
                const copia = [...prev];
                copia[copia.length - 1] = { ...copia[copia.length - 1], verMedicamentos: true };
                return copia;
              });
            });
          } else if ("error" in evento) {
            toast.error(evento.error);
          }
        }
      }
    } catch {
      toast.error("No se pudo conectar con el asistente. Intentá de nuevo.");
    } finally {
      setEnviando(false);
      // Recién ahora (stream terminado, ya persistido en la DB) sincronizo
      // la URL — hacerlo antes remontaría <ChatView> a mitad de la
      // respuesta (page.tsx la key-ea por sesionId para que cambiar de
      // sesión desde el drawer resetee el estado correctamente), perdiendo
      // lo que se estaba mostrando. Acá el remount es inofensivo: los
      // mensajes recién guardados son los mismos que trae mensajesIniciales.
      if (sesionAsignada) {
        router.replace(`/app/chat?sesion=${sesionAsignada}`, { scroll: false });
      }
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] w-full max-w-2xl flex-col">
      {/* Toolbar de la pantalla de Chat — replica los actions del AppBar
          original (Icons.add "New Chat") más el disparador del Drawer de
          historial (acá no hay swipe-from-edge, así que necesita un botón
          propio). Toggle de idioma/tema del original: fuera de alcance,
          esta app no maneja tema ni locale. */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => setHistorialAbierto(true)}>
          <History className="size-4" />
          Historial
        </Button>
        <span className="text-sm font-medium">Asistente Vita AI</span>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/app/chat" />}
        >
          <Plus className="size-4" />
          Nuevo
        </Button>
      </div>

      <HistorialSheet
        open={historialAbierto}
        onOpenChange={setHistorialAbierto}
        sesiones={sesiones}
        sesionActivaId={sesionId}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {mensajes.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="flex max-w-[80%] flex-col gap-1">
              {m.role === "assistant" && (
                <span className="pl-1 text-[10px] font-bold text-muted-foreground">Asistente</span>
              )}
              <div
                className={
                  "px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm " +
                  (m.role === "user"
                    ? "rounded-2xl rounded-br-none bg-chat-sent text-chat-sent-foreground"
                    : "rounded-2xl rounded-bl-none bg-chat-received text-chat-received-foreground")
                }
              >
                {m.content || (enviando && i === mensajes.length - 1 ? "…" : "")}
              </div>
              <span className={"px-1 text-[10px] text-muted-foreground " + (m.role === "user" ? "text-right" : "")}>
                {formatoHora(m.timestamp)}
              </span>
              {m.verMedicamentos && (
                <Link
                  href="/app/medicamentos"
                  className="flex items-center gap-1.5 px-1 text-xs font-medium text-accent hover:underline"
                >
                  <Pill className="size-3.5" />
                  Ver en Medicamentos
                </Link>
              )}
            </div>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviarMensaje} className="flex items-center gap-2 border-t bg-card p-4">
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Escribí tu mensaje…"
          disabled={enviando}
          className="h-10 flex-1 rounded-full border border-input bg-transparent px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        />
        <Button type="submit" size="icon" disabled={enviando || !entrada.trim()} aria-label="Enviar">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
