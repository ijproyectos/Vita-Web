import { requireUser } from "@/lib/dal";
import { TopBar } from "@/app/app/top-bar";
import { FormularioReporte } from "./formulario";

export default async function ReportarPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Ayuda y soporte" title="Reportar un problema" />
      <FormularioReporte />
    </div>
  );
}
