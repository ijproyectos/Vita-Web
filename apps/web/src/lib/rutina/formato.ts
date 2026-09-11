const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// "2026-04-21" -> "mar 21 abr" (mismo formato que DateInput/TurnoCard del diseño).
export function formatoFechaCorta(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(d.getTime())) return fechaISO;
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Para la tarjeta de turno: día + mes por separado ("21" / "ABR").
export function diaYMes(fechaISO: string): { dia: string; mes: string } {
  const d = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(d.getTime())) return { dia: "—", mes: "" };
  return { dia: String(d.getDate()), mes: MESES[d.getMonth()].toUpperCase() };
}

export function fechaDeHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fechaConOffset(offsetDias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
