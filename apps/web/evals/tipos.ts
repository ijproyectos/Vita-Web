// Tipos del set de evals de vita. Sin I/O: los usan los casos, el evaluador, el runner y los tests.

export type RolFamiliar = "editar" | "ver";

export type PersonaEval = { id: string; nombre: string; rol: RolFamiliar; relacion?: string };

export type MensajeEval = { role: "user" | "assistant"; content: string };

/** Una llamada a tool hecha por el modelo. */
export type LlamadaTool = { nombre: string; input: Record<string, unknown> };

/** Lo que el modelo hizo en todo el caso (texto final + todas las tools que llamó). */
export type RespuestaEval = { texto: string; llamadas: LlamadaTool[] };

export type ContextoEval = {
  /** "Medicamentos de hoy" tal como los ve el modelo en el bloque Hoy (ya formateados). */
  medicamentosHoy: string[];
  turnosHoy: string[];
  familia: PersonaEval[];
  /** Perfil de un familiar abierto en pantalla (por id), si aplica. */
  abiertoId?: string;
};

export type Espera = {
  /** Tools que tiene que llamar al menos una vez. */
  llama?: string[];
  /** Tools que no puede llamar nunca. */
  noLlama?: string[];
  /** Ninguna tool de escritura. */
  noEscribe?: boolean;
  /** Mínimo de llamadas por tool. */
  minLlamadas?: Record<string, number>;
  /** Alguna llamada a `tool` donde cada campo (valor serializado a texto) cumple su regex. */
  argumentos?: { tool: string; contiene: Record<string, RegExp> }[];
  /** Ninguna llamada a `tool` cuyo input serializado (JSON) cumpla `regex`. */
  entradaProhibida?: { tool: string; regex: RegExp }[];
  /** Todas estas regex tienen que aparecer en el texto final. */
  texto?: RegExp[];
  /** Ninguna de estas puede aparecer en el texto final. */
  sinTexto?: RegExp[];
  /** Regla propia: devuelve null si pasa o el motivo de la falla. */
  custom?: (r: RespuestaEval) => string | null;
};

export type CasoEval = {
  id: string;
  descripcion: string;
  /** Mensajes previos de la conversación (opcional). */
  historial?: MensajeEval[];
  /** Último mensaje del usuario. */
  mensaje: string;
  contexto: ContextoEval;
  /** Resultado simulado por tool (reemplaza al genérico). */
  resultadosTool?: Record<string, string>;
  /** El usuario ya confirmó en el turno anterior: una escritura con `confirmado: true` se ejecuta. */
  confirmacionPrevia?: boolean;
  espera: Espera;
  /** Capacidad deseada que hoy no está garantizada: una falla se informa pero no cuenta como error. */
  aspiracional?: boolean;
};

export type ResultadoCaso = { id: string; ok: boolean; aspiracional: boolean; fallas: string[] };
