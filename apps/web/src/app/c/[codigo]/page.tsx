import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarCodigoEnlace } from "@/lib/acceso-codigo/enlace";
import { LoginForm } from "@/app/login/login-form";
import { SesionAbierta } from "./sesion-abierta";
import { headers } from "next/headers";
import { listarFamilia } from "@/lib/familia/nucleo";
import { obtenerNombre } from "@/lib/perfil/nucleo";
import { verInvitacion } from "@/lib/invitaciones/nucleo";
import { mailCoincide } from "@/lib/invitaciones/logica";
import { AceptarHost, EntrarInvitacion, OtraCuentaHost } from "./flujo-invitacion";

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

  // Invitación de cuidador: flujo propio. Abrir el link no consume nada.
  const h = await headers();
  const vista = await verInvitacion(codigo, h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida");
  if (vista.estado === "ok") {
    const inv = vista.invitacion;
    if (!user) return <EntrarInvitacion codigo={codigo} invitador={inv.invitador} persona={inv.persona} invitoLaPersona={inv.invitoLaPersona} rol={inv.rol} />;
    if (!mailCoincide(inv.email, user.email)) return <OtraCuentaHost emailActual={user.email ?? "tu cuenta"} emailInvitado={inv.email} invitador={inv.invitador} />;
    // Si no se puede leer la familia se sigue sin la lista: es solo informativa.
    const familia = await listarFamilia(supabase).catch(() => []);
    const primer = (n: string) => n.split(/\s+/)[0];
    const yo = (await obtenerNombre(supabase, user.id).catch(() => null)) ?? inv.nombreInvitado ?? "Vos";
    const lista = familia.length > 0 ? { yo: primer(yo), actuales: familia.map((m) => primer(m.nombre)) } : null;
    return <AceptarHost codigo={codigo} nombre={inv.nombreInvitado?.split(/\s+/)[0]} persona={inv.persona} rol={inv.rol} esPerfilGestionado={inv.esPerfilGestionado} lista={lista} />;
  }

  if (user) return <SesionAbierta email={user.email ?? "tu cuenta"} codigo={codigo} />;

  return <LoginForm codigoInicial={codigo} />;
}
