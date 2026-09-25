// Catálogo de referencia condición → medicamentos comunes, usado por el
// paso de condiciones (multi-select) de la encuesta de onboarding
// (app/onboarding/chat/encuesta.tsx) para sugerir medicamentos ya
// indicados por un profesional, nunca para recomendar ni prescribir —
// DISCLAIMER_CATALOGO se muestra siempre que se presenta esta lista.
//
// Módulo de datos puro (sin JSX, sin acceso a DB) a propósito: la UI
// nunca hardcodea esta lista, siempre importa de acá.

// Nombrado CondicionCatalogo (no `Condicion`) para no colisionar con
// `Condicion` de lib/perfil/tipos.ts (label/tipo/desde) — mismo dominio
// conceptual, shape distinto, ambos se importan juntos en encuesta.tsx.
export type CondicionCatalogo = { id: string; label: string };

export const CONDICIONES: CondicionCatalogo[] = [
  { id: "diabetes", label: "Diabetes" },
  { id: "hipertension", label: "Hipertensión" },
  { id: "parkinson", label: "Parkinson" },
  { id: "alzheimer", label: "Alzheimer" },
  { id: "cardiovascular", label: "Enfermedad cardiovascular" },
  { id: "hipotiroidismo", label: "Hipotiroidismo" },
  { id: "otra", label: "Otra" },
  { id: "ninguna", label: "Ninguna" },
];

export type MedicamentoCatalogo = {
  nombre: string;
  dosisSugerida?: string;
  unidad?: string;
};

// Cada lista termina con una entrada "Otro" (medicamento no listado, sin
// dosis sugerida) — nunca incluye "Diabetes"/"Otra"/"Ninguna" acá, esas
// son condiciones, no medicamentos. Solo primeras líneas genuinamente
// comunes/conocidas — esto es una conveniencia de picklist, nunca una
// prescripción (ver DISCLAIMER_CATALOGO).
export const MEDICAMENTOS_POR_CONDICION: Record<string, MedicamentoCatalogo[]> = {
  diabetes: [
    { nombre: "Metformina", dosisSugerida: "500", unidad: "mg" },
    { nombre: "Glibenclamida", dosisSugerida: "5", unidad: "mg" },
    { nombre: "Insulina" },
    { nombre: "Otro" },
  ],
  hipertension: [
    { nombre: "Losartán", dosisSugerida: "50", unidad: "mg" },
    { nombre: "Enalapril", dosisSugerida: "10", unidad: "mg" },
    { nombre: "Amlodipina", dosisSugerida: "5", unidad: "mg" },
    { nombre: "Otro" },
  ],
  parkinson: [
    { nombre: "Levodopa/Carbidopa", dosisSugerida: "25/250", unidad: "mg" },
    { nombre: "Otro" },
  ],
  alzheimer: [
    { nombre: "Donepezilo", dosisSugerida: "5", unidad: "mg" },
    { nombre: "Memantina", dosisSugerida: "10", unidad: "mg" },
    { nombre: "Otro" },
  ],
  cardiovascular: [
    { nombre: "Aspirina", dosisSugerida: "100", unidad: "mg" },
    { nombre: "Atorvastatina", dosisSugerida: "20", unidad: "mg" },
    { nombre: "Otro" },
  ],
  hipotiroidismo: [
    { nombre: "Levotiroxina", dosisSugerida: "50", unidad: "mcg" },
    { nombre: "Otro" },
  ],
};

export const DISCLAIMER_CATALOGO =
  "Seleccioná únicamente medicamentos que ya hayan sido indicados por un profesional.";
