"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AvisoAuth, BotonCta, BotonVolver, CampoAuth, CodigoSeisCajas, TituloAuth } from "@/components/vita/auth-ui";
import { pedirAvisosPush } from "@/components/vita/activar-notificaciones";
import { AceptarInvitacion } from "@/components/vita/invitacion/aceptar-invitacion";
import { OtraCuenta } from "@/components/vita/invitacion/otra-cuenta";
import { PantallaInvitada } from "@/components/vita/invitacion/piezas";
import { RecibirInvitacion } from "@/components/vita/invitacion/recibir-invitacion";
import type { RolVinculo } from "@/lib/familia/tipos";
import { aceptarInvitacionPorCodigoAction, entrarConCodigoMailAction, pedirCodigoMailAction } from "./invitacion-actions";

type Datos = { codigo: string; invitador: string; persona: string; invitoLaPersona: boolean; rol: RolVinculo };

const MENSAJE_PEDIR: Record<string, string> = {
  otro_mail: "Esta invitación es para otro mail. Escribí el mail en el que la recibiste.",
  espera: "Ya te mandamos un código. Esperá un minuto para pedir otro.",
  tope: "Pediste muchos códigos. Probá de nuevo en un rato.",
  bloqueado: "Demasiados intentos. Esperá unos minutos.",
  invalida: "Esta invitación ya venció o ya fue usada.",
  error: "No pudimos mandar el código. Probá de nuevo.",
};

/** Sin sesión: quién te invita → tu mail → código en esa casilla. */
export function EntrarInvitacion(d: Datos) {
  const router = useRouter();
  const [paso, setPaso] = useState<"inicio" | "mail" | "codigo">("inicio");
  const [email, setEmail] = useState("");
  const [codigoMail, setCodigoMail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  async function google() {
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/c/${d.codigo}` },
    });
    if (e) toast.error("No pudimos abrir Google. Probá de nuevo.");
  }

  function pedir() {
    setError(null);
    iniciar(async () => {
      const r = await pedirCodigoMailAction(d.codigo, email).catch(() => ({ estado: "error" as const }));
      if (r.estado === "enviado") {
        setCodigoMail("");
        setPaso("codigo");
      } else if (r.estado === "espera" && paso === "mail") {
        setPaso("codigo");
        setError(MENSAJE_PEDIR.espera);
      } else setError(MENSAJE_PEDIR[r.estado]);
    });
  }

  function verificar(valor: string) {
    setCodigoMail(valor);
    if (valor.length !== 6) return;
    setError(null);
    iniciar(async () => {
      const r = await entrarConCodigoMailAction(d.codigo, email, valor).catch(() => ({ estado: "error" as const }));
      if (r.estado === "ok") {
        router.refresh();
        return;
      }
      setCodigoMail("");
      setError(r.estado === "bloqueado" ? MENSAJE_PEDIR.bloqueado : r.estado === "incorrecto" ? "Código incorrecto o vencido." : "No pudimos entrar. Probá de nuevo.");
    });
  }

  if (paso === "inicio") {
    return <RecibirInvitacion invitador={d.invitador} persona={d.persona} invitoLaPersona={d.invitoLaPersona} rol={d.rol} onGoogle={google} onEmail={() => setPaso("mail")} />;
  }

  return (
    <PantallaInvitada>
      <BotonVolver onClick={() => { setError(null); setPaso(paso === "codigo" ? "mail" : "inicio"); }} />
      {paso === "mail" ? (
        <>
          <TituloAuth titulo="Escribí tu mail" sub="El mismo en el que recibiste la invitación. Te mandamos un código para confirmar que sos vos." />
          <div className="mt-[26px]">
            <CampoAuth etiqueta="Mail" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <AvisoAuth>{error}</AvisoAuth>}
          <div className="mt-auto pt-6">
            <BotonCta type="button" grande habilitado={email.includes("@") && !pendiente} onClick={pedir}>
              {pendiente ? "Enviando…" : "Continuar"}
            </BotonCta>
          </div>
        </>
      ) : (
        <>
          <TituloAuth titulo="Revisá tu mail" sub={<>Escribí el código que te mandamos a <span className="break-all font-extrabold text-foreground">{email.trim()}</span>.</>} />
          <CodigoSeisCajas valor={codigoMail} onChange={verificar} autoFocus disabled={pendiente} />
          {error && <AvisoAuth>{error}</AvisoAuth>}
          <button type="button" disabled={pendiente} onClick={pedir} className="mt-5 h-11 text-[14.5px] font-bold text-teal-deep disabled:opacity-60">
            Mandar otro código
          </button>
        </>
      )}
    </PantallaInvitada>
  );
}

/** Con la sesión del mail correcto: "Vas a cuidar a…". */
export function AceptarHost({ codigo, nombre, persona, rol, esPerfilGestionado }: { codigo: string; nombre?: string | null; persona: string; rol: RolVinculo; esPerfilGestionado: boolean }) {
  const router = useRouter();
  const enCurso = useRef(false);

  function empezar() {
    if (enCurso.current) return;
    enCurso.current = true;
    // Tiene que arrancar dentro del toque: si no, el navegador no muestra la pregunta.
    const permiso = pedirAvisosPush();
    void (async () => {
      const r = await aceptarInvitacionPorCodigoAction(codigo).catch(() => ({ status: "error" as const, mensaje: "No pudimos aceptar la invitación. Probá de nuevo." }));
      if (r.status === "error") {
        enCurso.current = false;
        toast.error(r.mensaje);
        return;
      }
      // Responda lo que responda, o si no contesta, sigue.
      await Promise.race([permiso, new Promise((listo) => setTimeout(listo, 8000))]);
      router.replace("/app");
    })();
  }

  return <AceptarInvitacion nombre={nombre} persona={persona} rol={rol} esPerfilGestionado={esPerfilGestionado} onEmpezar={empezar} />;
}

/** Con otra sesión abierta: la invitación es para otro mail. */
export function OtraCuentaHost({ emailActual, emailInvitado, invitador }: { emailActual: string; emailInvitado: string; invitador: string }) {
  const router = useRouter();
  async function usarOtra() {
    await createClient().auth.signOut({ scope: "local" });
    router.refresh();
  }
  return <OtraCuenta emailActual={emailActual} emailInvitado={emailInvitado} invitador={invitador} onUsarOtra={usarOtra} />;
}
