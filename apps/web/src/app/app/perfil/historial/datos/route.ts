import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarFamilia } from "@/lib/familia/nucleo";
import { obtenerHistorial } from "@/lib/exportar/nucleo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Descarga de todos los datos del usuario en JSON. Mismo núcleo que la
// página imprimible; autenticado con el cliente de sesión (RLS aplica).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // `?de=<id>`: persona que cuido, solo con permiso Admin (rol 'editar'). La
  // RLS decide igualmente qué filas se leen.
  const de = new URL(request.url).searchParams.get("de");
  let sobre = user.id;
  if (de && de !== user.id) {
    const m = (await listarFamilia(supabase)).find((f) => f.id === de);
    if (m?.rol !== "editar") return NextResponse.json({ error: "No tenés permiso para exportar ese perfil." }, { status: 403 });
    sobre = de;
  }

  try {
    const historial = await obtenerHistorial(supabase, sobre);
    // en-CA formatea como YYYY-MM-DD; fecha del día en Argentina.
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

    return new NextResponse(JSON.stringify(historial, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vita-mis-datos-${fecha}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudieron exportar tus datos. Intentá de nuevo." }, { status: 500 });
  }
}
