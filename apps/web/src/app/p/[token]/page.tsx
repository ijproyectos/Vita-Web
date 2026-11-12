import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import * as compartirNucleo from "@/lib/compartir/nucleo";
import { ReporteMedico } from "@/components/vita/reporte-medico";
import { VitaWordmark } from "@/components/vita/v-mark";
import { BotonImprimir } from "@/components/vita/boton-imprimir";

// Página PÚBLICA (sin login) con el resumen de salud que un paciente le
// comparte a su profesional. Todo el acceso pasa por la RPC
// `resumen_profesional` (security definer): null = inexistente, vencido o
// revocado, sin distinguir el caso. Nunca indexable y sin Referer.
export const metadata: Metadata = {
  title: "Resumen de salud",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const ZONA = "America/Argentina/Buenos_Aires";

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: ZONA }).format(
    new Date(iso)
  );
}

export default async function ResumenPublicoPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const resumen = await compartirNucleo.obtenerResumenPublico(supabase, token);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 pb-16 pt-6">
      {resumen ? (
        <ReporteMedico r={resumen} subtitulo={`Compartido a través de vita · Vigente hasta ${fechaLarga(resumen.vigente_hasta)}`} accion={<BotonImprimir />} />
      ) : (
        <NoDisponible />
      )}
    </div>
  );
}

function NoDisponible() {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <VitaWordmark size={30} tono="menta" />
      <h1 className="font-heading text-[22px] font-extrabold tracking-tight">Este link ya no está disponible</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Si necesitás ver el resumen, pedile al paciente que te comparta uno nuevo.
      </p>
    </div>
  );
}
