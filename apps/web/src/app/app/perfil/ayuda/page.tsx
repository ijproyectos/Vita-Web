import { requireUser } from "@/lib/dal";
import { TopBar } from "@/app/app/top-bar";
import { FilaNav, Grupo } from "../filas";

import { CORREO_SOPORTE } from "@/lib/legal/datos";

// Ayuda y soporte (V7): preguntas frecuentes (estáticas) y dos mails reales.
export default async function AyudaPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Cuenta" title="Ayuda y soporte" />

      <Grupo>
        <FilaNav icon="help" label="Preguntas frecuentes" sub="Remedios, avisos, familia y datos" href="/app/perfil/ayuda/faq" />
        <FilaNav
          icon="mail"
          label="Escribinos"
          sub={`${CORREO_SOPORTE} · respondemos en 24 h`}
          href={`mailto:${CORREO_SOPORTE}`}
          externo
        />
        <FilaNav
          icon="alert-triangle"
          label="Reportar un problema"
          sub="Contanos qué pasó y lo revisamos"
          href={`mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent("Reporte de un problema en vita")}&body=${encodeURIComponent("Contanos qué pasó:\n\n")}`}
          externo
        />
      </Grupo>

      <div className="text-center text-[11px] font-medium text-subtle">vita · versión 1.0</div>
    </div>
  );
}
