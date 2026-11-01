"use client";

import { useActionState } from "react";
import { agregarAdministradorAction, type EstadoGestionAdmins } from "./actions";

const INICIAL: EstadoGestionAdmins = { status: "idle" };

export function FormularioAgregarAdministrador() {
  const [estado, accion, pendiente] = useActionState(agregarAdministradorAction, INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-panel sm:max-w-xl">
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
        Email de la persona (el de su cuenta de Google)
        <input
          type="email"
          name="email"
          required
          maxLength={320}
          autoComplete="off"
          placeholder="nombre@ejemplo.com"
          className="w-full rounded-2xl bg-panel-track px-4 py-2.5 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-teal"
        />
      </label>
      <p className="text-xs text-subtle">
        Va a entrar con Google y con el código por email, igual que vos. Puede ver todo el panel, enviar notificaciones y suspender
        cuentas, pero no agregar ni quitar administradores.
      </p>
      <button type="submit" disabled={pendiente} className="self-start rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink disabled:opacity-60">
        {pendiente ? "Agregando…" : "Agregar administrador"}
      </button>
      {estado.status !== "idle" ? (
        <p role={estado.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${estado.status === "error" ? "text-destructive" : "text-teal-deep"}`}>
          {estado.mensaje}
        </p>
      ) : null}
    </form>
  );
}
