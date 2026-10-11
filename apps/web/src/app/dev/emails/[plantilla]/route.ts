import { codigoVinculacion } from "@/lib/email/plantillas/codigo-vinculacion";
import { invitacionCuidador } from "@/lib/email/plantillas/invitacion-cuidador";

// Preview de plantillas de email en el navegador — solo dev/test. 404 en
// producción salvo que NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true".
// `?formato=texto` devuelve la alternativa en texto plano.
export async function GET(request: Request, ctx: RouteContext<"/dev/emails/[plantilla]">) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) return new Response("Not found", { status: 404 });

  const { plantilla } = await ctx.params;
  const origen = new URL(request.url).origin;

  const render =
    plantilla === "invitacion"
      ? invitacionCuidador({
          nombreElder: "Marta Gómez",
          urlInvitacion: `${origen}/cuidar/invitacion/0123456789abcdef0123456789abcdef0123456789abcdef`,
          diasVigencia: 7,
          origen,
        })
      : plantilla === "codigo"
        ? codigoVinculacion({
            nombreCuidador: "Lucía",
            codigo: "482916",
            minutosVigencia: 30,
            urlIngreso: `${origen}/login?next=${encodeURIComponent("/onboarding/inicio?codigo=482916")}`,
            origen,
          })
        : null;

  if (!render) return new Response("Not found", { status: 404 });

  const texto = new URL(request.url).searchParams.get("formato") === "texto";
  return new Response(texto ? render.texto : render.html, {
    headers: { "content-type": texto ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" },
  });
}
