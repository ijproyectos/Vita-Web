"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Trash2 } from "lucide-react";
import { eliminarHistorialAction } from "./actions";
import type { SesionChat } from "@/lib/chat/tipos";

// Replica el Drawer del Vitapp original (chat_screen.dart): header sobre
// navy con el nombre de la app, lista de sesiones pasadas (título "Chat N"
// + preview del último mensaje, como historySessions), y "Borrar
// historial" al pie.
export function HistorialSheet({
  open,
  onOpenChange,
  sesiones,
  sesionActivaId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesiones: SesionChat[];
  sesionActivaId: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function abrirSesion(id: string) {
    onOpenChange(false);
    router.push(`/app/chat?sesion=${id}`);
  }

  function borrarHistorial() {
    if (!window.confirm("¿Borrar todo el historial de chat? No se puede deshacer.")) return;
    startTransition(() => {
      eliminarHistorialAction();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 sm:max-w-72">
        <SheetHeader className="bg-primary text-primary-foreground">
          <SheetTitle className="text-primary-foreground">Vitapp</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {sesiones.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Todavía no tenés chats.</p>
          ) : (
            sesiones.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => abrirSesion(s.id)}
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
          <Trash2 className="size-4" />
          Borrar historial
        </button>
      </SheetContent>
    </Sheet>
  );
}
