// Listas para los pickers de Resumen de salud — antes eran campos de texto
// libre (hallazgo del usuario: "hay que escribirlo a mano, listarlos para
// seleccionarlos directamente").

export const GENEROS = ["Femenino", "Masculino", "No binario", "Prefiero no decirlo", "Otro"] as const;

export const GRUPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// Prepagas/obras sociales más comunes en Argentina — el picker suma una
// opción "Otra" que revela un campo de texto libre al lado; lo que termina
// guardándose en `obra_social` es siempre el texto real, no un código.
// OTRA_PREPAGA es un valor interno que nunca puede colisionar con un dato
// real (a diferencia de haber usado el string "Otra" también como valor
// del <select>: un perfil viejo cuyo obra_social ya fuera literalmente
// "Otra" — dato de texto libre de antes de este picker — se habría
// interpretado como "elegiste la opción Otra, escribí cuál", vaciando el
// campo de texto libre y borrando ese dato al guardar sin tocar nada).
export const OTRA_PREPAGA = "__otra__";

export const PREPAGAS_ARGENTINA = [
  "OSDE",
  "Swiss Medical",
  "Galeno",
  "Medicus",
  "Sancor Salud",
  "Omint",
  "Avalian",
  "ACA Salud",
  "Premedic",
  "Jerárquicos Salud",
  "Hominis",
  "Apres",
  "IOMA",
  "PAMI",
] as const;
