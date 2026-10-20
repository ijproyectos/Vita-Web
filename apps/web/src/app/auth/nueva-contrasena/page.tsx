import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VMark } from "@/components/vita/v-mark";
import { FormularioNuevaContrasena } from "./formulario";

// Destino del link de "Olvidé mi contraseña": /auth/callback ya canjeó el
// token del mail por una sesión, así que acá solo se elige la contraseña
// nueva. Sin sesión (link vencido o abierto en otro navegador) no hay nada
// que actualizar.
export default async function NuevaContrasenaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 bg-background px-7 py-10">
      <VMark size={64} />
      <div className="w-full rounded-[20px] bg-card p-5 shadow-card">
        <h1 className="text-center font-heading text-[20px] font-extrabold tracking-[-0.02em]">Elegí una contraseña nueva</h1>
        {user ? (
          <FormularioNuevaContrasena />
        ) : (
          <div className="mt-3 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-slate-brand">
              El link venció o se abrió en otro navegador. Pedí uno nuevo desde «Olvidé mi contraseña».
            </p>
            <Link href="/login" className="text-sm font-semibold text-primary">
              Ir a iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
