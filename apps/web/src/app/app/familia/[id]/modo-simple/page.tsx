import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { fechaLargaEnAR, saludoEnAR } from "@/lib/rutina/formato";
import { momentoDelDia } from "@/lib/rutina/momento";
import { obtenerPrefsConEstado } from "@/lib/modo-simple/nucleo";
import { medicionesParaMostrar, proximoGrupoPendiente, turnoParaMostrar } from "@/lib/modo-simple/datos";
import { TopBar } from "../../../top-bar";
import { ConfigurarModoSimple } from "./configurador";

// V7 "fam-simple" (Su modo simple): vista previa en vivo de cómo ve la persona
// su pantalla + los interruptores que la configuran (preferencias_modo_simple,
// migración 029). La vista previa usa datos REALES de la persona (sus remedios
// de hoy, su turno, sus mediciones). Solo se llega con un vínculo aceptado.
export default async function ModoSimpleDePersonaPage(props: PageProps<"/app/familia/[id]/modo-simple">) {
  const usuario = await requireUser();
  const { id } = await props.params;
  const supabase = await createClient();
  const familia = await familiaNucleo.listarFamilia(supabase);
  const indice = familia.findIndex((m) => m.id === id);
  if (indice < 0) notFound();
  const persona = familia[indice];
  const primerNombre = persona.nombre.split(" ")[0];

  const [{ prefs, disponible }, perfilPersona, yo, hoy, turno, mediciones] = await Promise.all([
    obtenerPrefsConEstado(supabase, id),
    perfilNucleo.obtenerPerfil(supabase, id).catch(() => null),
    perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null),
    medicamentos.listarHoy(supabase, id).catch(() => null),
    turnoParaMostrar(supabase, id),
    medicionesParaMostrar(supabase, id),
  ]);

  const { momento, enGrupo, resto, invalidas } = proximoGrupoPendiente(hoy ?? [], medicamentos.horaEnAR());
  const grupo = enGrupo.map((m) => ({ id: m.id, nombre: m.nombre, dosis: m.dosis, unidad: m.unidad, horaProgramada: m.hora_programada }));

  const contacto =
    perfilPersona?.contacto_emergencia_telefono?.trim()
      ? { nombre: perfilPersona.contacto_emergencia_nombre?.trim() || "Su contacto", telefono: perfilPersona.contacto_emergencia_telefono.trim() }
      : null;
  const miTelefono = yo?.telefono?.trim() || null;

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA={`/app/familia/${id}`} eyebrow={`Su celular · ${primerNombre}`} title="Modo simple" />
      <ConfigurarModoSimple
        personaId={id}
        nombre={primerNombre}
        puedeEditar={persona.rol === "editar"}
        disponible={disponible}
        inicial={prefs}
        contacto={contacto}
        yo={miTelefono ? { nombre: yo?.nombre?.trim().split(/\s+/)[0] || "Yo", telefono: miTelefono } : null}
        hayTurno={turno !== null}
        hayMediciones={mediciones !== null}
        previa={{
          saludo: saludoEnAR(),
          fechaTexto: fechaLargaEnAR(),
          grupo,
          momento,
          siguientes: resto.slice(0, 3).map((m) => ({
            id: m.id,
            nombre: m.nombre,
            horaProgramada: m.hora_programada,
            momento: momentoDelDia(m.hora_programada),
          })),
          porCorregir: invalidas.map((m) => ({ id: m.id, nombre: m.nombre })),
          hayMedsHoy: (hoy?.length ?? 0) > 0,
          errorMedicamentos: hoy === null,
          turno,
          mediciones,
        }}
      />
    </div>
  );
}
