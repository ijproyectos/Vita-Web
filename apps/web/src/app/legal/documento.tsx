import { FECHA_ACTUALIZACION } from "@/lib/legal/datos";

// Piezas de maquetado compartidas por la Política de Privacidad y los
// Términos y Condiciones.
export function Documento({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[28px] font-extrabold leading-tight tracking-tight">{titulo}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">Última actualización: {FECHA_ACTUALIZACION}</p>
      </div>
      <div className="flex flex-col gap-6 rounded-[20px] bg-card p-5 shadow-card">{children}</div>
    </article>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 text-[14.5px] leading-relaxed">
      <h2 className="font-heading text-[18px] font-bold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

export function Lista({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 flex list-disc flex-col gap-1.5">{children}</ul>;
}
