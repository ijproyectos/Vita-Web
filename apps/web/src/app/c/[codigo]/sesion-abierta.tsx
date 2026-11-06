import Link from "next/link";
import { BotonCta, PantallaAuth, TituloAuth } from "@/components/vita/auth-ui";
import { FormCerrarSesion } from "@/components/vita/form-cerrar-sesion";
import { rutaCodigo } from "@/lib/acceso-codigo/enlace";

// Quien abre un link de código con la sesión ya iniciada. No se mira el código (eso gastaría un intento y no
// sabemos de qué tipo es): se ofrece cerrar sesión para entrar con él, o usarlo con ESTA cuenta si es un código de
// vínculo con un familiar. Nada se envía hasta que la persona toca algo.
export function SesionAbierta({ email, codigo }: { email: string; codigo: string }) {
  return (
    <PantallaAuth>
      <TituloAuth
        titulo="Ya tenés una sesión abierta"
        sub={
          <>
            Estás dentro de vita como <b className="break-all text-foreground">{email}</b>. Para entrar con este código tenés que cerrar sesión primero.
          </>
        }
      />
      <div className="flex-1" />
      <FormCerrarSesion destino={rutaCodigo(codigo)} className="flex flex-col gap-3">
        <BotonCta type="submit">Cerrar sesión y usar el código</BotonCta>
      </FormCerrarSesion>
      <Link
        href={`/onboarding/inicio?codigo=${codigo}`}
        className="mt-4 text-center text-sm font-bold text-teal-deep"
      >
        Es un código de un familiar y quiero usarlo con esta cuenta
      </Link>
      <Link href="/app" className="mt-3 text-center text-sm font-bold text-subtle">
        Volver a vita
      </Link>
    </PantallaAuth>
  );
}
