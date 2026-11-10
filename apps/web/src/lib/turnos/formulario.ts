import { normalizarLlevar, validarTelefono, type DatosNuevoTurno, type ItemLlevar } from "./tipos";

// Lectura del formulario de turno (alta y edición usan el mismo): un solo
// lugar que sabe qué campos manda la pantalla y cómo se validan. Lo que no
// viene en el formulario no aparece en el resultado, así una edición no pisa
// columnas que la pantalla no mostró (dirección, teléfono y "qué llevar"
// solo se muestran con la migración 023 aplicada).

export type LecturaTurno = { ok: true; datos: DatosNuevoTurno } | { ok: false; message: string };

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

export function leerTurnoDelFormulario(formData: FormData): LecturaTurno {
  const especialidad = texto(formData, "especialidad");
  const fecha = texto(formData, "fecha");
  const hora = texto(formData, "hora");
  if (!especialidad || !fecha || !hora) {
    return { ok: false, message: "Especialidad, fecha y hora son obligatorios." };
  }

  const telefonoCrudo = formData.get("telefono");
  const tel = typeof telefonoCrudo === "string" ? validarTelefono(telefonoCrudo) : null;
  if (tel && !tel.ok) return { ok: false, message: tel.message };

  let llevar: ItemLlevar[] | undefined;
  const llevarCrudo = formData.get("llevar");
  if (typeof llevarCrudo === "string") {
    try {
      llevar = normalizarLlevar(JSON.parse(llevarCrudo));
    } catch {
      llevar = undefined;
    }
  }

  const direccionCruda = formData.get("direccion");
  return {
    ok: true,
    datos: {
      especialidad,
      profesional: texto(formData, "profesional") || null,
      lugar: texto(formData, "lugar") || null,
      fecha,
      hora,
      acompanado: formData.get("acompanado") === "on",
      notas: texto(formData, "notas") || null,
      ...(typeof direccionCruda === "string" ? { direccion: direccionCruda.trim().slice(0, 200) || null } : {}),
      ...(tel && tel.ok ? { telefono: tel.valor } : {}),
      ...(llevar !== undefined ? { llevar } : {}),
    },
  };
}
