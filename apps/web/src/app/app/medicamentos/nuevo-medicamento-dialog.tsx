"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { crearMedicamento, type EstadoAccion } from "./actions";
import { DIAS_SEMANA, type DiaSemana, type MomentoDia } from "@/lib/medicamentos/tipos";
import { Plus } from "lucide-react";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const ETIQUETA_DIA: Record<DiaSemana, string> = {
  lunes: "Lu",
  martes: "Ma",
  miercoles: "Mi",
  jueves: "Ju",
  viernes: "Vi",
  sabado: "Sa",
  domingo: "Do",
};

function FormularioNuevoMedicamento({ onCreado }: { onCreado: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [dosis, setDosis] = useState("");
  const [horaProgramada, setHoraProgramada] = useState("08:00");
  const [momentoDia, setMomentoDia] = useState<MomentoDia>("mañana");
  const [condicion, setCondicion] = useState("");
  const [dias, setDias] = useState<DiaSemana[]>([]);

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearMedicamento(prev, formData);
    if (resultado.status === "success") {
      router.refresh();
      onCreado();
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  function alternarDia(dia: DiaSemana) {
    setDias((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ibuprofeno"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dosis">Dosis</Label>
          <Input
            id="dosis"
            name="dosis"
            value={dosis}
            onChange={(e) => setDosis(e.target.value)}
            placeholder="400mg"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="horaProgramada">Hora</Label>
          <Input
            id="horaProgramada"
            name="horaProgramada"
            type="time"
            value={horaProgramada}
            onChange={(e) => setHoraProgramada(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="momentoDia">Momento del día</Label>
        <select
          id="momentoDia"
          name="momentoDia"
          value={momentoDia}
          onChange={(e) => setMomentoDia(e.target.value as MomentoDia)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="mañana">Mañana</option>
          <option value="mediodia">Mediodía</option>
          <option value="noche">Noche</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="condicion">Condición (opcional)</Label>
        <Input
          id="condicion"
          name="condicion"
          value={condicion}
          onChange={(e) => setCondicion(e.target.value)}
          placeholder="Ej. presión arterial"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Días (vacío = todos los días)</Label>
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((dia) => (
            <button
              key={dia}
              type="button"
              onClick={() => alternarDia(dia)}
              className={
                "h-7 rounded-md border px-2 text-xs transition-colors " +
                (dias.includes(dia)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {ETIQUETA_DIA[dia]}
            </button>
          ))}
          {dias.map((dia) => (
            <input key={dia} type="hidden" name="diasRecurrentes" value={dia} />
          ))}
        </div>
      </div>

      {estado.status === "error" && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Agregar medicamento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NuevoMedicamentoDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Nuevo medicamento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo medicamento</DialogTitle>
        </DialogHeader>
        {/* Montado solo con el diálogo abierto: cada apertura arranca con
            estado limpio (useActionState no queda pegado en "success" de
            la vez anterior), mismo criterio que TurnoFormDialog en NutrIA. */}
        {open && <FormularioNuevoMedicamento onCreado={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
