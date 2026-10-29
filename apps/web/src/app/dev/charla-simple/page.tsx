import { notFound } from "next/navigation";
import type { VistaInicialCharla } from "@/app/app/modo-simple/charla-simple";
import { VistaPrevia } from "./vista";
import type { MedHoy, TurnoProximo } from "@/lib/modo-simple/respuestas";
import { fechaISOEnAR } from "@/lib/rutina/formato";

// Vista previa de la charla de voz del modo simple SIN login, para capturas. Solo dev/test:
// 404 en producción salvo NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true" (mismo criterio que /dev/emails).
// `?vista=` abre directo en un estado: inicio (default) | escribir | respuesta | ayuda | medicion | sin-internet.

const VISTAS: Record<string, VistaInicialCharla> = {
  inicio: { fase: "inicio" },
  escribir: { fase: "escribir" },
  respuesta: {
    fase: "respuesta",
    pregunta: "¿Qué pastillas me tocan hoy?",
    respuesta: "Hoy te tocan la Metformina a la 1 de la tarde y la Metformina a las 9 de la noche. El Enalapril ya lo tomaste.",
  },
  ayuda: {
    fase: "respuesta",
    pregunta: "Me siento mal, necesito ayuda",
    respuesta: "Quedate tranquila, Elsa. Ya les avisé para que te ayuden.",
    ayuda: ["Mica"],
  },
  medicion: { fase: "confirmar", pregunta: "Me medí el azúcar y me dio 110", medicion: { tipo: "glucemia", valor: 110, valorSecundario: null } },
  "sin-internet": { fase: "inicio", sinInternet: true },
};

const MEDS: MedHoy[] = [
  { nombre: "Enalapril", hora_programada: "08:00", tomado: true },
  { nombre: "Metformina", hora_programada: "13:00", tomado: false },
  { nombre: "Metformina", hora_programada: "21:00", tomado: false },
];

function turnoEnTresDias(): TurnoProximo {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return { fecha: fechaISOEnAR(d), hora: "10:00", especialidad: "Cardiología", profesional: null };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();

  const { vista } = await searchParams;
  const inicial = VISTAS[vista ?? "inicio"] ?? VISTAS.inicio;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md justify-center bg-cream">
      <div className="relative h-dvh w-full max-w-md overflow-hidden">
        {/* La key remonta con el estado inicial cuando cambia ?vista=. */}
        <VistaPrevia key={vista ?? "inicio"} medsHoy={MEDS} turnoProximo={turnoEnTresDias()} inicial={inicial} />
      </div>
    </div>
  );
}
