import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";

// Tira de poco stock bajo la tarjeta de hoy (V7, Home): "Losacor · quedan unas
// 5, alcanzan hasta el jueves" + "Ya compré". En vita "Ya compré" lleva a
// registrar lo comprado (contar las pastillas nuevas) — es la única forma
// real de actualizar el stock.
export type ItemStockBajo = {
  medicamentoId: string;
  nombre: string;
  stock: number;
  /** Día de la semana hasta el que alcanza ("jueves"), si se puede derivar. */
  hasta: string | null;
};

export function TiraStock({ items, deQuien, puedeEditar }: { items: ItemStockBajo[]; deQuien?: string | null; puedeEditar: boolean }) {
  if (items.length === 0) return null;
  const [primero, ...resto] = items;
  const cantidad = primero.stock <= 0 ? "no quedan" : primero.stock === 1 ? "queda 1" : `quedan unas ${primero.stock}`;

  return (
    <div className="-mt-2.5 flex items-center gap-2.5 rounded-[16px] border border-foreground/[0.06] bg-card/60 py-2.5 pl-3.5 pr-2">
      <VitaIcon name="pill" size={16} className="shrink-0 text-subtle" />
      <Link href="/app/pastillas" className="min-w-0 flex-1 text-pretty text-[12.5px] font-medium leading-[1.35] text-slate-brand">
        <strong className="font-extrabold text-foreground">
          {primero.nombre}
          {deQuien ? ` de ${deQuien}` : ""}
        </strong>{" "}
        · {cantidad}
        {primero.hasta ? `, alcanzan hasta el ${primero.hasta}` : ""}
        {resto.length > 0 && <span className="text-subtle"> · y {resto.length} más</span>}
      </Link>
      {puedeEditar && (
        <Link
          href={`/app/pastillas/contar?medicamento=${primero.medicamentoId}`}
          className="shrink-0 px-2 py-1.5 text-[12.5px] font-extrabold text-persona-2"
        >
          Ya compré
        </Link>
      )}
    </div>
  );
}
