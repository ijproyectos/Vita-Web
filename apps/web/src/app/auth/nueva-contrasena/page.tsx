import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PantallaAuth, TituloAuth } from "@/components/vita/auth-ui";
import { FormularioNuevaContrasena } from "./formulario";

// Destino del link de "Olvidé mi contraseña": /auth/callback ya canjeó el
// token del mail por una sesión, así que acá solo se elige la contraseña
// nueva (V7 "Creá una contraseña nueva"). Sin sesión (link vencido o abierto
// en otro navegador) no hay nada que actualizar.
export default async function NuevaContrasenaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return <FormularioNuevaContrasena />;

  return (
    <PantallaAuth>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <TituloAuth
          titulo="El link venció"
          sub="Se abrió en otro navegador o ya se usó. Pedí uno nuevo desde «¿Olvidaste tu contraseña?»."
        />
      </div>
      <Link
        href="/login"
        className="flex h-14 items-center justify-center rounded-full bg-primary font-heading text-base font-extrabold text-primary-foreground shadow-cta"
      >
        Ir a iniciar sesión
      </Link>
    </PantallaAuth>
  );
}
