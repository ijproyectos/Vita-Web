"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { GENEROS, GRUPOS_SANGUINEOS, OTRA_PREPAGA, PREPAGAS_ARGENTINA } from "@/lib/perfil/opciones";
import type { Perfil } from "@/lib/perfil/tipos";
import { guardarPerfilAction, type DatosEditarPerfil } from "./actions";

const CLASE_CAMPO =
  "h-[52px] w-full rounded-full bg-card px-[18px] text-[14.5px] font-semibold shadow-item outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const aTexto = (n: number | null | undefined, decimales = 1) =>
  n == null ? "" : String(Number(n.toFixed(decimales))).replace(".", ",");

export function FormularioEditarPerfil({
  perfil,
  conColumnasNuevas,
  soloLectura,
}: {
  perfil: Perfil;
  /** false mientras la migración 025 no esté aplicada: sin apellido ni teléfono. */
  conColumnasNuevas: boolean;
  soloLectura: boolean;
}) {
  const router = useRouter();
  const conocida = !!perfil.obra_social && (PREPAGAS_ARGENTINA as readonly string[]).includes(perfil.obra_social);
  const [nombre, setNombre] = useState(perfil.nombre ?? "");
  const [apellido, setApellido] = useState(perfil.apellido ?? "");
  const [telefono, setTelefono] = useState(perfil.telefono ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(perfil.fecha_nacimiento ?? "");
  const [genero, setGenero] = useState(perfil.genero ?? "");
  const [peso, setPeso] = useState(aTexto(perfil.peso_kg));
  const [altura, setAltura] = useState(perfil.altura_cm ? aTexto(perfil.altura_cm / 100, 2) : "");
  const [grupo, setGrupo] = useState(perfil.grupo_sanguineo ?? "");
  const [obra, setObra] = useState(conocida ? perfil.obra_social! : perfil.obra_social ? OTRA_PREPAGA : "");
  const [obraOtra, setObraOtra] = useState(conocida ? "" : (perfil.obra_social ?? ""));
  const [afiliado, setAfiliado] = useState(perfil.numero_afiliado ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos: DatosEditarPerfil = {
      nombre,
      fechaNacimiento,
      genero,
      peso,
      altura,
      grupoSanguineo: grupo,
      obraSocial: obra === OTRA_PREPAGA ? obraOtra : obra,
      numeroAfiliado: afiliado,
      ...(conColumnasNuevas ? { apellido, telefono } : {}),
    };
    startTransition(async () => {
      const r = await guardarPerfilAction(datos);
      if (r.ok) {
        toast.success("Perfil actualizado");
        router.push("/app/perfil");
      } else setError(r.message);
    });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-6">
      <fieldset disabled={soloLectura} className="flex flex-col gap-6">
        <div className="flex flex-col gap-3.5">
          <div className={conColumnasNuevas ? "grid grid-cols-2 gap-2.5" : ""}>
            <Campo label="Nombre">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={CLASE_CAMPO} />
            </Campo>
            {conColumnasNuevas && (
              <Campo label="Apellido">
                <input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" className={CLASE_CAMPO} />
              </Campo>
            )}
          </div>
          {conColumnasNuevas && (
            <Campo label="Teléfono">
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+54 11 0000-0000"
                inputMode="tel"
                className={CLASE_CAMPO}
              />
            </Campo>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Campo label="Nacimiento">
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={CLASE_CAMPO} />
            </Campo>
            <Campo label="Género">
              <Selector value={genero} onChange={setGenero} opciones={GENEROS} placeholder="Elegir…" legado={perfil.genero} />
            </Campo>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Campo label="Peso">
              <div className="flex items-center rounded-full bg-card pr-[18px] shadow-item focus-within:ring-2 focus-within:ring-ring/50">
                <input
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="h-[52px] min-w-0 flex-1 bg-transparent pl-[18px] text-[14.5px] font-semibold tabular-nums outline-none"
                />
                <span className="text-[12.5px] font-bold text-subtle">kg</span>
              </div>
            </Campo>
            <Campo label="Altura">
              <div className="flex items-center rounded-full bg-card pr-[18px] shadow-item focus-within:ring-2 focus-within:ring-ring/50">
                <input
                  value={altura}
                  onChange={(e) => setAltura(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="h-[52px] min-w-0 flex-1 bg-transparent pl-[18px] text-[14.5px] font-semibold tabular-nums outline-none"
                />
                <span className="text-[12.5px] font-bold text-subtle">m</span>
              </div>
            </Campo>
          </div>
          <Campo label="Grupo sanguíneo">
            <Selector value={grupo} onChange={setGrupo} opciones={GRUPOS_SANGUINEOS} placeholder="Elegir…" legado={perfil.grupo_sanguineo} />
          </Campo>
        </div>

        <div className="flex flex-col gap-3.5">
          <Campo label="Obra social o prepaga">
            <Selector
              value={obra}
              onChange={setObra}
              opciones={PREPAGAS_ARGENTINA}
              placeholder="Elegir…"
              otra={{ value: OTRA_PREPAGA, label: "Otra" }}
            />
          </Campo>
          {obra === OTRA_PREPAGA && (
            <Campo label="¿Cuál?">
              <input value={obraOtra} onChange={(e) => setObraOtra(e.target.value)} placeholder="Nombre de tu obra social o prepaga" className={CLASE_CAMPO} />
            </Campo>
          )}
          <Campo label="Nº de afiliado">
            <input value={afiliado} onChange={(e) => setAfiliado(e.target.value)} placeholder="Opcional" inputMode="numeric" className={CLASE_CAMPO} />
          </Campo>
        </div>

        {error && <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-foreground/10 px-[22px] py-4 text-sm font-bold text-slate-brand"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-4 font-heading text-[14.5px] font-extrabold tracking-[-0.01em] text-primary-foreground shadow-cta disabled:opacity-60"
          >
            {!pendiente && <VitaIcon name="check" size={16} strokeWidth={2.6} />}
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-[7px]">
      <span className="eyebrow pl-1 text-subtle">{label}</span>
      {children}
    </label>
  );
}

function Selector({
  value,
  onChange,
  opciones,
  placeholder,
  legado,
  otra,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: readonly string[];
  placeholder: string;
  // Dato viejo de texto libre que no está en la lista: se muestra igual para
  // no perderlo al abrir el form.
  legado?: string | null;
  otra?: { value: string; label: string };
}) {
  const todas = legado && !opciones.includes(legado) ? [legado, ...opciones] : opciones;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${CLASE_CAMPO} cursor-pointer appearance-none pr-11`}
      >
        <option value="">{placeholder}</option>
        {todas.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {otra && <option value={otra.value}>{otra.label}</option>}
      </select>
      <VitaIcon name="chevron-down" size={14} strokeWidth={2.6} className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-subtle" />
    </div>
  );
}
