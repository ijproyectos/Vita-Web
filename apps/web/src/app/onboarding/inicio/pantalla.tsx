"use client";

import { useState, useTransition } from "react";
import {
  AvisoAuth,
  BotonCta,
  BotonPildora,
  BotonVolver,
  CodigoSeisCajas,
  IconoPegar,
  PantallaAuth,
  TituloAuth,
  leerCodigoPortapapeles,
} from "@/components/vita/auth-ui";
import { ConfirmarPersona, MENSAJE_CODIGO_DE_OTRO_PERFIL } from "@/components/vita/confirmar-persona";
import type { VistaPreviaCodigo } from "@/lib/acceso-codigo/tipos";
import { verCodigoAction, type EstadoVerCodigo } from "@/app/login/actions";
import { reclamarCodigoAction } from "../actions";

// "Ingresá tu código" (V7 `isCode`) para quien ya tiene sesión: reclama el
// vínculo de 6 dígitos que generó su cuidador. Se envía solo al completar la
// sexta cifra; con un código que vino precargado (deep link) queda el botón
// "Continuar" porque no hubo tipeo que lo dispare.
export function PantallaInicio({ codigoInicial }: { codigoInicial?: string }) {
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaCodigo | null>(null);

  async function reclamar(valor: string) {
    const fd = new FormData();
    fd.set("codigo", valor);
    const r = await reclamarCodigoAction({ status: "idle" }, fd);
    if (r.status === "error") {
      setError(r.mensaje);
      setCodigo("");
      setVistaPrevia(null);
    }
  }

  // "¿Sos vos?": primero se mira a quién pertenece el código (sin consumirlo).
  // Si no se puede mirar, se reclama directo como siempre.
  function enviar(valor: string) {
    startTransition(async () => {
      const previa = await verCodigoAction(valor).catch((): EstadoVerCodigo => ({ status: "sinVista" }));
      if (previa.status === "ok") setVistaPrevia(previa.vista);
      else if (previa.status === "error") {
        setError(previa.mensaje);
        setCodigo("");
      } else await reclamar(valor);
    });
  }

  function noSoyYo() {
    setVistaPrevia(null);
    setCodigo("");
    setError(MENSAJE_CODIGO_DE_OTRO_PERFIL);
  }

  function cambiar(valor: string) {
    setCodigo(valor);
    setError(null);
    if (valor.length === 6) enviar(valor);
  }

  async function pegar() {
    const pegado = await leerCodigoPortapapeles();
    if (pegado) cambiar(pegado);
  }

  if (vistaPrevia) {
    return (
      <ConfirmarPersona
        vista={vistaPrevia}
        pendiente={pendiente}
        onSi={() => startTransition(() => reclamar(codigo))}
        onNo={noSoyYo}
      />
    );
  }

  return (
    <PantallaAuth>
      <BotonVolver href="/onboarding/para-quien" />
      <TituloAuth
        titulo="Ingresá tu código"
        sub="Te lo mandó alguien de tu familia por WhatsApp. Sirve para conectar tu celular o para ayudar a cuidar a alguien."
      />
      <CodigoSeisCajas valor={codigo} onChange={cambiar} autoFocus={!codigoInicial} disabled={pendiente} />
      {error && <AvisoAuth>{error}</AvisoAuth>}
      <BotonPildora onClick={pegar} disabled={pendiente}>
        <IconoPegar />
        {pendiente ? "Verificando…" : "Pegar código"}
      </BotonPildora>
      <div className="flex-1" />
      {codigo.length === 6 && !pendiente && (
        <div className="mb-4">
          <BotonCta type="button" onClick={() => enviar(codigo)}>
            Continuar
          </BotonCta>
        </div>
      )}
      <p className="text-balance text-center text-sm font-medium leading-normal text-subtle">
        Si abriste el link de WhatsApp, entrás directo.
      </p>
    </PantallaAuth>
  );
}
