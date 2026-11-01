"use client";

import { useActionState, useState, useTransition } from "react";
import { cerrarSesionAdminAction } from "../acciones-sesion";
import { enviarCodigoAction, verificarCodigoAction } from "./actions";
import type { RespuestaVerificacion } from "@/lib/admin/verificacion";

export function FormularioVerificacion({ email, configurado }: { email: string; configurado: boolean }) {
  const [envio, setEnvio] = useState<RespuestaVerificacion | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  const [resultado, verificar, verificando] = useActionState(verificarCodigoAction, null);

  function enviar() {
    iniciarEnvio(async () => {
      setEnvio(await enviarCodigoAction());
    });
  }

  if (!configurado) {
    return (
      <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
        Falta configurar el segundo factor del panel (variable ADMIN_SESSION_SECRET, de al menos 32 caracteres). Hasta
        entonces nadie puede entrar.
      </p>
    );
  }

  const enviado = envio?.status === "success";

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="w-full rounded-full bg-ink py-3.5 text-[15px] font-extrabold text-on-ink transition-transform active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
      >
        {enviando ? "Enviando…" : enviado ? "Enviarme otro código" : "Enviarme el código"}
      </button>
      {envio ? (
        <p role={envio.status === "error" ? "alert" : "status"} className={`text-sm ${envio.status === "error" ? "text-destructive" : "text-slate-brand"}`}>
          {envio.mensaje}
        </p>
      ) : (
        <p className="text-xs text-subtle">El código llega a {email}.</p>
      )}

      <form action={verificar} className="flex flex-col gap-2">
        <label htmlFor="codigo-admin" className="text-sm font-bold">
          Código de 6 dígitos
        </label>
        <input
          id="codigo-admin"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          required
          className="w-full rounded-full bg-panel-track px-4 py-3 text-center focus-visible:outline-2 focus-visible:outline-teal text-xl font-extrabold tracking-[0.3em]"
        />
        <button
          type="submit"
          disabled={verificando}
          className="w-full rounded-full bg-teal py-3 text-[15px] font-extrabold text-on-ink disabled:opacity-60"
        >
          {verificando ? "Verificando…" : "Verificar"}
        </button>
        {resultado && resultado.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {resultado.mensaje}
          </p>
        ) : null}
      </form>

      <form action={cerrarSesionAdminAction}>
        <button type="submit" className="w-full text-center text-xs font-bold text-slate-brand underline underline-offset-2">
          Salir y usar otra cuenta
        </button>
      </form>
    </div>
  );
}
