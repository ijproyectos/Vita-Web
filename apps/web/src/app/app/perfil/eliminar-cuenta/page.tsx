import { requireUser } from "@/lib/dal";
import { obtenerOpcionesPerfil } from "@/lib/familia/perfil-activo";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../top-bar";
import { FormularioEliminar } from "./formulario";

// Eliminar mi cuenta (V7): pantalla completa. La baja real vive en
// lib/cuenta/nucleo.ts (se valida la sesión en la Server Action y recién ahí
// se usa el cliente admin).
export default async function EliminarCuentaPage() {
  await requireUser();
  const opciones = await obtenerOpcionesPerfil();
  const aCargo = opciones.filter((o) => !o.esPropio);

  const perdidas = [
    "Se borran tu perfil de salud, tus remedios y su historial de tomas, tus turnos, mediciones y estudios (con sus fotos).",
    "Se borran tus conversaciones con vita, lo que vita recuerda de vos y los vínculos con tus cuidadores.",
    "Dejan de llegarte los avisos de remedios y turnos.",
  ];

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil" eyebrow="Cuenta" title="Eliminar mi cuenta" />

      <p className="px-1 text-pretty text-sm font-medium leading-[1.5] text-slate-brand">Es para siempre. No se puede deshacer.</p>

      <div className="rounded-[20px] bg-card px-4 py-1 shadow-card">
        {perdidas.map((t, i) => (
          <div key={t} className={`flex gap-3 py-3 ${i < perdidas.length - 1 ? "border-b border-foreground/[0.06]" : ""}`}>
            <span className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <VitaIcon name="close" size={11} strokeWidth={3.2} />
            </span>
            <p className="text-pretty text-[13.5px] font-semibold leading-[1.45]">{t}</p>
          </div>
        ))}
      </div>

      {aCargo.length > 0 && (
        <div className="rounded-[20px] bg-card p-4 shadow-card">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
            {aCargo.length === 1 ? `El perfil de ${aCargo[0].nombre} no se borra` : "Los perfiles de las personas que cuidás no se borran"}
          </div>
          <p className="mt-[5px] text-pretty text-[13px] font-medium leading-[1.5] text-slate-brand">
            {aCargo.length === 1 ? "Su perfil" : "Sus perfiles"} y sus datos siguen existiendo, pero vas a dejar de verlos. Si nadie más
            {aCargo.length === 1 ? " la cuida" : " los cuida"}, queda{aCargo.length === 1 ? "" : "n"} sin acceso. Si querés, antes sumá a otra persona
            como cuidadora desde Familia.
          </p>
        </div>
      )}

      <FormularioEliminar />
    </div>
  );
}
