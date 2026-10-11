import { FUENTE_CODIGO, MARCA } from "../marca";
import { boton, ESTILO, esc, layout, textoFooter, type EmailRenderizado } from "./base";

export function codigoVinculacion(args: {
  nombreCuidador: string;
  codigo: string;
  minutosVigencia: number;
  urlIngreso: string;
  origen: string;
}): EmailRenderizado {
  const { nombreCuidador, codigo, minutosVigencia, urlIngreso, origen } = args;
  const asunto = `Tu código para vincularte con ${nombreCuidador} en vita`;
  const paso = `margin:0 0 10px;font-size:18px;line-height:27px;color:${MARCA.ink};`;

  const contenido = `
      <h1 style="${ESTILO.titulo}font-size:26px;line-height:32px;">${esc(nombreCuidador)} quiere acompañarte</h1>
      <p style="${ESTILO.parrafo}font-size:18px;line-height:27px;">Este es tu código para vincularte con ${esc(nombreCuidador)} en vita:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${MARCA.mint}" style="background:${MARCA.mint};border-radius:20px;padding:26px 12px;font-family:${FUENTE_CODIGO};font-size:44px;line-height:48px;font-weight:800;letter-spacing:0.18em;color:${MARCA.tealDeep};">${esc(codigo)}</td>
      </tr></table>
      <p style="margin:12px 0 22px;font-size:16px;line-height:24px;text-align:center;font-weight:700;color:${MARCA.tealDeep};">Vence en ${minutosVigencia} minutos</p>
      <p style="margin:0 0 10px;font-size:18px;line-height:27px;font-weight:800;color:${MARCA.ink};">Cómo usarlo</p>
      <p style="${paso}"><strong>1.</strong> Abrí vita.</p>
      <p style="${paso}"><strong>2.</strong> Elegí &ldquo;Me invitó un familiar, tengo un código&rdquo;.</p>
      <p style="${paso}"><strong>3.</strong> Escribí el código.</p>
      ${boton("Abrir vita", urlIngreso)}
      <p style="${ESTILO.chico}">Si el botón no funciona, copiá este link: <span style="word-break:break-all;color:${MARCA.tealDeep};">${esc(urlIngreso)}</span></p>`;

  const texto = [
    `${nombreCuidador} quiere acompañarte en vita.`,
    "",
    `Tu código: ${codigo}`,
    `Vence en ${minutosVigencia} minutos.`,
    "",
    "Cómo usarlo:",
    "1) Abrí vita.",
    '2) Elegí "Me invitó un familiar, tengo un código".',
    "3) Escribí el código.",
    "",
    `Abrir vita: ${urlIngreso}`,
    "",
    textoFooter(origen),
  ].join("\n");

  return {
    asunto,
    html: layout({
      preheader: `Tu código es ${codigo}. Vence en ${minutosVigencia} minutos.`,
      contenido,
      origen,
    }),
    texto,
  };
}
