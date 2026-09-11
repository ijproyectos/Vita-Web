"use client";

import { useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { VitaIcon } from "@/lib/vita-icons";
import { eliminarHistorialAction } from "./chat-actions";
import type { SesionChat } from "@/lib/chat/tipos";

// Drawer de sesiones pasadas — se mantiene como funcionalidad real aunque
// el diseño vita.ia no lo muestre (decisión ya tomada: no sacar algo real
// ya construido). Ahora controlado 100% en cliente (el chat es un overlay,
// no una ruta), sin navegación — cambiar de sesión carga sus mensajes vía
// Server Action en vez de un `router.push`.
export function HistorialDrawer({
  open,
  onOpenChange,
  sesiones,
  sesionActivaId,
  onAbrirSesion,
  onNuevoChat,
  onHistorialBorrado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesiones: SesionChat[];
  sesionActivaId: string | null;
  onAbrirSesion: (id: string) => void;
  onNuevoChat: () => void;
  onHistorialBorrado: () => void;
}) {
  const [pendiente, startTransition] = useTransition();

  function borrarHistorial() {
    if (!window.confirm("¿Borrar todo el historial de chat? No se puede deshacer.")) return;
    startTransition(async () => {
      await eliminarHistorialAction();
      onHistorialBorrado();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 sm:max-w-72">
        <SheetHeader className="bg-primary text-primary-foreground">
          <SheetTitle className="text-primary-foreground">vita.ia</SheetTitle>
        </SheetHeader>

        <button
          type="button"
          onClick={onNuevoChat}
          className="flex items-center gap-2 border-b px-4 py-3 text-left text-sm font-semibold text-primary hover:bg-muted"
        >
          <VitaIcon name="plus" size={16} />
          Nuevo chat
        </button>

        <div className="flex-1 overflow-y-auto">
          {sesiones.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Todavía no tenés chats.</p>
          ) : (
            sesiones.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onAbrirSesion(s.id)}
                className={
                  "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-muted " +
                  (s.id === sesionActivaId ? "bg-accent/10" : "")
                }
              >
                <span className="text-sm font-medium">Chat {i + 1}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {s.ultimoMensaje ?? "Chat vacío"}
                </span>
              </button>
            ))
          )}
        </div>

        <Separator />
        <button
          type="button"
          onClick={borrarHistorial}
          disabled={pendiente || sesiones.length === 0}
          className="flex items-center gap-2 p-4 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <VitaIcon name="close" size={16} />
          Borrar historial
        </button>
      </SheetContent>
    </Sheet>
  );
}
