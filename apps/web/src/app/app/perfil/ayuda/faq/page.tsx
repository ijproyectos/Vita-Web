import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "@/app/app/top-bar";
import { CORREO_SOPORTE } from "@/lib/legal/datos";

type Pregunta = { q: string; a: string; link?: { texto: string; href: string } };

// Copy del V7 (VitaApp → Ayuda → Preguntas frecuentes), recortado a lo que
// vita hace hoy: sin planes de pago ni roles Admin/Lector.
const GRUPOS: { titulo: string; items: Pregunta[] }[] = [
  {
    titulo: "Remedios y avisos",
    items: [
      {
        q: "¿Qué pasa si no confirmo una toma?",
        a: "Si alguien te cuida, le aviso cuando pasa un rato sin que la marques, y te puede mandar un recordatorio a tu celular.",
      },
      {
        q: "¿Puedo cambiar el horario de un remedio?",
        a: "Podés borrar el horario desde Rutina y cargarlo de nuevo, o pedírselo a vita: “pasá el Losartán a las 9”.",
        link: { texto: "Ir a Rutina", href: "/app/rutina" },
      },
      {
        q: "¿Cómo sé cuántas pastillas me quedan?",
        a: "Sacale una foto al blister cuando lo empezás. Voy contando las tomas y te aviso antes de que se termine.",
        link: { texto: "Mis pastillas", href: "/app/pastillas" },
      },
      {
        q: "No me llegan los avisos",
        a: "Revisá que vita tenga los avisos permitidos en el celular y que no esté en modo silencio. En iPhone, primero agregá vita a tu pantalla de inicio.",
        link: { texto: "Activar avisos", href: "/app/perfil" },
      },
    ],
  },
  {
    titulo: "Familia",
    items: [
      {
        q: "¿Cómo sumo a alguien para que me ayude a cuidar?",
        a: "Desde Mis cuidadores, invitando por mail. Le pasás el link y entra a ver tu adherencia.",
        link: { texto: "Mis cuidadores", href: "/app/perfil/cuidadores" },
      },
      {
        q: "¿Cómo conecto el celular de mi mamá?",
        a: "Con Vincular a alguien generás un código; ella lo escribe en su celular y listo.",
        link: { texto: "Vincular a alguien", href: "/onboarding/vincular-cuidado" },
      },
      {
        q: "¿Qué es el modo simple?",
        a: "Una pantalla con letras grandes y solo lo de hoy: qué tomar, cuándo y un botón para avisar que ya lo tomó.",
        link: { texto: "Abrir modo simple", href: "/app/modo-simple" },
      },
    ],
  },
  {
    titulo: "Salud",
    items: [
      {
        q: "¿Vita reemplaza al médico?",
        a: "No. Ordena tus datos y te los resume, pero las decisiones las toma tu médico.",
      },
      {
        q: "¿Cómo cargo un estudio?",
        a: "En Mi Salud tocá el + y sacale una foto al papel o subí el PDF. vita completa el tipo, la fecha y los valores.",
        link: { texto: "Agregar estudio", href: "/app/mi-salud/agregar-estudio" },
      },
    ],
  },
  {
    titulo: "Tus datos",
    items: [
      {
        q: "¿Mis datos están seguros? ¿Puedo borrarlos?",
        a: "No los vendemos ni los compartimos fuera de la gente que vos elijas. Podés descargarlos o borrarlos cuando quieras.",
        link: { texto: "Privacidad y datos", href: "/app/perfil/privacidad" },
      },
    ],
  },
];

export default async function FaqPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Ayuda" title="Preguntas frecuentes" />

      {GRUPOS.map((g) => (
        <section key={g.titulo}>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">{g.titulo}</h2>
          <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {g.items.map((p) => (
              <details
                key={p.q}
                className="group [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <span className="font-heading text-[14.5px] font-extrabold leading-snug tracking-[-0.02em]">{p.q}</span>
                  <VitaIcon
                    name="chevron-down"
                    size={18}
                    className="shrink-0 text-faint transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-[13px] font-medium leading-[1.5] text-slate-brand">{p.a}</p>
                  {p.link && (
                    <Link href={p.link.href} className="mt-2 inline-block text-[13px] font-bold text-teal-deep">
                      {p.link.texto} →
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center justify-between gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <div className="min-w-0">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">¿No encontraste lo que buscabas?</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Respondemos en menos de 24 horas</div>
        </div>
        <a
          href={`mailto:${CORREO_SOPORTE}`}
          className="shrink-0 rounded-full bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground"
        >
          Escribinos
        </a>
      </div>
    </div>
  );
}
