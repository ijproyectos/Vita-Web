import { FUENTE_CODIGO, MARCA } from "../marca";
import { ESTILO, esc, layout, textoFooter, type EmailRenderizado } from "./base";

const PIE = "Recibiste este mail porque se pidió entrar a vita con esta casilla. Si no fuiste vos, ignoralo.";

/** Código para confirmar la casilla al aceptar una invitación de cuidado. */
export function codigoIngresoInvitacion(args: { codigo: string; persona: string; minutosVigencia: number; origen: string }): EmailRenderizado {
  const { codigo, persona, minutosVigencia, origen } = args;
  const asunto = `Tu código para entrar a vita: ${codigo}`;
  const contenido = `
      <h1 style="${ESTILO.titulo}">Confirmá que sos vos</h1>
      <p style="${ESTILO.parrafo}">Escribí este código para aceptar la invitación a cuidar a <strong style="color:${MARCA.ink};">${esc(persona)}</strong>:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${MARCA.mint}" style="background:${MARCA.mint};border-radius:20px;padding:26px 12px;font-family:${FUENTE_CODIGO};font-size:36px;font-weight:700;letter-spacing:8px;color:${MARCA.tealDeep};">${esc(codigo)}</td>
      </tr></table>
      <p style="margin:12px 0 22px;font-size:16px;line-height:24px;text-align:center;font-weight:700;color:${MARCA.tealDeep};">Vence en ${minutosVigencia} minutos</p>
      <p style="${ESTILO.chico}">Si no pediste este código, no lo compartas con nadie.</p>`;
  const texto = [`Tu código para entrar a vita: ${codigo}`, `Vence en ${minutosVigencia} minutos.`, "", "Si no pediste este código, no lo compartas con nadie.", "", textoFooter(origen, PIE)].join("\n");
  return { asunto, html: layout({ preheader: `Tu código es ${codigo}.`, contenido, origen, pie: PIE }), texto };
}
