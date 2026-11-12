import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as compartirNucleo from "@/lib/compartir/nucleo";
import type { EnlaceProfesional } from "@/lib/compartir/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../top-bar";
import { FormularioCompartir } from "./formulario";
import { EnlaceRow } from "./enlace-row";
import { DescargarPdf } from "./descargar-pdf";
import { personasConDatos } from "../privacidad/personas";

const SECCIONES = [
  "Tus datos básicos: nombre de pila, edad, sexo, grupo sanguíneo, altura y peso",
  "Condiciones y alergias",
  "Tus medicamentos con dosis, horarios y cómo tomarlos",
  "Qué porcentaje de las tomas cumpliste en los últimos 14 días",
  "Tus mediciones de los últimos 30 días (presión, glucemia, peso…)",
  "Resumen de tus estudios recientes (sin las fotos)",
  "Tu contacto de emergencia",
];

// "Para tu médico": UN resumen de salud, en PDF (`/app/perfil/compartir/pdf`)
// o con un link temporal de solo lectura (/p/{token}, sin login). Los dos
// muestran lo mismo (`ReporteMedico`). Ver lib/compartir/ y la migración 015.
export default async function CompartirPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const personas = await personasConDatos();

  let enlaces: EnlaceProfesional[] = [];
  let errorCarga = false;
  try {
    enlaces = await compartirNucleo.listarEnlaces(supabase, usuario.id);
  } catch {
    errorCarga = true;
  }

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5 pb-6">
      <TopBar volverA="/app/perfil/privacidad" eyebrow="Privacidad y datos" title="Para tu médico" />

      <p className="-mt-2 text-[13px] text-muted-foreground">
        Un resumen de tu salud para llevarle a tu médico: descargalo en PDF o mandale un link, sin que tenga que
        instalar nada. Los dos muestran lo mismo.
      </p>

      <div className="rounded-[20px] bg-card p-4 shadow-card">
        <div className="font-heading text-[15px] font-bold">Qué va a ver tu médico</div>
        <ul className="mt-2.5 flex flex-col gap-2">
          {SECCIONES.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-[13px] leading-snug">
              <VitaIcon name="check" size={15} className="mt-0.5 shrink-0 text-primary" />
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
          No ve tus turnos, el detalle de cada toma, tus conversaciones con vita, tu email ni a quienes te cuidan.
        </p>
      </div>

      <DescargarPdf personas={personas} />

      <div>
        <div className="px-1.5 pb-1 font-heading text-[15px] font-bold">O mandale un link</div>
        <p className="px-1.5 pb-2.5 text-[12.5px] text-muted-foreground">Lo abre desde su celular o su compu y vence solo. Por ahora, con tus datos.</p>
        <FormularioCompartir />
      </div>

      <div>
        <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">Tus links</div>
        {errorCarga ? (
          <p className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">
            No pudimos cargar tus links. Intentá de nuevo en un momento.
          </p>
        ) : enlaces.length === 0 ? (
          <div className="rounded-[20px] bg-card p-5 text-center text-sm text-muted-foreground shadow-card">
            Todavía no creaste ningún link.
          </div>
        ) : (
          <div className="rounded-[20px] bg-card shadow-card">
            {enlaces.map((e) => (
              <EnlaceRow key={e.id} enlace={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
