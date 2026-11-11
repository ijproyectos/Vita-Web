import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerResumenParaMedico } from "@/lib/compartir/nucleo";
import type { ResumenProfesional } from "@/lib/compartir/tipos";
import { rolSobre } from "@/lib/familia/perfil-activo";
import { ZONA_AR } from "@/lib/tiempo-ar";
import { BotonImprimir } from "@/components/vita/boton-imprimir";
import { ReporteMedico } from "@/components/vita/reporte-medico";
import { TopBar } from "../../../top-bar";

// PDF de "Para tu médico": el mismo resumen que el link (`ReporteMedico`),
// listo para imprimir o guardar como PDF. `?de=<id>`: alguien que cuido con
// permiso Admin (la RLS igual decide qué filas se leen); si no, el propio.
export default async function PdfMedicoPage({ searchParams }: PageProps<"/app/perfil/compartir/pdf">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const { de: deCrudo } = await searchParams;
  const de = Array.isArray(deCrudo) ? deCrudo[0] : deCrudo;
  const sobre = de && de !== usuario.id && (await rolSobre(de)) === "editar" ? de : usuario.id;

  let r: ResumenProfesional | null = null;
  try {
    r = await obtenerResumenParaMedico(supabase, sobre);
  } catch {
    r = null;
  }
  const generado = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: ZONA_AR }).format(new Date());

  return (
    <div className="reporte-historial flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <div className="no-imprimir flex flex-col gap-2">
        <TopBar volverA="/app/perfil/compartir" eyebrow="Para tu médico" title="Resumen en PDF" />
        <p className="px-1 text-[12px] leading-snug text-muted-foreground">Tocá Imprimir y elegí “Guardar como PDF”.</p>
      </div>
      {r ? (
        <ReporteMedico r={r} subtitulo={`Generado con vita el ${generado}`} accion={<BotonImprimir />} />
      ) : (
        <p className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">No pudimos armar el resumen. Intentá de nuevo en un momento.</p>
      )}
    </div>
  );
}
