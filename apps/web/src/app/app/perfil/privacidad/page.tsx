import { requireUser } from "@/lib/dal";
import { TopBar } from "../../top-bar";
import { EliminarCuenta } from "../eliminar-cuenta";
import { FilaNav, Grupo, Tile } from "../filas";

// Privacidad y datos (V7): qué guarda vita + todo lo que el usuario puede
// hacer con sus datos (exportar, compartir, leer las políticas, borrar).
export default async function PrivacidadPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Cuenta" title="Privacidad y datos" />

      <p className="px-0.5 text-[13px] font-medium leading-[1.5] text-subtle">
        Tus datos son tuyos. No los vendemos ni los compartimos con nadie que vos no elijas.
      </p>

      <Grupo titulo="Qué guarda vita">
        <DatoGuardado icon="pill" label="Medicamentos y tomas" sub="Qué tomás, a qué hora y si lo confirmaste" />
        <DatoGuardado icon="stethoscope" label="Turnos" sub="Fecha, profesional y lugar" />
        <DatoGuardado icon="vial" label="Estudios" sub="Los archivos que subís y su resumen" />
        <DatoGuardado icon="heart" label="Perfil de salud" sub="Condiciones, alergias, medidas y cobertura" />
      </Grupo>

      <Grupo titulo="Tus datos">
        <FilaNav icon="doc" label="Exportar mi historial" sub="PDF o JSON con todos tus datos" href="/app/perfil/historial" />
        <FilaNav
          icon="upload"
          label="Compartir con profesional"
          sub="Link temporal para tu médico"
          href="/app/perfil/compartir"
        />
      </Grupo>

      <Grupo titulo="Legal">
        <FilaNav icon="lock" label="Política de privacidad" sub="Qué usa vita de tu información" href="/legal/privacidad" />
        <FilaNav icon="doc" label="Términos y condiciones" sub="Las reglas de uso de vita" href="/legal/terminos" />
      </Grupo>

      <Grupo titulo="Zona de cuidado">
        <EliminarCuenta />
      </Grupo>
    </div>
  );
}

function DatoGuardado({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <Tile icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{label}</div>
        <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{sub}</div>
      </div>
    </div>
  );
}
