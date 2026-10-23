import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as compartirNucleo from "@/lib/compartir/nucleo";
import type { EnlaceProfesional } from "@/lib/compartir/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../top-bar";
import { FormularioCompartir } from "./formulario";
import { EnlaceRow } from "./enlace-row";

const SECCIONES = [
  "Tus datos básicos: nombre de pila, edad, sexo, grupo sanguíneo, altura y peso",
  "Condiciones y alergias",
  "Tus medicamentos con dosis, horarios y cómo tomarlos",
  "Tu rutina diaria de tomas y qué tan seguido las cumpliste en los últimos 14 días",
  "Tus próximos turnos médicos",
  "Resumen de tus estudios recientes (sin las fotos)",
  "Tu contacto de emergencia",
];

// "Compartir con profesional": el dueño genera un link temporal a un
// resumen de solo lectura (/p/{token}, sin login). Ver
// lib/compartir/nucleo.ts y supabase/migrations/015_enlaces_profesional.sql.
export default async function CompartirPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  let enlaces: EnlaceProfesional[] = [];
  let errorCarga = false;
  try {
    enlaces = await compartirNucleo.listarEnlaces(supabase, usuario.id);
  } catch {
    errorCarga = true;
  }

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5 pb-6">
      <TopBar eyebrow="Privacidad y datos" title="Compartir con profesional" />

      <p className="-mt-2 text-[13px] text-muted-foreground">
        Creá un link temporal para mostrarle a tu médico un resumen de tu salud, sin que tenga que instalar nada ni
        iniciar sesión.
      </p>

      <div className="rounded-[20px] bg-card p-4 shadow-card">
        <div className="font-heading text-[15px] font-bold">Qué va a ver el profesional</div>
        <ul className="mt-2.5 flex flex-col gap-2">
          {SECCIONES.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-[13px] leading-snug">
              <VitaIcon name="check" size={15} className="mt-0.5 shrink-0 text-primary" />
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
          No ve tu email, tus conversaciones con vita, ni datos de tus cuidadores.
        </p>
      </div>

      <FormularioCompartir />

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
