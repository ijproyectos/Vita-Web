import { requireUser } from "@/lib/dal";
import { rutaVolverAPerfil } from "@/lib/familia/solo-mirar";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { TEXTO_BUILD, TEXTO_VERSION } from "@/lib/version";
import { TopBar } from "@/app/app/top-bar";
import { FilaNav, Grupo } from "../filas";

import { CORREO_SOPORTE } from "@/lib/legal/datos";

// Ayuda y soporte (V7): preguntas frecuentes, un mail real y el formulario de reporte.
export default async function AyudaPage() {
  await requireUser();
  const activo = await obtenerPerfilActivo();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar volverA={rutaVolverAPerfil(activo)} eyebrow="Cuenta" title="Ayuda y soporte" />

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
          href="/app/perfil/ayuda/reportar"
        />
      </Grupo>

      <div className="text-center">
        <div className="text-[11px] font-medium text-subtle">vita · {TEXTO_VERSION}</div>
        <div className="text-[10px] font-medium text-faint">{TEXTO_BUILD}</div>
      </div>
    </div>
  );
}
