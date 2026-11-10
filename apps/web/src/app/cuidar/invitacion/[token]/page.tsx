import { redirect } from "next/navigation";
import { VMark } from "@/components/vita/v-mark";
import { createClient } from "@/lib/supabase/server";
import { AceptarInvitacionForm } from "./aceptar-form";
import { codigoDeToken } from "@/lib/invitaciones/nucleo";

// Primera superficie que ve un cuidador nuevo: nunca reclama la
// invitación en este GET (ver aceptar-form.tsx) — solo confirma sesión
// (preservando `?next=` para volver acá después del login con Google,
// ya que `requireUser()` no lo hace) y muestra el botón explícito.
export default async function InvitacionCuidadorPage(
  props: PageProps<"/cuidar/invitacion/[token]">
) {
  const { token } = await props.params;
  // Links largos ya enviados: siguen por el flujo nuevo. Sin la migración 054 queda esta pantalla.
  const codigo = await codigoDeToken(token);
  if (codigo) redirect(`/c/${codigo}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/cuidar/invitacion/${token}`);
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background to-card px-7">
      <VMark size={64} />

      <div className="mt-5 text-center">
        <div className="font-heading text-[22px] font-extrabold tracking-tight">Invitación de cuidado</div>
        <p className="mx-auto mt-2 max-w-[280px] text-sm text-muted-foreground">
          Te invitaron a acompañar a alguien en vita. Vas a poder ver cómo viene con sus medicamentos.
        </p>
      </div>

      <div className="mt-7 w-full">
        <AceptarInvitacionForm token={token} />
      </div>
    </div>
  );
}
