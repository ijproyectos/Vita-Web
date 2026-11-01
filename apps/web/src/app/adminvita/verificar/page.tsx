import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { evaluarAccesoAdmin, RUTA_INGRESO_ADMIN, tieneVerificacionVigente } from "@/lib/admin/acceso";
import { leerSecretoSesion } from "@/lib/admin/sesion";
import { FormularioVerificacion } from "./formulario";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "vita · panel",
  robots: { index: false, follow: false, nocache: true },
};

// Segundo factor del panel. Queda FUERA del grupo protegido (panel), como /ingresar: acá la guarda exige solo la
// sesión de admin (Google + ADMIN_EMAILS); la cookie de verificación es justamente lo que se obtiene en esta pantalla.
export default async function VerificarAdminPage() {
  const { usuario, decision } = await evaluarAccesoAdmin();
  if (!decision.permitido || !usuario) redirect(RUTA_INGRESO_ADMIN);
  if (await tieneVerificacionVigente(usuario, decision.email)) redirect("/adminvita");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-[var(--radius-card)] bg-card p-6 shadow-card">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tracking-[-0.06em] text-ink">
            vita<span className="text-amber">.</span>
          </span>
          <span className="eyebrow">verificación</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-extrabold tracking-tight">Confirmá que sos vos</h1>
          <p className="text-sm text-slate-brand">
            Entraste como <span className="font-semibold text-foreground">{decision.email}</span>. Para abrir el panel te
            enviamos un código por email.
          </p>
        </div>
        <FormularioVerificacion email={decision.email} configurado={leerSecretoSesion(process.env.ADMIN_SESSION_SECRET) !== null} />
      </div>
    </main>
  );
}
