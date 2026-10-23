"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { TAMANIO_MAXIMO_BYTES, TIPO_PDF, type DatosExtraidos } from "@/lib/estudios/tipos";
import { analizarEstudioAction, descartarArchivoEstudioAction, guardarEstudioAction } from "../estudio-actions";

const CLASE_CAMPO =
  "w-full rounded-full border border-foreground/10 bg-card px-[18px] py-[13px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40";

// Lo que ya se subió y se leyó, esperando que el usuario lo revise.
type Subido = { path: string; tipo: string; datos: DatosExtraidos | null };

// Dos entradas distintas a propósito: `capture="environment"` abre la cámara
// trasera directo en mobile; el otro input deja elegir una foto de la galería
// o un PDF. Ninguno tiene `name`: el archivo elegido vive en estado y se
// agrega al FormData en la acción (así un solo input "gana", no dos).
export function FormularioAgregarEstudio({ lugarDisponible }: { lugarDisponible: boolean }) {
  const router = useRouter();
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (f && f.size > TAMANIO_MAXIMO_BYTES) {
      setErrorLocal("El archivo pesa más de 10 MB. Probá con una foto más liviana o un PDF más chico.");
      return;
    }
    setErrorLocal(null);
    setArchivo(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f && f.type !== TIPO_PDF ? URL.createObjectURL(f) : null;
    });
  }

  const [subido, setSubido] = useState<Subido | null>(null);
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [lugar, setLugar] = useState("");
  const [analizando, startAnalisis] = useTransition();
  const [guardando, startGuardado] = useTransition();
  const pendiente = analizando || guardando;

  // Paso 1: sube y lee el archivo; el estudio todavía no existe.
  function analizar() {
    if (!archivo) return;
    setErrorLocal(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    startAnalisis(async () => {
      try {
        const r = await analizarEstudioAction(formData);
        if (r.status === "error") {
          setErrorLocal(r.message);
          return;
        }
        setSubido({ path: r.path, tipo: r.tipo, datos: r.datos });
        setNombre(r.datos?.tipo ?? "");
        setFecha(r.datos?.fecha ?? "");
        setLugar("");
      } catch {
        setErrorLocal("No pudimos subir el archivo. Probá de nuevo.");
      }
    });
  }

  // Paso 2: guarda con lo que el usuario confirmó.
  function guardar() {
    if (!subido) return;
    setErrorLocal(null);
    startGuardado(async () => {
      try {
        const r = await guardarEstudioAction({ path: subido.path, tipo: subido.tipo, nombre, fecha, lugar, extraccion: subido.datos });
        if (r.status === "error") {
          setErrorLocal(r.message);
          return;
        }
        toast.success("Estudio agregado");
        router.push("/app/mi-salud");
      } catch {
        setErrorLocal("No pudimos guardar el estudio. Probá de nuevo.");
      }
    });
  }

  function cambiarArchivo() {
    if (subido) void descartarArchivoEstudioAction(subido.path);
    setSubido(null);
    setArchivo(null);
    setErrorLocal(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  const esPdf = archivo?.type === TIPO_PDF;

  return (
    <div className="flex flex-col gap-5">
      {!archivo ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => camaraRef.current?.click()}
            disabled={pendiente}
            className="flex items-center gap-3.5 rounded-[20px] bg-card p-4 text-left shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
          >
            <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[15px] bg-chip-teal-bg text-chip-teal-ink">
              <VitaIcon name="camera" size={22} />
            </div>
            <div className="flex-1">
              <div className="font-heading text-[15px] font-extrabold tracking-[-0.25px]">Sacar foto</div>
              <div className="mt-0.5 text-xs font-medium text-subtle">Del papel que te dio el laboratorio</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={pendiente}
            className="flex items-center gap-3.5 rounded-[20px] bg-card p-4 text-left shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
          >
            <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[15px] bg-chip-amber-bg text-chip-amber-ink">
              <VitaIcon name="doc" size={22} />
            </div>
            <div className="flex-1">
              <div className="font-heading text-[15px] font-extrabold tracking-[-0.25px]">Subir PDF</div>
              <div className="mt-0.5 text-xs font-medium text-subtle">Un archivo guardado en el celular</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-3 rounded-[18px] bg-card px-3.5 py-3 shadow-item">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview local de un blob: URL, no un asset de Next
              <img src={previewUrl} alt="" className="h-12 w-10 shrink-0 rounded-lg border border-foreground/[0.07] object-cover" />
            ) : (
              <div className="flex h-12 w-10 shrink-0 items-end justify-center rounded-lg border border-foreground/[0.07] bg-canvas pb-1.5 text-[9px] font-extrabold tracking-[0.08em] text-slate-brand">
                {esPdf ? "PDF" : "FOTO"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{archivo.name}</div>
              <div className="mt-px text-[11.5px] font-medium text-subtle">{subido ? "Listo para guardar" : "Listo para analizar"}</div>
            </div>
            <button
              type="button"
              onClick={cambiarArchivo}
              disabled={pendiente}
              className="px-2 py-1.5 text-[12.5px] font-bold text-teal-deep"
            >
              Cambiar
            </button>
          </div>
          {subido ? (
            <>
              <p className="-mb-1.5 px-0.5 text-[12.5px] font-medium leading-[1.45] text-slate-brand">
                {subido.datos ? "Lo completé con lo que leí. Revisalo antes de guardar." : "No pude leer el archivo, pero quedó guardado. Completá los datos a mano."}
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="pl-1 text-[12.5px] font-semibold text-slate-brand">Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Análisis de sangre" className={CLASE_CAMPO} />
              </label>
              <div className={lugarDisponible ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5" : ""}>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="pl-1 text-[12.5px] font-semibold text-slate-brand">Fecha</span>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CLASE_CAMPO} />
                </label>
                {lugarDisponible && (
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="pl-1 text-[12.5px] font-semibold text-slate-brand">Lugar</span>
                    <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="ej. Lab Hidalgo" className={CLASE_CAMPO} />
                  </label>
                )}
              </div>
            </>
          ) : (
            <p className="px-0.5 text-[12.5px] font-medium leading-[1.45] text-slate-brand">
              vita lee el archivo y completa nombre, fecha y valores. Antes de guardar lo revisás vos.
            </p>
          )}
        </div>
      )}
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={elegirArchivo}
        className="hidden"
      />
      <input
        ref={archivoRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={elegirArchivo}
        className="hidden"
      />

      {errorLocal && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-center text-sm text-destructive">{errorLocal}</p>
      )}

      {archivo && (
        <button
          type="button"
          onClick={subido ? guardar : analizar}
          disabled={pendiente}
          className="rounded-full bg-primary p-4 font-heading text-[14.5px] font-extrabold tracking-[-0.2px] text-primary-foreground shadow-cta transition-transform active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
        >
          {analizando ? "Analizando…" : guardando ? "Guardando…" : subido ? "Guardar estudio" : "Analizar estudio"}
        </button>
      )}
    </div>
  );
}
