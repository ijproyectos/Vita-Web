"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { borrarSuscripcionAction, guardarSuscripcionAction } from "@/lib/notificaciones/actions";

export type EstadoPush = "cargando" | "no-soportado" | "ios-instalar" | "bloqueado" | "inactivo" | "activo";

// "perfil": fila dentro del grupo Notificaciones. "cuidador": tarjeta que
// solo aparece mientras los avisos están apagados. "simple": botón grande
// para modo simple (también solo mientras están apagados).
type Variante = "perfil" | "cuidador" | "simple";

const CLAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function esIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function esStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function claveAUint8(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const salida = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

async function obtenerRegistro(): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration("/");
  return existente ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function detectar(): Promise<{ estado: EstadoPush; suscripcion: PushSubscription | null }> {
  const soportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // En iPhone/iPad el push solo existe dentro de la PWA instalada.
  if (esIOS() && !esStandalone()) return { estado: "ios-instalar", suscripcion: null };
  if (!soportaPush || !CLAVE_VAPID) return { estado: "no-soportado", suscripcion: null };
  if (Notification.permission === "denied") return { estado: "bloqueado", suscripcion: null };

  try {
    const registro = await navigator.serviceWorker.getRegistration("/");
    const suscripcion = (await registro?.pushManager.getSubscription()) ?? null;
    if (suscripcion && Notification.permission === "granted") return { estado: "activo", suscripcion };
  } catch {
    // cae a "inactivo": se puede intentar activar con un tap.
  }
  return { estado: "inactivo", suscripcion: null };
}

function aPayload(s: PushSubscription) {
  const json = s.toJSON();
  return {
    endpoint: s.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    userAgent: navigator.userAgent,
  };
}

// Estado + acciones del push, compartidos con el paso de permiso del
// onboarding (`/onboarding/permiso`) para no duplicar el flujo de suscripción.
export function useNotificacionesPush() {
  const [estado, setEstado] = useState<EstadoPush>("cargando");
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const { estado: e, suscripcion } = await detectar();
      if (cancelado) return;
      setEstado(e);
      // Mantiene el servidor al día si el navegador rotó la suscripción.
      if (e === "activo" && suscripcion) {
        await guardarSuscripcionAction(aPayload(suscripcion)).catch(() => {});
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  function activar() {
    startTransition(async () => {
      try {
        // requestPermission va primero: tiene que correr dentro del tap.
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
          return;
        }
        const registro = await obtenerRegistro();
        await navigator.serviceWorker.ready;
        const suscripcion =
          (await registro.pushManager.getSubscription()) ??
          (await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: claveAUint8(CLAVE_VAPID!),
          }));
        const r = await guardarSuscripcionAction(aPayload(suscripcion));
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        setEstado("activo");
        toast.success("Listo, vas a recibir los avisos en este celular");
      } catch {
        toast.error("No pudimos activar los avisos en este dispositivo.");
      }
    });
  }

  function desactivar() {
    startTransition(async () => {
      try {
        const registro = await navigator.serviceWorker.getRegistration("/");
        const suscripcion = await registro?.pushManager.getSubscription();
        if (suscripcion) {
          await borrarSuscripcionAction(suscripcion.endpoint);
          await suscripcion.unsubscribe();
        }
        setEstado("inactivo");
      } catch {
        toast.error("No pudimos desactivar los avisos.");
      }
    });
  }

  return { estado, pendiente, activar, desactivar };
}

export function ActivarNotificaciones({ variante }: { variante: Variante }) {
  const { estado, pendiente, activar, desactivar } = useNotificacionesPush();

  if (estado === "cargando") return null;

  if (variante === "simple") {
    if (estado === "inactivo") {
      return (
        <div>
          <button
            type="button"
            onClick={activar}
            disabled={pendiente}
            className="flex h-[60px] w-full items-center justify-center gap-2 rounded-full bg-persona-1-tint text-[18px] font-extrabold text-teal-deep disabled:opacity-60"
          >
            <VitaIcon name="bell" size={22} />
            {pendiente ? "Activando…" : "Activar avisos"}
          </button>
        </div>
      );
    }
    if (estado === "ios-instalar") {
      return <p className="rounded-[var(--radius-item)] bg-card p-4 text-center text-[15px] font-medium text-slate-brand shadow-card">{TEXTO_IOS}</p>;
    }
    return null;
  }

  // Tarjeta del cuidador: solo mientras los avisos no están activos y se
  // pueden activar (o hay que instalar la app / desbloquearlos).
  if (variante === "cuidador" && (estado === "activo" || estado === "no-soportado")) return null;

  const titulo = variante === "cuidador" ? "Activá los avisos" : "Avisos en este celular";

  return (
    <div
      className={cn(
        variante === "cuidador" ? "rounded-[20px] bg-card p-4 shadow-card" : "px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-secondary text-primary">
          <VitaIcon name="bell" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{titulo}</div>
          <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{descripcion(estado, variante)}</div>
        </div>
        {estado === "inactivo" && (
          <button
            type="button"
            onClick={activar}
            disabled={pendiente}
            className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pendiente ? "Activando…" : "Activar"}
          </button>
        )}
        {estado === "activo" && (
          <button
            type="button"
            onClick={desactivar}
            disabled={pendiente}
            className="min-h-10 shrink-0 rounded-full bg-secondary px-4 text-[13px] font-semibold text-primary disabled:opacity-60"
          >
            Desactivar
          </button>
        )}
      </div>
    </div>
  );
}

export const TEXTO_IOS = "Para recibir avisos en iPhone, primero agregá vita a tu pantalla de inicio: Compartir → Agregar a inicio.";

function descripcion(estado: EstadoPush, variante: Variante): string {
  switch (estado) {
    case "activo":
      return "Activados. Te avisamos acá cuando haga falta.";
    case "bloqueado":
      return "Están bloqueados en este navegador. Podés habilitarlos desde los ajustes del sitio.";
    case "ios-instalar":
      return TEXTO_IOS;
    case "no-soportado":
      return "Este navegador no permite avisos.";
    default:
      return variante === "cuidador"
        ? "Para enterarte si alguien no toma su medicación."
        : "Recordatorios de tu medicación y avisos de tu familia.";
  }
}
