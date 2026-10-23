import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { obtenerOpcionesPerfil, rolSobre } from "@/lib/familia/perfil-activo";
import { TopBar } from "../../top-bar";
import { FilaNav, Grupo, Tile } from "../filas";
import { AccionesDatos, type PersonaDatos } from "./acciones-datos";

// Privacidad y datos (V7): qué guarda vita, descargar los datos (PDF o archivo
// completo), borrar historial viejo y los atajos legales y de compartir.
export default async function PrivacidadPage() {
  const usuario = await requireUser();
  const opciones = await obtenerOpcionesPerfil();

  // "De quién": uno mismo y las personas que cuidás con permiso Admin (un
  // Lector no descarga lo de otro, igual que en el diseño).
  const personas: PersonaDatos[] = [];
  for (const o of opciones) {
    if (o.esPropio) personas.push({ id: o.id, etiqueta: "Mis datos", nombre: o.nombre, esPropio: true });
    else if ((await rolSobre(o.id)) === "editar") personas.push({ id: o.id, etiqueta: o.nombre, nombre: o.nombre, esPropio: false });
  }
  if (!personas.some((p) => p.esPropio)) personas.unshift({ id: usuario.id, etiqueta: "Mis datos", nombre: "vos", esPropio: true });

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil" eyebrow="Cuenta" title="Privacidad y datos" />

      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Qué guardamos</h2>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          <DatoGuardado icon="pill" label="Remedios y tomas" sub="Qué tomás, a qué hora y si lo confirmaste" />
          <DatoGuardado icon="stethoscope" label="Turnos" sub="Fecha, profesional y lugar" />
          <DatoGuardado icon="chart" label="Mediciones" sub="Presión, glucemia, peso y otras" />
          <DatoGuardado icon="vial" label="Estudios" sub="Los archivos que subís y su resumen" />
          <DatoGuardado icon="heart" label="Perfil de salud" sub="Condiciones, alergias, medidas y cobertura" />
          <DatoGuardado icon="sparkle" label="Conversaciones con vita" sub="Lo que le escribís al asistente" />
        </div>
        <p className="px-1 pt-2.5 text-pretty text-xs font-medium leading-[1.45] text-slate-brand">
          No vendemos ni compartimos tus datos con nadie fuera de tu familia.
        </p>
      </section>

      <AccionesDatos personas={personas} />

      <Grupo titulo="Compartir y legal">
        <FilaNav
          icon="upload"
          label="Compartir con profesional"
          sub="Link temporal para tu médico"
          href="/app/perfil/compartir"
        />
        <FilaNav icon="lock" label="Política de privacidad" sub="Qué usa vita de tu información" href="/legal/privacidad" />
        <FilaNav icon="doc" label="Términos y condiciones" sub="Las reglas de uso de vita" href="/legal/terminos" />
      </Grupo>

      <Link href="/app/perfil/eliminar-cuenta" className="self-center px-3.5 py-1.5 text-[13px] font-bold text-subtle">
        ¿Querés eliminar la cuenta entera?
      </Link>
    </div>
  );
}

function DatoGuardado({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <Tile icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="font-heading text-sm font-extrabold tracking-[-0.01em]">{label}</div>
        <div className="mt-px text-[11.5px] font-medium text-subtle">{sub}</div>
      </div>
    </div>
  );
}
