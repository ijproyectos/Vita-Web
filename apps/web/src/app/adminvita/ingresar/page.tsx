import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { evaluarAccesoAdmin } from "@/lib/admin/acceso";
import type { MotivoRechazo } from "@/lib/admin/decision";
import { BotonesIngreso } from "./botones";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "vita · panel",
  robots: { index: false, follow: false, nocache: true },
};

const MOTIVOS: Record<Exclude<MotivoRechazo, "sin_sesion">, string> = {
  lista_vacia: "El panel no tiene administradores configurados todavía.",
  sin_email: "La cuenta no tiene un email asociado.",
  email_sin_confirmar: "El email de esta cuenta todavía no está confirmado. Revisá tu correo o entrá con Google.",
  fuera_de_lista: "Esta cuenta no está habilitada para el panel.",
};

// Pantalla de ingreso del panel. Queda FUERA del grupo protegido (panel): si ya sos admin te manda adentro; si no,
// ofrece entrar con Google (la misma autenticación de vita) o explica por qué la cuenta actual no tiene acceso.
export default async function IngresarAdminPage({ searchParams }: PageProps<"/adminvita/ingresar">) {
  const sp = await searchParams;
  const porInactividad = (Array.isArray(sp.motivo) ? sp.motivo[0] : sp.motivo) === "inactividad";
  const { usuario, decision } = await evaluarAccesoAdmin();
  if (decision.permitido) redirect("/adminvita");

  const motivo = decision.motivo;
  const conSesion = motivo !== "sin_sesion";

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-[32px] bg-card p-8 shadow-panel">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-[-0.06em] text-ink">
            vita<span className="text-amber">.</span>
          </span>
          <span className="eyebrow">panel de administración</span>
        </div>

        {porInactividad && !conSesion ? (
          <p role="status" className="rounded-2xl bg-mint p-3 text-sm font-semibold text-teal-deep">
            Cerramos tu sesión por inactividad. Volvé a entrar para seguir.
          </p>
        ) : null}

        {conSesion ? (
          <div className="flex flex-col gap-1.5">
            <h1 className="text-lg font-extrabold tracking-tight">No tenés acceso con esta cuenta</h1>
            <p className="text-sm text-slate-brand">
              {usuario?.email ? <span className="font-semibold text-foreground">{usuario.email}</span> : "Tu cuenta"}
              {": "}
              {MOTIVOS[motivo]}
            </p>
            <p className="text-sm text-slate-brand">Entrá con una de las cuentas de administración.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <h1 className="text-lg font-extrabold tracking-tight">Ingresá al panel</h1>
            <p className="text-sm text-slate-brand">Solo pueden entrar las cuentas de administración de vita.</p>
          </div>
        )}

        <BotonesIngreso conSesion={conSesion} />
      </div>
    </main>
  );
}
