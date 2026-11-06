import { APP_VERSION, BUILD_DATE, BUILD_ID } from "@/lib/version";

// Versión del servidor EN EJECUCIÓN. Pública (sin sesión, sin datos de usuario)
// y nunca cacheada: el cliente la compara con el build con el que se renderizó.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: APP_VERSION, build: BUILD_ID, fecha: BUILD_DATE },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
