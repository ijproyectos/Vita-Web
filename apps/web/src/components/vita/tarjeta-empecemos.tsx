import Link from "next/link";

// "Empecemos" (V7, primera vez): reemplaza el resto de Home mientras el perfil
// no tiene ni remedios ni turnos cargados. Quien solo mira (rol "ver") no ve
// los botones de alta.
export function TarjetaEmpecemos({
  titulo,
  puedeEditar,
}: {
  titulo: string;
  puedeEditar: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[24px] bg-card px-[18px] pb-[18px] pt-[22px] shadow-card">
      <div>
        <div className="eyebrow text-primary">Empecemos</div>
        <div className="mt-1.5 text-balance font-heading text-[22px] font-extrabold leading-[1.2] tracking-[-0.03em]">{titulo}</div>
        <div className="mt-1.5 text-pretty text-[13px] font-medium leading-[1.45] text-slate-brand">
          {puedeEditar ? "Con eso armo la rutina y aviso a cada hora." : "Todavía no hay nada cargado."}
        </div>
      </div>
      {puedeEditar && (
        <>
          <Link
            href="/app/agregar-medicamento"
            className="rounded-full bg-primary py-3.5 text-center text-[14.5px] font-extrabold text-primary-foreground shadow-cta"
          >
            Agregar un remedio
          </Link>
          <Link
            href="/app/agregar-turno"
            className="rounded-full border border-teal-line bg-card py-[13px] text-center text-sm font-bold text-teal-deep"
          >
            Agregar un turno
          </Link>
        </>
      )}
    </div>
  );
}
