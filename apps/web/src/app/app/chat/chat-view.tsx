"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Send, Pill } from "lucide-react";

type Mensaje = { role: "user" | "assistant"; content: string; verMedicamentos?: boolean };

const MENSAJE_INICIAL: Mensaje = {
  role: "assistant",
  content: "Hola, soy tu asistente de Vitapp. Puedo mostrarte tus medicamentos de hoy, agregar uno nuevo, o marcar que ya tomaste alguno. ¿En qué te ayudo?",
};

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

export function ChatView() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([MENSAJE_INICIAL]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  function scrollAlFinal() {
    requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    const texto = entrada.trim();
    if (!texto || enviando) return;

    const historial = [...mensajes, { role: "user" as const, content: texto }];
    setMensajes([...historial, { role: "assistant", content: "" }]);
    setEntrada("");
    setEnviando(true);
    scrollAlFinal();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historial.map(({ role, content }) => ({ role, content })),
        }),
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
            | { error: string };

          if ("chunk" in evento) {
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
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] w-full max-w-2xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {mensajes.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="flex max-w-[80%] flex-col gap-2">
              <div
                className={
                  "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap " +
                  (m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground")
                }
              >
                {m.content || (enviando && i === mensajes.length - 1 ? "…" : "")}
              </div>
              {m.verMedicamentos && (
                <Link
                  href="/app/medicamentos"
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
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

      <form onSubmit={enviarMensaje} className="flex items-center gap-2 border-t p-4">
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
