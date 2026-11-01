import { requireAdmin } from "@/lib/admin/acceso";
import { listarAdministradores } from "@/lib/admin/administradores";
import { entrarAlPanel } from "@/lib/admin/datos";
import { formatoFechaAR } from "@/lib/admin/formato";
import { Encabezado, Etiqueta, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";
import { BotonQuitarAdministrador } from "./boton-quitar";
import { FormularioAgregarAdministrador } from "./formulario-agregar";

export const dynamic = "force-dynamic";

export default async function AdministradoresPage() {
  await entrarAlPanel("/adminvita/administradores");
  const admin = await requireAdmin();
  const lista = await listarAdministradores(admin);
  const esDueno = admin.rol === "dueno";

  return (
    <>
      <Encabezado titulo="Administradores" />
      <p className="-mt-2 mb-2 max-w-2xl px-1 text-sm text-slate-brand">
        Los <strong>dueños</strong> salen de la configuración del servidor (ADMIN_EMAILS): no se pueden quitar desde acá y son los
        únicos que agregan o quitan administradores. Los <strong>administradores</strong> usan el panel pero no gestionan accesos.
      </p>

      {esDueno ? (
        <Seccion titulo="Agregar un administrador">
          <FormularioAgregarAdministrador />
        </Seccion>
      ) : (
        <p className="rounded-[28px] bg-mint p-5 text-sm font-semibold text-teal-deep">
          Podés ver quién tiene acceso, pero solo los dueños pueden agregar o quitar administradores.
        </p>
      )}

      <Seccion titulo="Quién tiene acceso">
        {!lista.baseDisponible ? (
          <p className="mb-3 rounded-[28px] bg-destructive/10 p-5 text-sm font-semibold text-destructive">
            No se pudo leer la lista de administradores. Revisá que la migración 047 esté aplicada. Los dueños siguen entrando.
          </p>
        ) : null}
        {lista.duenos.length + lista.administradores.length === 0 ? (
          <Vacio>No hay nadie configurado.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Email</th>
                <th className={TH}>Rol</th>
                <th className={TH}>Agregado por</th>
                <th className={TH}>Desde</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {[...lista.duenos, ...lista.administradores].map((f) => (
                <tr key={f.email}>
                  <td className={TD}>
                    <span className="block max-w-[280px] truncate font-bold">{f.email}</span>
                  </td>
                  <td className={TD}>{f.rol === "dueno" ? <Etiqueta tono="ok">Dueño</Etiqueta> : <Etiqueta>Administrador</Etiqueta>}</td>
                  <td className={TD}>
                    <span className="block max-w-[200px] truncate text-xs">{f.agregadoPor ?? "—"}</span>
                  </td>
                  <td className={TD}>{f.desde ? formatoFechaAR(f.desde) : "—"}</td>
                  <td className={TD}>{f.rol === "admin" && esDueno ? <BotonQuitarAdministrador email={f.email} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </>
  );
}
