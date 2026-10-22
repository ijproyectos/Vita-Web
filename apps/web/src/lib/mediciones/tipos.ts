// Tipos, metadatos y validación PURA de las mediciones de "Monitoreo activo".
// Sin `server-only` a propósito: el formulario (cliente) usa los metadatos y
// el núcleo (servidor) reutiliza la misma validación antes del insert.

export const TIPOS_MEDICION = ["presion", "glucemia", "peso", "pulso", "saturacion", "temperatura"] as const;
export type TipoMedicion = (typeof TIPOS_MEDICION)[number];

export const CONTEXTOS_GLUCEMIA = ["ayunas", "despues_comer", "otro"] as const;
export type ContextoGlucemia = (typeof CONTEXTOS_GLUCEMIA)[number];

export const ETIQUETA_CONTEXTO: Record<ContextoGlucemia, string> = {
  ayunas: "En ayunas",
  despues_comer: "Después de comer",
  otro: "Otro momento",
};

export type Medicion = {
  id: string;
  usuario_id: string;
  tipo: TipoMedicion;
  /** Presión: sistólica. */
  valor: number;
  /** Presión: diastólica. */
  valor_secundario: number | null;
  /** Presión: pulso asociado (lpm). */
  pulso: number | null;
  /** Solo glucemia. */
  contexto: ContextoGlucemia | null;
  medido_at: string;
  notas: string | null;
  created_at: string;
};

export type RangoReferencia = {
  min: number;
  max: number;
  /** Texto orientativo que se muestra bajo el gráfico / en el formulario. */
  texto: string;
};

export type MetaMedicion = {
  nombre: string;
  /** Para frases ("Registrar presión arterial"). */
  nombreMin: string;
  unidad: string;
  /** Clave de `VitaIcon`. */
  icono: string;
  /** Token CSS (nunca hex): color de la serie. */
  color: string;
  decimales: number;
  /** Límites de plausibilidad (espejo de los CHECK de 022). */
  min: number;
  max: number;
  /** Rango de referencia ORIENTATIVO (no es indicación médica). */
  rango?: RangoReferencia;
};

export const META_MEDICION: Record<TipoMedicion, MetaMedicion> = {
  presion: {
    nombre: "Presión arterial",
    nombreMin: "presión arterial",
    unidad: "mmHg",
    icono: "heart",
    color: "var(--persona-1)",
    decimales: 0,
    min: 40,
    max: 300,
    rango: { min: 90, max: 130, texto: "Rango sugerido: 90–130 mmHg de máxima" },
  },
  glucemia: {
    nombre: "Glucemia",
    nombreMin: "glucemia",
    unidad: "mg/dL",
    icono: "droplet",
    color: "var(--persona-2)",
    decimales: 0,
    min: 10,
    max: 1000,
    rango: { min: 70, max: 100, texto: "Rango en ayunas: 70–100 mg/dL (solo aplica a mediciones en ayunas)" },
  },
  peso: {
    nombre: "Peso",
    nombreMin: "peso",
    unidad: "kg",
    icono: "scale",
    color: "var(--persona-3)",
    decimales: 1,
    min: 1,
    max: 500,
  },
  pulso: {
    nombre: "Pulso",
    nombreMin: "pulso",
    unidad: "lpm",
    icono: "heart-plus",
    color: "var(--persona-rosa)",
    decimales: 0,
    min: 20,
    max: 300,
  },
  saturacion: {
    nombre: "Saturación de oxígeno",
    nombreMin: "saturación de oxígeno",
    unidad: "%",
    icono: "wind",
    color: "var(--persona-azul)",
    decimales: 0,
    min: 50,
    max: 100,
  },
  temperatura: {
    nombre: "Temperatura",
    nombreMin: "temperatura",
    unidad: "°C",
    icono: "thermometer",
    color: "var(--aviso)",
    decimales: 1,
    min: 30,
    max: 45,
  },
};

export const AVISO_REFERENCIA = "Referencia orientativa: no reemplaza la indicación de tu médico.";

export function esTipoMedicion(v: unknown): v is TipoMedicion {
  return typeof v === "string" && (TIPOS_MEDICION as readonly string[]).includes(v);
}

export function esContextoGlucemia(v: unknown): v is ContextoGlucemia {
  return typeof v === "string" && (CONTEXTOS_GLUCEMIA as readonly string[]).includes(v);
}

// ─── Formato ───────────────────────────────────────────────────────────

/** 70.5 -> "70,5" (es-AR). Quita decimales sobrantes. */
export function formatearNumero(n: number, decimales = 1): string {
  const redondeado = Math.round(n * 10 ** decimales) / 10 ** decimales;
  return String(redondeado).replace(".", ",");
}

/** "120/80" para presión; el número a secas para el resto. */
export function formatearValor(m: Pick<Medicion, "tipo" | "valor" | "valor_secundario">): string {
  const dec = META_MEDICION[m.tipo].decimales;
  if (m.tipo === "presion" && m.valor_secundario != null) {
    return `${formatearNumero(m.valor, 0)}/${formatearNumero(m.valor_secundario, 0)}`;
  }
  return formatearNumero(m.valor, dec);
}

// ─── Rango de referencia ──────────────────────────────────────────────────

/**
 * `true` = dentro, `false` = fuera, `null` = no hay rango aplicable (peso,
 * pulso…, o glucemia que no es en ayunas). Referencia orientativa.
 */
export function dentroDeRango(m: Pick<Medicion, "tipo" | "valor" | "contexto">): boolean | null {
  const rango = META_MEDICION[m.tipo].rango;
  if (!rango) return null;
  if (m.tipo === "glucemia" && m.contexto !== "ayunas") return null;
  return m.valor >= rango.min && m.valor <= rango.max;
}

// ─── Validación (cliente y servidor) ─────────────────────────────────────

/** Acepta "70,5" y "70.5"; null si no es un número finito. */
export function parsearNumero(texto: unknown): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== "string") return null;
  const limpio = texto.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export type EntradaMedicion = {
  tipo: unknown;
  valor: unknown;
  valorSecundario?: unknown;
  pulso?: unknown;
  contexto?: unknown;
  /** ISO 8601 con zona; vacío/undefined = ahora (lo pone la DB). */
  medidoAt?: unknown;
  notas?: unknown;
};

export type DatosMedicion = {
  tipo: TipoMedicion;
  valor: number;
  valorSecundario: number | null;
  pulso: number | null;
  contexto: ContextoGlucemia | null;
  medidoAt: string | null;
  notas: string | null;
};

const MAX_FUTURO_MS = 5 * 60 * 1000;

/** Normaliza y valida una medición nueva. Nunca lanza. */
export function validarMedicion(
  entrada: EntradaMedicion,
  ahora: Date = new Date()
): { ok: true; datos: DatosMedicion } | { ok: false; message: string } {
  if (!esTipoMedicion(entrada.tipo)) return { ok: false, message: "Elegí qué querés medir." };
  const tipo = entrada.tipo;
  const meta = META_MEDICION[tipo];

  const entre = (n: number, min: number, max: number) => n >= min && n <= max;
  const rangoTxt = `${meta.min}–${meta.max} ${meta.unidad}`;

  const valor = parsearNumero(entrada.valor);
  if (valor === null) {
    return { ok: false, message: tipo === "presion" ? "Cargá la presión máxima (el número de arriba)." : "Cargá el valor medido." };
  }
  if (!entre(valor, meta.min, meta.max)) {
    return { ok: false, message: `${meta.nombre}: el valor tiene que estar entre ${rangoTxt}. Revisá si lo escribiste bien.` };
  }

  let valorSecundario: number | null = null;
  let pulso: number | null = null;
  if (tipo === "presion") {
    valorSecundario = parsearNumero(entrada.valorSecundario);
    if (valorSecundario === null) return { ok: false, message: "Cargá también la presión mínima (el número de abajo)." };
    if (!entre(valorSecundario, 20, 200)) {
      return { ok: false, message: "La presión mínima tiene que estar entre 20 y 200 mmHg. Revisá si la escribiste bien." };
    }
    if (valorSecundario >= valor) {
      return { ok: false, message: "La máxima tiene que ser mayor que la mínima. Revisá el orden de los números." };
    }
    const crudo = typeof entrada.pulso === "string" ? entrada.pulso.trim() : entrada.pulso;
    if (crudo !== undefined && crudo !== null && crudo !== "") {
      pulso = parsearNumero(crudo);
      if (pulso === null || !entre(pulso, 20, 300)) {
        return { ok: false, message: "El pulso tiene que estar entre 20 y 300 lpm." };
      }
    }
  }

  let contexto: ContextoGlucemia | null = null;
  if (tipo === "glucemia" && entrada.contexto) {
    if (!esContextoGlucemia(entrada.contexto)) return { ok: false, message: "El momento de la glucemia no es válido." };
    contexto = entrada.contexto;
  }

  let medidoAt: string | null = null;
  if (typeof entrada.medidoAt === "string" && entrada.medidoAt.trim()) {
    const fecha = new Date(entrada.medidoAt.trim());
    if (isNaN(fecha.getTime())) return { ok: false, message: "La fecha y hora no son válidas." };
    if (fecha.getTime() > ahora.getTime() + MAX_FUTURO_MS) {
      return { ok: false, message: "La medición no puede ser del futuro." };
    }
    medidoAt = fecha.toISOString();
  }

  const notas = typeof entrada.notas === "string" ? entrada.notas.trim() : "";
  if (notas.length > 500) return { ok: false, message: "La nota es muy larga (máximo 500 caracteres)." };

  return {
    ok: true,
    datos: {
      tipo,
      valor,
      valorSecundario,
      pulso,
      contexto,
      medidoAt,
      notas: notas || null,
    },
  };
}
