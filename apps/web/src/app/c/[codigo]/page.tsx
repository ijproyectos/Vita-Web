import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarCodigoEnlace } from "@/lib/acceso-codigo/enlace";
import { LoginForm } from "@/app/login/login-form";
import { SesionAbierta } from "./sesion-abierta";

// Link corto de un código (/c/482916): lo que viaja por WhatsApp, mail o copiado. Abre DIRECTO la pantalla de
// ingreso de código con el código ya escrito (nunca se envía solo: la persona toca "Continuar", y se conserva el
// "¿Sos vos?" y el freno de intentos de siempre). Pública a propósito: quien lo abre todavía no tiene cuenta.
// Con la sesión ya iniciada se explica (sin mirar el código) y se ofrece cerrar sesión o reclamarlo con esa cuenta.
// Un código con forma inválida no se prellena: cae en el login normal.
export const metadata: Metadata = {
  title: "Ingresá tu código · vita",
  // El código viaja en la URL: ni buscadores ni referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CodigoPage(props: PageProps<"/c/[codigo]">) {
  const { codigo: crudo } = await props.params;
  let decodificado = crudo;
  try {
    decodificado = decodeURIComponent(crudo);
  } catch {
    /* un %XX mal formado: se valida tal cual y falla la forma */
  }
  const codigo = normalizarCodigoEnlace(decodificado);
  if (!codigo) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return <SesionAbierta email={user.email ?? "tu cuenta"} codigo={codigo} />;

  return <LoginForm codigoInicial={codigo} />;
}
