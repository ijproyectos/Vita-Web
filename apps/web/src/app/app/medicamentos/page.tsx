import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NuevoMedicamentoDialog } from "./nuevo-medicamento-dialog";
import { ToggleTomadoButton } from "./toggle-tomado-button";
import { MarcarTodosButton } from "./marcar-todos-button";
import { EliminarMedicamentoButton } from "./eliminar-medicamento-button";

const ETIQUETA_MOMENTO = { mañana: "Mañana", mediodia: "Mediodía", noche: "Noche" };

export default async function MedicamentosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [hoy, todos, adherencia] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    medicamentos.listarTodos(supabase, usuario.id),
    medicamentos.calcularAdherencia(supabase, usuario.id),
  ]);

  const pendientesHoy = hoy.filter((m) => !m.tomado).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Medicamentos</h1>
          <p className="text-sm text-muted-foreground">
            {todos.length === 0
              ? "Todavía no cargaste ningún medicamento."
              : `${adherencia.porcentaje}% de adherencia últimos 7 días · racha de ${adherencia.rachaDias} ${adherencia.rachaDias === 1 ? "día" : "días"}`}
          </p>
        </div>
        <NuevoMedicamentoDialog />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Hoy</h2>
          {hoy.length > 0 && <MarcarTodosButton disabled={pendientesHoy === 0} />}
        </div>

        {hoy.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No tenés medicamentos programados para hoy.
          </Card>
        ) : (
          <Card className="divide-y p-0">
            {hoy.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{m.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.hora_programada} · {ETIQUETA_MOMENTO[m.momento_dia]}
                    {m.dosis ? ` · ${m.dosis}` : ""}
                  </span>
                </div>
                <ToggleTomadoButton medicamentoId={m.id} tomadoInicial={m.tomado} />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Todos los medicamentos</h2>
        {todos.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Agregá tu primer medicamento con el botón de arriba.
          </Card>
        ) : (
          <Card className="divide-y p-0">
            {todos.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{m.nombre}</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {m.hora_programada} · {ETIQUETA_MOMENTO[m.momento_dia]}
                    </span>
                    {m.condicion && <Badge variant="secondary">{m.condicion}</Badge>}
                    {m.dias_recurrentes.length > 0 && (
                      <Badge variant="secondary">{m.dias_recurrentes.join(", ")}</Badge>
                    )}
                  </div>
                </div>
                <EliminarMedicamentoButton medicamentoId={m.id} nombre={m.nombre} />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
