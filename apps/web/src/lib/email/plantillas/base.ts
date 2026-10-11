import { FUENTE_EMAIL, MARCA } from "../marca";

export type EmailRenderizado = { asunto: string; html: string; texto: string };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa un valor interpolado en HTML (nombres, emails, urls en atributos). */
export function esc(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Botón "bulletproof": tabla + link, funciona sin imágenes ni CSS externo. */
export function boton(texto: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
  <tr>
    <td align="center" bgcolor="${MARCA.teal}" style="border-radius:999px;background:linear-gradient(135deg,${MARCA.teal},${MARCA.tealDeep});">
      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${FUENTE_EMAIL};font-size:17px;font-weight:800;color:${MARCA.card};text-decoration:none;border-radius:999px;">${esc(texto)}</a>
    </td>
  </tr>
</table>`;
}

const ISOTIPO = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="40" height="40" align="center" valign="middle" bgcolor="${MARCA.teal}" style="width:40px;height:40px;border-radius:12px;background:${MARCA.teal};font-family:${FUENTE_EMAIL};font-size:26px;font-weight:800;line-height:40px;color:${MARCA.cream};">v<span style="color:${MARCA.amber};font-size:10px;vertical-align:top;line-height:20px;">&#9679;</span></td>
</tr></table>`;

/** Layout compartido: 600px máx, tablas, estilos inline, fondo crema. */
export function layout(args: { preheader: string; contenido: string; origen: string }): string {
  const { preheader, contenido, origen } = args;
  const link = `color:${MARCA.tealDeep};text-decoration:underline;`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>vita</title>
<style>@media (max-width:620px){.cuerpo{padding:24px 20px !important;}}</style>
</head>
<body style="margin:0;padding:0;background:${MARCA.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MARCA.cream};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MARCA.cream}" style="background:${MARCA.cream};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td style="padding:0 8px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${ISOTIPO}</td>
        <td valign="middle" style="padding-left:10px;font-family:${FUENTE_EMAIL};font-size:30px;font-weight:800;letter-spacing:-0.06em;color:${MARCA.ink};">vita<span style="color:${MARCA.amber};">.</span></td>
      </tr></table>
    </td></tr>
    <tr><td class="cuerpo" bgcolor="${MARCA.card}" style="background:${MARCA.card};border-radius:20px;padding:36px 36px 32px;font-family:${FUENTE_EMAIL};color:${MARCA.ink};">
${contenido}
    </td></tr>
    <tr><td style="padding:20px 12px 0;font-family:${FUENTE_EMAIL};font-size:12px;line-height:18px;color:${MARCA.slate};text-align:center;">
      Este correo lo envió vita porque alguien te invitó a acompañar su cuidado. Si no esperabas este mensaje, podés ignorarlo.<br>
      <a href="${esc(origen)}/legal/privacidad" style="${link}">Privacidad</a> &middot; <a href="${esc(origen)}/legal/terminos" style="${link}">Términos</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export const ESTILO = {
  titulo: `margin:0 0 14px;font-family:${FUENTE_EMAIL};font-size:24px;line-height:30px;font-weight:800;letter-spacing:-0.02em;color:${MARCA.ink};`,
  parrafo: `margin:0 0 14px;font-family:${FUENTE_EMAIL};font-size:16px;line-height:25px;color:${MARCA.slate};`,
  chico: `margin:0;font-family:${FUENTE_EMAIL};font-size:13px;line-height:20px;color:${MARCA.slate};`,
};

export function textoFooter(origen: string): string {
  return `--\nEste correo lo envió vita porque alguien te invitó a acompañar su cuidado. Si no esperabas este mensaje, podés ignorarlo.\nPrivacidad: ${origen}/legal/privacidad\nTérminos: ${origen}/legal/terminos`;
}
