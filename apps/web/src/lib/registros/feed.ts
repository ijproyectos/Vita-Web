import { diaYMes, fechaISOEnAR } from "@/lib/rutina/formato";
import { TIPO_PDF, type EstudioConUrl } from "@/lib/estudios/tipos";
import { META_MEDICION, formatearValor, type Medicion } from "@/lib/mediciones/tipos";
import type { Consulta, RegistroSalud, Vacuna } from "./tipos";

// Arma el feed de "Registros" (D:470). Mapeo de la etiqueta MANUAL / VITA:
//   - estudios   -> MANUAL (el archivo lo carga la persona; en el diseño todos
//                    los estudios son "manual").
//   - mediciones -> VITA (se registran en Monitoreo de vita; en el diseño las
//                    mediciones cargadas desde Monitoreo/chat son "vita").
//   - consultas / vacunas -> su columna `origen` (vita = las cargó vita).
function cuando(fechaISO: string): string {
  const { dia, mes } = diaYMes(fechaISO);
  return `${dia.padStart(2, "0")} ${mes.toLowerCase()}`;
}

export function armarFeed(datos: {
  estudios: EstudioConUrl[];
  mediciones: Medicion[];
  consultas: Consulta[];
  vacunas: Vacuna[];
}): RegistroSalud[] {
  const items: RegistroSalud[] = [];

  for (const e of datos.estudios) {
    const fecha = e.fecha ?? e.created_at.slice(0, 10);
    const resumenValores = e.valores
      .slice(0, 2)
      .map((v) => `${v.nombre} ${v.valor}`)
      .join(" · ");
    items.push({
      clave: `estudio-${e.id}`,
      cat: "estudio",
      titulo: e.tipo ?? "Estudio sin identificar",
      sub: resumenValores || e.resumen || (e.estado === "error" ? "vita no pudo leer los datos; el archivo quedó guardado" : "Cargado hoy"),
      cuando: cuando(fecha),
      orden: `${fecha}|${e.created_at}`,
      origen: "manual",
      adjunto: e.archivo_tipo === TIPO_PDF ? "PDF" : "FOTO",
      href: `/app/mi-salud/estudios/${e.id}`,
    });
  }

  for (const m of datos.mediciones.slice(0, 30)) {
    const meta = META_MEDICION[m.tipo];
    const fecha = fechaISOEnAR(new Date(m.medido_at));
    items.push({
      clave: `medicion-${m.id}`,
      cat: "medicion",
      titulo: meta.nombre,
      sub: `${formatearValor(m)} ${meta.unidad}`,
      cuando: cuando(fecha),
      orden: `${fecha}|${m.medido_at}`,
      origen: "vita",
      href: `/app/mi-salud/monitoreo/${m.tipo}`,
    });
  }

  for (const c of datos.consultas) {
    const quien = [c.profesional, c.resumen].filter(Boolean).join(" — ");
    items.push({
      clave: `consulta-${c.id}`,
      cat: "consulta",
      titulo: c.especialidad,
      sub: quien || c.lugar || "Consulta",
      cuando: cuando(c.fecha),
      orden: `${c.fecha}|${c.created_at}`,
      origen: c.origen,
    });
  }

  for (const v of datos.vacunas) {
    items.push({
      clave: `vacuna-${v.id}`,
      cat: "vacuna",
      titulo: v.dosis ? `${v.nombre} · ${v.dosis}` : v.nombre,
      sub: v.lugar ?? "Vacuna",
      cuando: cuando(v.fecha),
      orden: `${v.fecha}|${v.created_at}`,
      origen: v.origen,
    });
  }

  return items.sort((a, b) => (a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0));
}
