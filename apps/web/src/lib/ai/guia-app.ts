// Catálogo de pantallas de la app que vita puede ofrecer con un botón. Datos
// planos: lo importan la route del chat (prompt), las tools (validación) y no
// depende de nada del servidor. El modelo pasa SOLO la clave; la ruta sale de
// acá, nunca de lo que escriba el modelo.

export type PantallaApp = { ruta: string; titulo: string; descripcion: string };

export const PANTALLAS = {
  inicio: { ruta: "/app", titulo: "Inicio", descripcion: "el resumen de tu día: progreso, medicamentos y turnos próximos" },
  rutina: { ruta: "/app/rutina", titulo: "Rutina", descripcion: "tus tomas y turnos del día, los próximos y el historial" },
  medicamentos: { ruta: "/app/medicamentos", titulo: "Mis medicamentos", descripcion: "ver, editar o borrar tus medicamentos" },
  agregar_medicamento: { ruta: "/app/agregar-medicamento", titulo: "Agregar medicamento", descripcion: "cargar un medicamento nuevo con sus horarios" },
  turnos: { ruta: "/app/turnos", titulo: "Mis turnos", descripcion: "ver, editar o borrar tus turnos médicos" },
  agregar_turno: { ruta: "/app/agregar-turno", titulo: "Agregar turno", descripcion: "agendar un turno médico nuevo" },
  mi_salud: { ruta: "/app/mi-salud", titulo: "Mi Salud", descripcion: "tu estado, estudios, mediciones, consultas y vacunas" },
  agregar_estudio: { ruta: "/app/mi-salud/agregar-estudio", titulo: "Agregar estudio", descripcion: "subir la foto o el PDF de un estudio para que vita lo lea" },
  monitoreo: { ruta: "/app/mi-salud/monitoreo", titulo: "Monitoreo", descripcion: "ver tus mediciones de presión, glucemia, peso, etc." },
  agregar_medicion: { ruta: "/app/mi-salud/monitoreo/agregar", titulo: "Agregar medición", descripcion: "cargar una medición nueva" },
  condiciones: { ruta: "/app/condiciones", titulo: "Mis condiciones", descripcion: "ver y editar tus condiciones y alergias" },
  resumen_salud: { ruta: "/app/resumen-salud", titulo: "Resumen de salud", descripcion: "tu perfil médico: datos básicos, condiciones y alergias" },
  pastillas: { ruta: "/app/pastillas", titulo: "Mis pastillas", descripcion: "el stock que te queda de cada medicamento" },
  contar_pastillas: { ruta: "/app/pastillas/contar", titulo: "Contar pastillas", descripcion: "sacarle una foto al blíster para contar y controlar el stock" },
  avisos: { ruta: "/app/avisos", titulo: "Avisos", descripcion: "el centro de avisos y recordatorios" },
  config_avisos: { ruta: "/app/avisos/configuracion", titulo: "Configurar avisos", descripcion: "elegir qué avisos recibir, la espera y el silencio nocturno" },
  familia: { ruta: "/app/familia", titulo: "Familia", descripcion: "las personas que cuidás y quiénes te cuidan" },
  agregar_familiar: { ruta: "/app/familia/nuevo", titulo: "Agregar familiar", descripcion: "crear el perfil de alguien a quien cuidás" },
  perfil: { ruta: "/app/perfil", titulo: "Perfil", descripcion: "tu cuenta, preferencias y ajustes" },
  editar_perfil: { ruta: "/app/perfil/editar", titulo: "Editar perfil", descripcion: "cambiar tus datos personales y de salud" },
  contacto_emergencia: { ruta: "/app/perfil/contacto-emergencia", titulo: "Contacto de emergencia", descripcion: "cargar o cambiar a quién avisar en una emergencia" },
  compartir: { ruta: "/app/perfil/compartir", titulo: "Compartir con tu médico", descripcion: "crear un link temporal para que tu médico vea tu resumen" },
  historial: { ruta: "/app/perfil/historial", titulo: "Exportar mi historial", descripcion: "descargar o imprimir todos tus datos" },
  privacidad: { ruta: "/app/perfil/privacidad", titulo: "Privacidad y datos", descripcion: "privacidad, borrar historial y eliminar la cuenta" },
  seguridad: { ruta: "/app/perfil/seguridad", titulo: "Seguridad", descripcion: "PIN de bloqueo y cierre de sesión" },
  ayuda: { ruta: "/app/perfil/ayuda", titulo: "Ayuda", descripcion: "preguntas frecuentes y contacto" },
  faq: { ruta: "/app/perfil/ayuda/faq", titulo: "Preguntas frecuentes", descripcion: "respuestas a las dudas más comunes" },
  reportar_problema: { ruta: "/app/perfil/ayuda/reportar", titulo: "Reportar un problema", descripcion: "avisarnos si algo no anda bien" },
  modo_simple: { ruta: "/app/modo-simple", titulo: "Modo simple", descripcion: "la pantalla grande y simple de una toma a la vez" },
} as const satisfies Record<string, PantallaApp>;

export type ClavePantalla = keyof typeof PANTALLAS;

export const CLAVES_PANTALLAS = Object.keys(PANTALLAS) as ClavePantalla[];

/** La pantalla de una clave válida, o null (nunca se acepta una ruta cruda). */
export function pantallaPorClave(clave: unknown): PantallaApp | null {
  if (typeof clave !== "string" || !Object.hasOwn(PANTALLAS, clave)) return null;
  return PANTALLAS[clave as ClavePantalla];
}

/** Lista compacta `- clave: Título — descripción` para el system prompt. */
export function guiaDePantallasParaPrompt(): string {
  return CLAVES_PANTALLAS.map((c) => `- ${c}: ${PANTALLAS[c].titulo} — ${PANTALLAS[c].descripcion}`).join("\n");
}
