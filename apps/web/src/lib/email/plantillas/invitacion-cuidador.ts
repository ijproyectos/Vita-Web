import { MARCA } from "../marca";
import { boton, ESTILO, esc, layout, textoFooter, type EmailRenderizado } from "./base";

/** Qué va a poder hacer: un Lector solo mira. */
function queVaAPoder(rol: "editar" | "ver"): string {
  return rol === "editar"
    ? "ver qué medicamentos tiene que tomar y si ya los tomó, y cargar y cambiar sus datos"
    : "ver qué medicamentos tiene que tomar y si ya los tomó, sin cambiar nada";
}

const COMO_ENTRAR = "Para aceptarla, entrá con este mismo mail: te mandamos un código para confirmarlo, o usá tu cuenta de Google.";

export function invitacionCuidador(args: {
  nombreElder: string;
  urlInvitacion: string;
  diasVigencia: number;
  origen: string;
  rol: "editar" | "ver";
  /** Quien invita, si no es la propia persona (un Admin de un perfil que gestiona). */
  nombreQuienInvita?: string;
}): EmailRenderizado {
  const { nombreElder, urlInvitacion, diasVigencia, origen, nombreQuienInvita, rol } = args;
  if (nombreQuienInvita && nombreQuienInvita !== nombreElder) return invitacionDeOtro({ ...args, nombreQuienInvita });
  const asunto = `${nombreElder} te invitó a acompañar su cuidado en vita`;

  const contenido = `
      <h1 style="${ESTILO.titulo}">${esc(nombreElder)} te invitó a acompañar su cuidado</h1>
      <p style="${ESTILO.parrafo}">Hola. <strong style="color:${MARCA.ink};">${esc(nombreElder)}</strong> usa vita para organizar sus medicamentos y turnos, y te invitó a ser parte de su cuidado.</p>
      <p style="${ESTILO.parrafo}">Si aceptás, vas a poder ${queVaAPoder(rol)}. Solo lo que ${esc(nombreElder)} decidió compartir con vos, siempre con su consentimiento, y podés dejar de acompañar su cuidado cuando quieras.</p>
      ${boton("Aceptar invitación", urlInvitacion)}
      <p style="${ESTILO.chico}">Si el botón no funciona, copiá este link y pegalo en tu navegador:</p>
      <p style="margin:6px 0 16px;font-size:13px;line-height:20px;word-break:break-all;color:${MARCA.tealDeep};">${esc(urlInvitacion)}</p>
      <p style="${ESTILO.chico}">La invitación vence en ${diasVigencia} días. ${COMO_ENTRAR}</p>`;

  const texto = [
    `${nombreElder} te invitó a acompañar su cuidado en vita.`,
    "",
    `Si aceptás, vas a poder ${queVaAPoder(rol)}, siempre con su consentimiento. Podés dejar de acompañar su cuidado cuando quieras.`,
    "",
    `Aceptar invitación: ${urlInvitacion}`,
    "",
    `La invitación vence en ${diasVigencia} días. ${COMO_ENTRAR}`,
    "",
    textoFooter(origen),
  ].join("\n");

  return {
    asunto,
    html: layout({ preheader: `${nombreElder} te invitó a acompañar su cuidado en vita.`, contenido, origen }),
    texto,
  };
}

// Variante: quien invita no es la persona cuidada sino alguien que gestiona su perfil.
function invitacionDeOtro(args: {
  nombreElder: string;
  urlInvitacion: string;
  diasVigencia: number;
  origen: string;
  rol: "editar" | "ver";
  nombreQuienInvita: string;
}): EmailRenderizado {
  const { nombreElder, urlInvitacion, diasVigencia, origen, nombreQuienInvita, rol } = args;
  const asunto = `${nombreQuienInvita} te invitó a cuidar a ${nombreElder} en vita`;

  const contenido = `
      <h1 style="${ESTILO.titulo}">${esc(nombreQuienInvita)} te invitó a cuidar a ${esc(nombreElder)}</h1>
      <p style="${ESTILO.parrafo}">Hola. <strong style="color:${MARCA.ink};">${esc(nombreQuienInvita)}</strong> lleva los medicamentos y turnos de <strong style="color:${MARCA.ink};">${esc(nombreElder)}</strong> en vita y te invitó a acompañar su cuidado.</p>
      <p style="${ESTILO.parrafo}">Si aceptás, vas a poder ${queVaAPoder(rol)}, y recibir sus avisos. Podés dejar de acompañar su cuidado cuando quieras.</p>
      ${boton("Aceptar invitación", urlInvitacion)}
      <p style="${ESTILO.chico}">Si el botón no funciona, copiá este link y pegalo en tu navegador:</p>
      <p style="margin:6px 0 16px;font-size:13px;line-height:20px;word-break:break-all;color:${MARCA.tealDeep};">${esc(urlInvitacion)}</p>
      <p style="${ESTILO.chico}">La invitación vence en ${diasVigencia} días. ${COMO_ENTRAR}</p>`;

  const texto = [
    `${nombreQuienInvita} te invitó a cuidar a ${nombreElder} en vita.`,
    "",
    `Si aceptás, vas a poder ${queVaAPoder(rol)}, y recibir sus avisos. Podés dejar de acompañar su cuidado cuando quieras.`,
    "",
    `Aceptar invitación: ${urlInvitacion}`,
    "",
    `La invitación vence en ${diasVigencia} días. ${COMO_ENTRAR}`,
    "",
    textoFooter(origen),
  ].join("\n");

  return {
    asunto,
    html: layout({ preheader: `${nombreQuienInvita} te invitó a cuidar a ${nombreElder} en vita.`, contenido, origen }),
    texto,
  };
}
