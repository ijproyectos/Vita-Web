import { notFound } from "next/navigation";
import type { Dosis, Siguiente } from "@/components/vita/modo-simple/piezas";
import { VistaPreviaModoSimple } from "./vista";

// Vista previa de la pantalla principal del modo simple SIN login, para capturas. Solo dev/test:
// 404 en producción salvo NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true" (mismo criterio que /dev/charla-simple).
// `?vista=` : grupo (default, 3 pastillas a la misma hora) | una | alertado.

const TRES: Dosis[] = [
  { id: "1", nombre: "Enalapril", dosis: "10", unidad: "mg", horaProgramada: "08:00" },
  { id: "2", nombre: "Metformina", dosis: "850", unidad: "mg", horaProgramada: "08:00" },
  { id: "3", nombre: "Vitamina D", dosis: null, unidad: "mg", horaProgramada: "08:00" },
];
const SIGUIENTES: Siguiente[] = [
  { id: "4", nombre: "Metformina", horaProgramada: "21:00", momento: "noche" },
  { id: "5", nombre: "Magnesio", horaProgramada: "22:00", momento: "noche" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();
  const { vista } = await searchParams;
  const grupo = vista === "una" ? TRES.slice(0, 1) : TRES;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md justify-center bg-cream">
      <div className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-canvas">
        <VistaPreviaModoSimple grupo={grupo} siguientes={SIGUIENTES} alertado={vista === "alertado"} />
      </div>
    </div>
  );
}
