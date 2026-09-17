import { redirect } from "next/navigation";
import { VMark } from "@/components/vita/v-mark";
import { createClient } from "@/lib/supabase/server";
import { AceptarInvitacionForm } from "./aceptar-form";

// Primera superficie que ve un cuidador nuevo: nunca reclama la
// invitación en este GET (ver aceptar-form.tsx) — solo confirma sesión
// (preservando `?next=` para volver acá después del login con Google,
// ya que `requireUser()` no lo hace) y muestra el botón explícito.
export default async function InvitacionCuidadorPage(
  props: PageProps<"/cuidar/invitacion/[token]">
) {
  const { token } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/cuidar/invitacion/${token}`);
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-full shadow-[0_20px_48px_rgba(8,145,178,0.3)]">
        <div className="flex size-full items-center justify-center" style={{ background: "linear-gradient(135deg, #22d3ee, #0e7490)" }}>
          <VMark size={40} />
        </div>
      </div>

      <div className="mt-5 text-center">
        <div className="font-heading text-[22px] font-extrabold tracking-tight">Invitación de cuidado</div>
        <p className="mx-auto mt-2 max-w-[280px] text-sm text-muted-foreground">
          Te invitaron a acompañar a alguien en vita — vas a poder ver su adherencia a los medicamentos,
          sin poder editar nada.
        </p>
      </div>

      <div className="mt-7 w-full">
        <AceptarInvitacionForm token={token} />
      </div>
    </div>
  );
}
