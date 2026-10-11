import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { esStockBajo, type ResumenStock } from "@/lib/inventario/tipos";

// Badge "Quedan N" de un medicamento con control de pastillas. Con poco
// stock (menos que el umbral) pasa al tratamiento ámbar de alerta — calmo,
// no rojo: avisa, no asusta.
export function BadgeStock({ stock, className }: { stock: ResumenStock; className?: string }) {
  const bajo = esStockBajo(stock.stock, stock.umbral);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
        bajo ? "bg-chip-amber-bg text-chip-amber-ink" : "bg-secondary text-muted-foreground",
        className
      )}
    >
      {bajo && <VitaIcon name="alert-triangle" size={10} />}
      {stock.stock <= 0 ? "Sin pastillas" : `Quedan ${stock.stock}`}
    </span>
  );
}
