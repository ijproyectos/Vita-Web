import Link from "next/link";
import { PantallaAuth, TituloAuth } from "@/components/vita/auth-ui";

// Destino del callback cuando no se pudo crear la sesión: el link de Google
// falló, o el link del mail (confirmación / nueva contraseña) ya venció o
// ya se usó. Mismo lenguaje visual que las pantallas de acceso V7.
export default function AuthCodeErrorPage() {
  return (
    <PantallaAuth>
      <div className="flex flex-1 flex-col justify-center">
        <TituloAuth
          titulo="No pudimos iniciar tu sesión"
          sub="El link puede haber vencido o ya haberse usado. Volvé a intentarlo desde el inicio."
        />
      </div>
      <Link
        href="/login"
        className="flex h-14 items-center justify-center rounded-full bg-primary font-heading text-base font-extrabold text-primary-foreground shadow-cta"
      >
        Volver a intentar
      </Link>
    </PantallaAuth>
  );
}
