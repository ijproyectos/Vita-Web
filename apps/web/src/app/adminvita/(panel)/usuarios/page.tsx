import Link from "next/link";
import { entrarAlPanel, FILTROS_USUARIOS, obtenerInteracciones, obtenerUsuarios, TAMANO_PAGINA, type FiltroUsuarios } from "@/lib/admin/datos";
import { ETIQUETA_TIPO_CUENTA, formatoNumero, formatoFechaAR, formatoUSD, resumenVitaPlus } from "@/lib/admin/formato";
import { ETIQUETA_MOTIVO } from "@/lib/suspensiones/logica";
import { Avatar, Encabezado, PillFiltro, ChipInactividad, ErrorDatos, Etiqueta, TD, TH, Tabla, Vacio } from "../_componentes/ui";

export const dynamic = "force-dynamic";

const ETIQUETA_FILTRO: Record<FiltroUsuarios, string> = {
  todos: "Todos",
  vita_plus: "vita+",
  vp_pago: "vita+ · Pago",
  vp_codigo_plus: "vita+ · Código plus",
  vp_codigo_admin: "vita+ · Código admin",
  inactivos_7: "Inactivos 7 días",
  inactivos_30: "Inactivos 30 días",
  gestionados: "Gestionados",
  sin_onboarding: "Sin onboarding",
  suspendidos: "Suspendidos",
};

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function href(filtro: string, q: string, pagina: number): string {
  const p = new URLSearchParams();
  if (filtro !== "todos") p.set("filtro", filtro);
  if (q) p.set("q", q);
  if (pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return s ? `/adminvita/usuarios?${s}` : "/adminvita/usuarios";
}

export default async function UsuariosPage({ searchParams }: PageProps<"/adminvita/usuarios">) {
  await entrarAlPanel("/adminvita/usuarios");
  const sp = await searchParams;
  const q = primero(sp.q).trim().slice(0, 100);
  const filtroCrudo = primero(sp.filtro);
  const filtro = (FILTROS_USUARIOS as readonly string[]).includes(filtroCrudo) ? (filtroCrudo as FiltroUsuarios) : "todos";
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(primero(sp.pagina), 10) || 1));

  const datos = await obtenerUsuarios({ busqueda: q, filtro, pagina });
  if (!datos) return <ErrorDatos />;
  const paginas = Math.max(1, Math.ceil(datos.total / TAMANO_PAGINA));
  // Consultas de hoy de las cuentas de esta página; si no se pueden leer, la columna muestra un guion.
  const interacciones = await obtenerInteracciones(datos.filas.map((u) => u.id));

  return (
    <>
      <Encabezado titulo="Usuarios" />

      <form action="/adminvita/usuarios" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por email, nombre o id"
          className="min-w-0 flex-1 rounded-full bg-card px-5 py-3 text-sm shadow-panel placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-teal"
        />
        {filtro !== "todos" ? <input type="hidden" name="filtro" value={filtro} /> : null}
        <button type="submit" className="rounded-full bg-teal px-6 py-3 text-sm font-bold text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
          Buscar
        </button>
      </form>

      <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtros">
        {FILTROS_USUARIOS.map((f) => (
          <PillFiltro key={f} href={href(f, q, 1)} activo={f === filtro}>
            {ETIQUETA_FILTRO[f]}
          </PillFiltro>
        ))}
      </nav>

      <p className="mt-4 text-sm text-subtle">
        {formatoNumero(datos.total)} {datos.total === 1 ? "cuenta" : "cuentas"} · ordenadas por última actividad
      </p>

      <div className="mt-2">
        {datos.filas.length === 0 ? (
          <Vacio>No hay cuentas que coincidan.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Cuenta</th>
                <th className={TH}>Días sin usar</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Vínculos</th>
                <th className={TH}>Consultas hoy</th>
                <th className={TH}>IA 30 días</th>
                <th className={TH}>Alta</th>
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((u) => (
                <tr key={u.id}>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <Avatar nombre={u.nombre || u.email || "?"} />
                      <div className="min-w-0">
                        <Link href={`/adminvita/usuarios/${u.id}`} className="font-bold text-ink hover:underline">
                          {u.nombre || u.email || u.id.slice(0, 8)}
                        </Link>
                        <div className="max-w-[260px] truncate text-xs text-subtle">{u.email}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {u.suspendido ? (
                            <Etiqueta tono="alerta">Suspendida{u.suspensionMotivo ? ` · ${ETIQUETA_MOTIVO[u.suspensionMotivo]}` : ""}</Etiqueta>
                          ) : null}
                          {u.tipo !== "real" ? <Etiqueta>{ETIQUETA_TIPO_CUENTA[u.tipo] ?? u.tipo}</Etiqueta> : null}
                          {!u.onboarding && u.tipo !== "gestionado" ? <Etiqueta tono="aviso">Sin onboarding</Etiqueta> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>
                    <ChipInactividad dias={u.diasInactivo} />
                  </td>
                  <td className={TD}>
                    {u.vitaPlus ? <Etiqueta tono="ok">{resumenVitaPlus(u).etiqueta}</Etiqueta> : <span className="text-subtle">—</span>}
                    {u.vitaPlus && resumenVitaPlus(u).detalle ? <div className="text-xs text-subtle">{resumenVitaPlus(u).detalle}</div> : null}
                  </td>
                  <td className={TD}>
                    <span className="text-xs text-slate-brand">
                      cuida a {u.personasCuida} · {u.cuidadores} {u.cuidadores === 1 ? "cuidador" : "cuidadores"}
                    </span>
                  </td>
                  <td className={TD}>
                    {(() => {
                      const i = interacciones?.get(u.id);
                      if (!i) return <span className="text-subtle">—</span>;
                      return i.usadas >= i.limite ? (
                        <Etiqueta tono="alerta">
                          {i.usadas} de {i.limite} · límite
                        </Etiqueta>
                      ) : (
                        <span className="text-xs text-slate-brand">
                          {i.usadas} de {i.limite}
                        </span>
                      );
                    })()}
                  </td>
                  <td className={TD}>
                    {formatoUSD(u.costo30dUsd)}
                    <div className="text-xs text-subtle">{formatoNumero(u.tokens30d)} tokens</div>
                  </td>
                  <td className={TD}>{formatoFechaAR(u.creado)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </div>

      {paginas > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          {pagina > 1 ? (
            <Link href={href(filtro, q, pagina - 1)} className="font-bold text-teal-deep">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-subtle">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={href(filtro, q, pagina + 1)} className="font-bold text-teal-deep">
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </>
  );
}
