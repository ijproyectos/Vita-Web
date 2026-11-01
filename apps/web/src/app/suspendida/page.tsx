import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VitaWordmark } from "@/components/vita/v-mark";
import { CORREO_SOPORTE } from "@/lib/legal/datos";
import { createClient } from "@/lib/supabase/server";
import { consultarSuspension } from "@/lib/suspensiones/guardia";
import { FRASE_MOTIVO } from "@/lib/suspensiones/logica";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cuenta suspendida · vita",
  robots: { index: false, follow: false },
};

// Fuera de /app y /cuidar a propósito: es adonde va una cuenta suspendida (mal uso o falta de pago). No muestra la
// nota interna del equipo, solo el motivo en palabras simples y cómo escribirnos. Sin sesión va a /login; con la
// cuenta al día vuelve a /app.
export default async function SuspendidaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { suspension } = await consultarSuspension();
  if (!suspension) redirect("/app");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 bg-background px-6 py-10 text-center">
      <VitaWordmark size={34} tono="claro" />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl font-extrabold tracking-[-0.04em] text-ink">Tu cuenta está suspendida</h1>
        <p className="text-base text-slate-brand">
          Suspendimos tu cuenta {FRASE_MOTIVO[suspension.motivo]}. Tus datos están guardados y no se borraron.
        </p>
        <p className="text-base text-slate-brand">
          Si querés revisarlo o pensás que es un error, escribinos a{" "}
          <a href={`mailto:${CORREO_SOPORTE}`} className="font-bold text-teal-deep underline underline-offset-2">
            {CORREO_SOPORTE}
          </a>
          .
        </p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full bg-teal px-6 py-3 text-sm font-bold text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
