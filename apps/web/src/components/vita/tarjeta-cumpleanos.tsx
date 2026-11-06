import { VitaIcon } from "@/lib/vita-icons";

// Saludo de cumpleaños en Home (solo el día, con fecha de nacimiento completa).
// Para la propia cuenta: "¡Feliz cumpleaños, Ana!"; mirando a una persona a
// cargo: "Hoy cumple Ana" (el saludo no es para quien mira).
export function TarjetaCumpleanos({ nombre, edad, esPropio }: { nombre: string; edad: number; esPropio: boolean }) {
  return (
    <div className="flex items-start gap-3.5 rounded-[var(--radius-card)] bg-persona-1-tint p-[18px] shadow-card" role="status">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-persona-1-deep shadow-item" aria-hidden="true">
        <VitaIcon name="sparkle" size={22} strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <div className="eyebrow text-persona-1-deep">Hoy es un día especial</div>
        <div className="mt-1 text-balance break-words font-heading text-[20px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          {esPropio ? `¡Feliz cumpleaños, ${nombre}!` : `Hoy cumple ${nombre}`}
        </div>
        <div className="mt-1 text-pretty text-[13px] font-medium leading-[1.45] text-slate-brand">
          {esPropio ? `Hoy cumplís ${edad}. De parte de todo el equipo de vita, que tengas un día muy lindo.` : `Cumple ${edad}. Es un buen día para mandarle un saludo.`}
        </div>
      </div>
    </div>
  );
}
