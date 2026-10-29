/**
 * Resolves with the promise's value, or with `undefined` once `ms` elapse, whichever comes first.
 * Never rejects: a rejection of `promesa` is also reported as `undefined`.
 */
export function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promesa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}
