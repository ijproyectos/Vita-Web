import { FUENTE_CODIGO, MARCA } from "../marca";
import { ESTILO, esc, layout, textoFooter, type EmailRenderizado } from "./base";

/** Código de verificación (segundo factor) del panel de administración. */
export function codigoAdmin(args: { codigo: string; minutosVigencia: number; origen: string }): EmailRenderizado {
  const { codigo, minutosVigencia, origen } = args;
  const asunto = `Tu código de verificación del panel de vita: ${codigo}`;
  const contenido = `
      <h1 style="${ESTILO.titulo}">Verificá que sos vos</h1>
      <p style="${ESTILO.parrafo}">Ingresá este código en el panel de administración de vita:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${MARCA.mint}" style="background:${MARCA.mint};border-radius:20px;padding:26px 12px;font-family:${FUENTE_CODIGO};font-size:44px;line-height:48px;font-weight:800;letter-spacing:0.18em;color:${MARCA.tealDeep};">${esc(codigo)}</td>
      </tr></table>
      <p style="margin:12px 0 22px;font-size:16px;line-height:24px;text-align:center;font-weight:700;color:${MARCA.tealDeep};">Vence en ${minutosVigencia} minutos</p>
      <p style="${ESTILO.chico}">Si no pediste este código, no lo compartas con nadie y avisá al equipo.</p>`;
  const texto = [
    "Verificá que sos vos.",
    "",
    `Tu código para el panel de vita: ${codigo}`,
    `Vence en ${minutosVigencia} minutos.`,
    "",
    "Si no pediste este código, no lo compartas con nadie y avisá al equipo.",
    "",
    textoFooter(origen),
  ].join("\n");
  return {
    asunto,
    html: layout({ preheader: `Tu código es ${codigo}. Vence en ${minutosVigencia} minutos.`, contenido, origen }),
    texto,
  };
}
