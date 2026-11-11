import { notFound } from "next/navigation";
import type { Dosis } from "@/components/vita/modo-simple/piezas";
import type { FilaHoy } from "@/lib/modo-simple/seleccion";
import { VistaPreviaModoSimple } from "./vista";

// Vista previa de la pantalla principal del modo simple SIN login, para capturas. Solo dev/test:
// 404 en producción salvo NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true" (mismo criterio que /dev/charla-simple).
// `?vista=` : grupo (default, 3 pastillas a la misma hora) | una | alertado | rutina (la pantalla "Tu rutina de hoy"). Abajo, la lista "Hoy" con todos los estados.

const TRES: Dosis[] = [
  { id: "3", nombre: "Metformina", dosis: "850", unidad: "mg", horaProgramada: "13:00" },
  { id: "4", nombre: "Vitamina D", dosis: null, unidad: "mg", horaProgramada: "13:00" },
  { id: "5", nombre: "Calcio", dosis: "500", unidad: "mg", horaProgramada: "13:00" },
];
const FILAS: FilaHoy[] = [
  { id: "1", nombre: "Enalapril", hora: "08:00", estado: "tomada" },
  { id: "2", nombre: "Levotiroxina", hora: "09:00", estado: "se-paso" },
  { id: "6", nombre: "Amoxicilina", hora: "10:00", estado: "omitida" },
  { id: "3", nombre: "Metformina", hora: "13:00", estado: "ahora" },
  { id: "4", nombre: "Vitamina D", hora: "13:00", estado: "ahora" },
  { id: "5", nombre: "Calcio", hora: "13:00", estado: "ahora" },
  { id: "7", nombre: "Losartán", hora: "21:00", estado: "mas-tarde" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();
  const { vista } = await searchParams;
  const grupo = vista === "una" ? TRES.slice(0, 1) : TRES;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md justify-center bg-cream">
      <div className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-canvas">
        <VistaPreviaModoSimple grupo={grupo} filas={vista === "una" ? FILAS.filter((f) => f.id !== "4" && f.id !== "5") : FILAS} alertado={vista === "alertado"} soloLista={vista === "rutina"} />
      </div>
    </div>
  );
}
