"use server";

import { requireUser } from "@/lib/dal";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { enviarEmail } from "@/lib/email/smtp";
import { permitirEnvio } from "@/lib/email/limite";
import { CORREO_SOPORTE } from "@/lib/legal/datos";
import { CATEGORIAS_REPORTE, MAX_CAPTURA_BYTES, MAX_TEXTO_REPORTE, type EstadoReporte } from "./tipos";

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TIPOS_IMAGEN = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"]);

// Reportar un problema (V7): llega por mail (SMTP propio) a la casilla de
// soporte con el Reply-To de quien lo manda. Nunca lanza: el éxito se muestra
// SOLO si el mail salió de verdad. Los "datos del teléfono" son únicamente el
// user-agent del navegador y la versión de la app, nunca datos de salud.
export async function enviarReporteAction(_prev: EstadoReporte, formData: FormData): Promise<EstadoReporte> {
  const usuario = await requireUser(); // redirige a /login sin sesión (fuera de cualquier try)

  try {
    const categoria = String(formData.get("categoria") ?? "");
    const texto = String(formData.get("texto") ?? "").trim();
    const incluirDispositivo = formData.get("dispositivo") === "1";
    const agente = String(formData.get("agente") ?? "").slice(0, 300);
    const captura = formData.get("captura");

    if (!(CATEGORIAS_REPORTE as readonly string[]).includes(categoria)) return { status: "error", mensaje: "Elegí sobre qué es." };
    if (texto.length < 5) return { status: "error", mensaje: "Contanos qué pasó (aunque sea en una frase)." };
    if (texto.length > MAX_TEXTO_REPORTE) return { status: "error", mensaje: "El texto es muy largo. Resumilo un poco." };

    let adjunto: { nombre: string; contenido: Buffer; tipo: string } | null = null;
    if (captura instanceof File && captura.size > 0) {
      if (captura.size > MAX_CAPTURA_BYTES) return { status: "error", mensaje: "La captura pesa más de 5 MB. Probá con una más chica." };
      if (!TIPOS_IMAGEN.has(captura.type)) return { status: "error", mensaje: "La captura tiene que ser una imagen (PNG, JPG, WebP…)." };
      adjunto = { nombre: (captura.name || "captura").replace(/[^\w.\- ]/g, "_").slice(0, 80), contenido: Buffer.from(await captura.arrayBuffer()), tipo: captura.type };
    }

    if (!permitirEnvio(`reporte:${usuario.id}`)) {
      return { status: "error", mensaje: "Ya mandaste varios reportes en la última hora. Esperá un rato o escribinos por mail." };
    }

    const email = usuario.email && !esEmailDeCuentaPorCodigo(usuario.email) ? usuario.email : null;
    const datos = incluirDispositivo ? `Dispositivo: ${agente || "no disponible"}\nVersión de vita: 1.0` : "Datos del teléfono: no incluidos";
    const cuerpo = [
      `Tema: ${categoria}`,
      `Cuenta: ${email ?? `cuenta vinculada (${usuario.id})`}`,
      datos,
      adjunto ? `Captura adjunta: ${adjunto.nombre}` : "Sin captura",
      "",
      texto,
    ].join("\n");

    const r = await enviarEmail({
      para: CORREO_SOPORTE,
      asunto: `[vita] Reporte: ${categoria}`,
      texto: cuerpo,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapar(cuerpo)}</div>`,
      responderA: email ?? undefined,
      adjuntos: adjunto ? [adjunto] : undefined,
    });

    if (!r.ok) {
      return {
        status: "error",
        mensaje:
          r.motivo === "sin_configuracion"
            ? `Por ahora no podemos enviar reportes desde la app. Escribinos a ${CORREO_SOPORTE}.`
            : `No pudimos enviar el reporte. Probá de nuevo en un rato o escribinos a ${CORREO_SOPORTE}.`,
      };
    }
    return { status: "success", email };
  } catch {
    return { status: "error", mensaje: `No pudimos enviar el reporte. Escribinos a ${CORREO_SOPORTE}.` };
  }
}
