import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import { TopBar } from "../../top-bar";
import { InvitarCuidadorForm } from "./invitar-form";
import { VinculoRow } from "./vinculo-row";

// "Mis cuidadores" — el elder crea invitaciones y ve el estado de cada
// una (pendiente/aceptado/revocado). Ver lib/cuidadores/nucleo.ts para el
// dominio; esta pantalla es pura UI + Server Actions finas sobre él.
export default async function CuidadoresPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const vinculos = await cuidadoresNucleo.listarVinculosDeElder(supabase, usuario.id);

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2 pb-6">
      <TopBar eyebrow="Perfil" title="Mis cuidadores" />

      <p className="-mt-2 text-[13px] text-muted-foreground">
        Invitá a alguien de confianza para que vea tu adherencia a los medicamentos, sin poder editar nada.
      </p>

      <InvitarCuidadorForm />

      <div>
        <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">
          Invitaciones y vínculos
        </div>
        {vinculos.length === 0 ? (
          <div className="rounded-[20px] bg-card p-5 text-center text-sm text-muted-foreground shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            Todavía no invitaste a ningún cuidador.
          </div>
        ) : (
          <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            {vinculos.map((v) => (
              <VinculoRow key={v.id} vinculo={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
