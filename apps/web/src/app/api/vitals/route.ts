import { createAdminClient } from "@/lib/supabase/admin";
import { verificarLimitePedidos } from "@/lib/limites/nucleo";
import { LIMITES_VITALS } from "@/lib/limites/logica";
import { clasificarDispositivo, esquemaEnvioVitals, filasDeEnvio, MAX_BYTES_ENVIO } from "@/lib/vitals/logica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telemetria anonima de velocidad real (Web Vitals). Publica a proposito: la mandan hasta las
// pantallas sin sesion (/login). No identifica a nadie: no se lee ni guarda usuario, IP ni user
// agent (este solo se usa para decidir mobile / desktop). Uso SANCIONADO de service_role (ver
// `lib/supabase/admin.ts`): la tabla `web_vitals` no tiene policies. Freno por IP hasheada (HMAC)
// con `contar_pedido`. Siempre responde 204 salvo payload invalido (400) o freno (429): un fallo de
// la medicion jamas debe afectar a quien navega.
function sinContenido(status = 204) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const texto = await request.text();
    if (texto.length === 0 || texto.length > MAX_BYTES_ENVIO) return sinContenido(400);

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return sinContenido(400);
    }
    const parsed = esquemaEnvioVitals.safeParse(json);
    if (!parsed.success) return sinContenido(400);

    const limite = await verificarLimitePedidos({ usuarioId: "", headers: request.headers, limites: LIMITES_VITALS });
    if (!limite.ok) return sinContenido(429);

    const filas = filasDeEnvio(parsed.data, clasificarDispositivo(request.headers.get("user-agent")));
    const { error } = await createAdminClient().from("web_vitals").insert(filas);
    if (error) console.warn("web_vitals: no se pudo guardar", error.code ?? "");
    return sinContenido();
  } catch {
    console.warn("web_vitals: fallo el registro");
    return sinContenido();
  }
}
