import { MARCA } from "../marca";
import { boton, ESTILO, esc, layout, textoFooter, type EmailRenderizado } from "./base";

export function invitacionCuidador(args: {
  nombreElder: string;
  urlInvitacion: string;
  diasVigencia: number;
  origen: string;
}): EmailRenderizado {
  const { nombreElder, urlInvitacion, diasVigencia, origen } = args;
  const asunto = `${nombreElder} te invitó a acompañar su cuidado en vita`;

  const contenido = `
      <h1 style="${ESTILO.titulo}">${esc(nombreElder)} te invitó a acompañar su cuidado</h1>
      <p style="${ESTILO.parrafo}">Hola. <strong style="color:${MARCA.ink};">${esc(nombreElder)}</strong> usa vita para organizar sus medicamentos y turnos, y te invitó a ser parte de su cuidado.</p>
      <p style="${ESTILO.parrafo}">Si aceptás, vas a poder ver qué medicamentos tiene que tomar y si ya los tomó, y cargarle un medicamento nuevo. Solo lo que ${esc(nombreElder)} decidió compartir con vos, siempre con su consentimiento, y podés dejar de acompañar su cuidado cuando quieras.</p>
      ${boton("Aceptar invitación", urlInvitacion)}
      <p style="${ESTILO.chico}">Si el botón no funciona, copiá este link y pegalo en tu navegador:</p>
      <p style="margin:6px 0 16px;font-size:13px;line-height:20px;word-break:break-all;color:${MARCA.tealDeep};">${esc(urlInvitacion)}</p>
      <p style="${ESTILO.chico}">La invitación vence en ${diasVigencia} días. Para aceptarla, ingresá con la cuenta de Google de este mismo email.</p>`;

  const texto = [
    `${nombreElder} te invitó a acompañar su cuidado en vita.`,
    "",
    `Si aceptás, vas a poder ver sus medicamentos y si ya los tomó y cargarle medicamentos nuevos, siempre con su consentimiento. Podés dejar de acompañar su cuidado cuando quieras.`,
    "",
    `Aceptar invitación: ${urlInvitacion}`,
    "",
    `La invitación vence en ${diasVigencia} días. Ingresá con la cuenta de Google de este mismo email.`,
    "",
    textoFooter(origen),
  ].join("\n");

  return {
    asunto,
    html: layout({ preheader: `${nombreElder} te invitó a acompañar su cuidado en vita.`, contenido, origen }),
    texto,
  };
}
