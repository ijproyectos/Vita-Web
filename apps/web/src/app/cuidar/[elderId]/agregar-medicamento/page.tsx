import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCuidador } from "@/lib/dal";
import { VitaIcon } from "@/lib/vita-icons";
import { FormularioAgregarMedicamentoElder } from "./formulario";

// Único formulario de escritura real dentro de /cuidar/* — ver
// lib/cuidadores/nucleo.ts y la policy `medicamentos_insert_cuidador`
// (migración 010). Mismo header inline con back-button que
// /cuidar/[elderId]/page.tsx (ese árbol no usa el TopBar compartido de
// /app/*).
export default async function AgregarMedicamentoElderPage(
  props: PageProps<"/cuidar/[elderId]/agregar-medicamento">
) {
  const { elderId } = await props.params;
  const { elders } = await requireCuidador();
  const elder = elders.find((e) => e.elderId === elderId);
  if (!elder) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/cuidar/${elderId}`}
          aria-label="Volver"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
        >
          <VitaIcon name="chevron-left" size={18} />
        </Link>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Modo cuidador</div>
          <div className="mt-0.5 font-heading text-[20px] font-extrabold tracking-tight">
            Agregar a {elder.nombre}
          </div>
        </div>
      </div>

      <FormularioAgregarMedicamentoElder elderId={elderId} />
    </div>
  );
}
