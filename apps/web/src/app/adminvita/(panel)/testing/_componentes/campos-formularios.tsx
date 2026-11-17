import {
  actualizarBugAction,
  actualizarReporteAction,
  asignarCasosAction,
  comentarBugAction,
  crearBugAction,
  crearReporteAction,
  crearRondaAction,
  registrarPruebaAction,
} from "../actions";
import { AREAS, CANALES, ESTADOS_BUG, ESTADOS_PRUEBA, ESTADOS_REPORTE, SEVERIDADES, transicionesBug, type Bug, type Reporte } from "@/lib/admin/testing/logica";
import type { Persona } from "@/lib/admin/testing/datos";
import { CAMPO, Campo, Seleccion, SeleccionPersona } from "./comunes";
import { FormularioAccion } from "./formularios";

// Formularios del módulo Testing. Son Server Components que arman los campos y delegan el envío en `FormularioAccion` (cliente).

export function FormularioPrueba({ casoId, asignacionId, dispositivo = "" }: { casoId: number; asignacionId?: number; dispositivo?: string }) {
  return (
    <FormularioAccion accion={registrarPruebaAction} boton="Registrar prueba" limpiar className="gap-2">
      <input type="hidden" name="casoId" value={casoId} />
      {asignacionId !== undefined ? <input type="hidden" name="asignacionId" value={asignacionId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Resultado">
          <select name="estado" defaultValue="OK" className={CAMPO}>
            {ESTADOS_PRUEBA.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Dispositivo">
          <input name="dispositivo" defaultValue={dispositivo} maxLength={200} placeholder="iPhone 15 / Pixel 8 / Chrome" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Qué pasó (obligatorio si falla)" ancho>
          <textarea name="resultado" rows={2} maxLength={4000} className={CAMPO} />
        </Campo>
      </div>
    </FormularioAccion>
  );
}

export function FormularioBug({ personas, bug, casoId, reporteId, preset }: { personas: Persona[]; bug?: Bug; casoId?: number | null; reporteId?: number; preset?: Partial<Bug> }) {
  const b = { ...preset, ...bug };
  const editando = Boolean(bug);
  const estados = bug ? [bug.estado, ...transicionesBug(bug.estado)] : ESTADOS_BUG;
  return (
    <FormularioAccion accion={editando ? actualizarBugAction : crearBugAction} boton={editando ? "Guardar cambios" : "Crear bug"} irA={editando ? undefined : "/adminvita/testing/bugs/"} className="rounded-[28px] bg-card p-5 shadow-panel">
      {bug ? <input type="hidden" name="id" value={bug.id} /> : null}
      {reporteId !== undefined ? <input type="hidden" name="reporteId" value={reporteId} /> : null}
      <input type="hidden" name="caso_id" value={bug ? (bug.caso_id ?? "") : (casoId ?? "")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Título" ancho>
          <input name="titulo" required maxLength={250} defaultValue={b.titulo ?? ""} className={CAMPO} />
        </Campo>
        {editando ? (
          <Campo etiqueta="Estado">
            <Seleccion nombre="estado" valores={estados} actual={bug?.estado} />
          </Campo>
        ) : (
          <input type="hidden" name="estado" value="Abierto" />
        )}
        <Campo etiqueta="Severidad">
          <Seleccion nombre="severidad" valores={SEVERIDADES} actual={b.severidad ?? "Media"} />
        </Campo>
        <Campo etiqueta="Quién lo arregla">
          <SeleccionPersona nombre="responsable_email" personas={personas} actual={b.responsable_email} vacio="Sin asignar" />
        </Campo>
        <Campo etiqueta="Se lo contaron a">
          <SeleccionPersona nombre="recibido_por_email" personas={personas} actual={b.recibido_por_email} vacio="Nadie en particular" />
        </Campo>
        <Campo etiqueta="Reportado por (quien lo encontró)">
          <input name="reportado_por" maxLength={200} defaultValue={b.reportado_por ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Dispositivo">
          <input name="dispositivo" maxLength={200} defaultValue={b.dispositivo ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Pasos para reproducir" ancho>
          <textarea name="pasos" rows={3} maxLength={4000} defaultValue={b.pasos ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Qué pasó">
          <textarea name="actual" rows={3} maxLength={4000} defaultValue={b.actual ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Qué debería pasar">
          <textarea name="esperado" rows={3} maxLength={4000} defaultValue={b.esperado ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Link a captura o video (opcional)">
          <input name="enlace" type="url" maxLength={500} defaultValue={b.enlace ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Ticket externo (clave, p. ej. VIT-23)">
          <input name="ticket_externo" maxLength={60} defaultValue={b.ticket_externo ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Notas" ancho>
          <textarea name="notas" rows={2} maxLength={4000} defaultValue={b.notas ?? ""} className={CAMPO} />
        </Campo>
      </div>
    </FormularioAccion>
  );
}

export function FormularioComentario({ bugId }: { bugId: number }) {
  return (
    <FormularioAccion accion={comentarBugAction} boton="Comentar" limpiar className="gap-2">
      <input type="hidden" name="id" value={bugId} />
      <textarea name="cuerpo" rows={2} required maxLength={2000} placeholder="Cómo se va a manejar, qué se probó…" aria-label="Comentario" className={CAMPO} />
    </FormularioAccion>
  );
}

export function FormularioRonda() {
  return (
    <FormularioAccion accion={crearRondaAction} boton="Crear ronda" irA="/adminvita/testing/rondas/" className="rounded-[28px] bg-card p-5 shadow-panel">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Nombre">
          <input name="nombre" required maxLength={120} placeholder="Ronda v1.14" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Versión de la app">
          <input name="version_app" maxLength={40} placeholder="1.14.0" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Desde">
          <input name="desde" type="date" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Hasta (opcional)">
          <input name="hasta" type="date" className={CAMPO} />
        </Campo>
        <Campo etiqueta="Notas" ancho>
          <input name="notas" maxLength={2000} className={CAMPO} />
        </Campo>
      </div>
    </FormularioAccion>
  );
}

export function FormularioAsignar({ rondaId, personas }: { rondaId: number; personas: Persona[] }) {
  return (
    <FormularioAccion accion={asignarCasosAction} boton="Asignar casos" className="rounded-[28px] bg-card p-5 shadow-panel">
      <input type="hidden" name="rondaId" value={rondaId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Área">
          <select name="area" defaultValue="" className={CAMPO}>
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Quién prueba">
          <SeleccionPersona nombre="email" personas={personas} vacio="Sin asignar" />
        </Campo>
        <Campo etiqueta="Dispositivo (opcional)">
          <input name="dispositivo" maxLength={120} placeholder="iPhone / Android" className={CAMPO} />
        </Campo>
      </div>
    </FormularioAccion>
  );
}

export function FormularioReporte({ reporte }: { reporte?: Reporte }) {
  const editando = Boolean(reporte);
  return (
    <FormularioAccion accion={editando ? actualizarReporteAction : crearReporteAction} boton={editando ? "Guardar cambios" : "Cargar reporte"} limpiar={!editando} irA={editando ? undefined : "/adminvita/testing/reportes/"} className="rounded-[28px] bg-card p-5 shadow-panel">
      {reporte ? <input type="hidden" name="id" value={reporte.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo etiqueta="Quién reporta">
          <input name="reportante" maxLength={200} defaultValue={reporte?.reportante ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Canal">
          <Seleccion nombre="canal" valores={CANALES} actual={reporte?.canal} />
        </Campo>
        <Campo etiqueta="Fecha">
          <input name="fecha" type="date" defaultValue={reporte?.fecha ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Área">
          <Seleccion nombre="area" valores={AREAS} actual={reporte?.area ?? "General"} />
        </Campo>
        <Campo etiqueta="Severidad">
          <Seleccion nombre="severidad" valores={SEVERIDADES} actual={reporte?.severidad ?? "Media"} />
        </Campo>
        {editando ? (
          <Campo etiqueta="Estado">
            <Seleccion nombre="estado" valores={ESTADOS_REPORTE} actual={reporte?.estado} />
          </Campo>
        ) : (
          <input type="hidden" name="estado" value="Nuevo" />
        )}
        <Campo etiqueta="Qué estaba haciendo" ancho>
          <textarea name="haciendo" rows={2} maxLength={2000} defaultValue={reporte?.haciendo ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Qué pasó">
          <textarea name="paso" rows={2} required maxLength={4000} defaultValue={reporte?.paso ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Dispositivo">
          <input name="dispositivo" maxLength={200} defaultValue={reporte?.dispositivo ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Versión de la app">
          <input name="version_app" maxLength={40} defaultValue={reporte?.version_app ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Link (opcional)">
          <input name="enlace" type="url" maxLength={500} defaultValue={reporte?.enlace ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Qué se le respondió">
          <input name="respuesta" maxLength={2000} defaultValue={reporte?.respuesta ?? ""} className={CAMPO} />
        </Campo>
        <Campo etiqueta="Notas">
          <input name="notas" maxLength={2000} defaultValue={reporte?.notas ?? ""} className={CAMPO} />
        </Campo>
      </div>
    </FormularioAccion>
  );
}
