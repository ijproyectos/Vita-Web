// Cursor del hilo único de chat: el par (created_at, id) da un orden total y estable aunque dos
// mensajes compartan el mismo created_at. Lógica pura (sin server-only): la usan la capa de datos y
// la Server Action que valida lo que manda el cliente.

export type CursorHilo = { created_at: string; id: string };

// Lo que llega del cliente no se confía: solo se aceptan timestamps ISO y uuids (se interpolan en un
// filtro de PostgREST, así que nada más puede pasar).
const RE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsearCursor(valor: unknown): CursorHilo | null {
  if (!valor || typeof valor !== "object") return null;
  const { created_at, id } = valor as { created_at?: unknown; id?: unknown };
  if (typeof created_at !== "string" || typeof id !== "string") return null;
  if (!RE_TIMESTAMP.test(created_at) || !RE_UUID.test(id)) return null;
  return { created_at, id };
}

/** Filtro `or` de PostgREST para "estrictamente anterior al cursor" en orden (created_at, id). */
export function filtroAnteriorA(cursor: CursorHilo): string {
  return `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt.${cursor.id})`;
}

/** Cursor de la fila más vieja de una página ascendente (de donde sigue la página anterior). */
export function cursorDelMasViejo<T extends CursorHilo>(paginaAscendente: T[]): CursorHilo | null {
  const primero = paginaAscendente[0];
  return primero ? { created_at: primero.created_at, id: primero.id } : null;
}
