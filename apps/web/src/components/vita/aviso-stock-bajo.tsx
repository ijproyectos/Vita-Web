import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { textoQuedan, type Inventario } from "@/lib/inventario/tipos";

// Banner de poco stock: lista los medicamentos por debajo del umbral. Sin
// `href` (vista del cuidador, que no tiene la pantalla de conteo del elder)
// se muestra solo informativo.
export function AvisoStockBajo({
  items,
  titulo = "Te quedan pocas pastillas",
  href,
}: {
  items: Pick<Inventario, "id" | "nombre" | "stock">[];
  titulo?: string;
  href?: string;
}) {
  if (items.length === 0) return null;

  const contenido = (
    <div className="flex items-start gap-3 rounded-[20px] bg-chip-amber-bg p-4 text-chip-amber-ink">
      <VitaIcon name="alert-triangle" size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-bold">{titulo}</div>
        <ul className="mt-1 flex flex-col gap-0.5 text-[13px]">
          {items.map((i) => (
            <li key={i.id} className="truncate">
              <span className="font-semibold">{i.nombre}</span> — {textoQuedan(i.stock).toLowerCase()}
            </li>
          ))}
        </ul>
        {href && <div className="mt-1.5 text-[12.5px] font-semibold">Ver mis pastillas →</div>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{contenido}</Link> : contenido;
}
