// Cuando se monta el overlay del chat (que se carga aparte para no pesar en el JS base de /app).
// Una vez montado se queda montado: la conversacion vive en su estado interno y no debe perderse al cerrarlo.
// El estado de "abierto" y el mensaje inicial viven en el proveedor (ya montado en el layout), asi que un
// `abrir(msg)` anterior a la carga queda en cola y el overlay lo consume apenas aparece.
export function debeMontarOverlay(args: { yaMontado: boolean; abierto: boolean; ociosoListo: boolean }): boolean {
  return args.yaMontado || args.abierto || args.ociosoListo;
}

type Programador = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Pide `cb` cuando el navegador esta ocioso (o a los `plazoMs` como maximo). Devuelve la cancelacion. */
export function cuandoOcioso(cb: () => void, plazoMs: number, entorno: Programador & { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }): () => void {
  if (entorno.requestIdleCallback) {
    const id = entorno.requestIdleCallback(cb, { timeout: plazoMs });
    return () => entorno.cancelIdleCallback?.(id);
  }
  const id = entorno.setTimeout(cb, Math.min(plazoMs, 2000));
  return () => entorno.clearTimeout(id);
}
