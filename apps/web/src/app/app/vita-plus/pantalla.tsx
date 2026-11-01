"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import {
  fechaLarga,
  formatoCotizacion,
  formatoUsd,
  PLANES_VITA_PLUS,
  textoPesosPorPeriodo,
  type CotizacionPlanes,
  type EstadoVitaPlus,
  type PlanVitaPlus,
} from "@/lib/vita-plus/planes";

const BENEFICIOS = [
  "Historia clínica de cada uno, también de tus hijos",
  "Resumen para llevar al médico",
  "Aviso de remedios por terminarse",
];

const PLANES = [PLANES_VITA_PLUS.anual, PLANES_VITA_PLUS.mensual];

// Lugares del diagrama (coordenadas del diseño, viewBox 353x300). Son lugares
// vacíos ilustrativos: no representan personas reales.
const LUGARES = [
  { nombre: "Mamá", x: 70, y: 70 },
  { nombre: "Papá", x: 286, y: 62 },
  { nombre: "Hija", x: 292, y: 236 },
  { nombre: "Hijo", x: 62, y: 238 },
];

const AVISO = "Todavía no está disponible. Por ahora no hay nada para contratar.";

const ERROR_GENERICO = "No pudimos completar el pedido. Probá de nuevo.";

async function pedirApi(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/vita-plus", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, datos };
  } catch {
    return { ok: false, datos: { error: ERROR_GENERICO } };
  }
}

function mensajeDe(datos: Record<string, unknown>): string {
  return typeof datos.error === "string" ? datos.error : ERROR_GENERICO;
}

export function PantallaVitaPlus({
  inicial,
  habilitado,
  estado: estadoInicial,
}: {
  inicial: string;
  /** false mientras no hay credenciales de Mercado Pago: el botón sigue en "Muy pronto". */
  habilitado: boolean;
  estado: EstadoVitaPlus;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanVitaPlus>("anual");
  const [estado, setEstado] = useState(estadoInicial);
  const [cotizacion, setCotizacion] = useState<CotizacionPlanes | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  // Confirmación previa al pago: la persona ve cuánto se cobra en pesos ANTES de ir a Mercado Pago.
  const [porPagar, setPorPagar] = useState<{ initPoint: string; pesos: number; fx: number; plan: PlanVitaPlus } | null>(null);
  const [confirmandoArrepentimiento, setConfirmandoArrepentimiento] = useState(false);
  const [arrepintiendo, setArrepintiendo] = useState(false);
  // Canje de un código promocional ("Tengo un código"): no depende de Mercado Pago.
  const [codigoAbierto, setCodigoAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [canjeando, setCanjeando] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);

  // La cotización se muestra para que se sepa cuántos pesos se cobran; al crear, el servidor vuelve a pedirla.
  useEffect(() => {
    if (!habilitado || estado.activo) return;
    let cancelado = false;
    void pedirApi({ action: "cotizar" }).then((r) => {
      if (cancelado || !r.ok) return;
      setCotizacion((r.datos.cotizacion as CotizacionPlanes | undefined) ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [habilitado, estado.activo]);

  // Volver con "atrás" desde Mercado Pago restaura la página tal cual estaba (con el botón trabado).
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => {
      if (e.persisted) setProcesando(false);
    };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  async function suscribirme() {
    if (procesando) return;
    setProcesando(true);
    const r = await pedirApi({ action: "crear", plan });
    const initPoint = r.datos.initPoint;
    const pesos = r.datos.pesos;
    const fx = r.datos.fx;
    if (!r.ok || typeof initPoint !== "string" || typeof pesos !== "number" || typeof fx !== "number") {
      toast.error(mensajeDe(r.datos));
      setProcesando(false);
      return;
    }
    setPorPagar({ initPoint, pesos, fx, plan });
    setProcesando(false);
  }

  async function canjear() {
    if (canjeando || codigo.trim() === "") return;
    setCanjeando(true);
    setErrorCodigo(null);
    const r = await pedirApi({ action: "canjear", codigo });
    setCanjeando(false);
    if (!r.ok) {
      setErrorCodigo(mensajeDe(r.datos));
      return;
    }
    const nuevo = r.datos.estado as EstadoVitaPlus | undefined;
    if (nuevo) setEstado(nuevo);
    setCodigo("");
    setCodigoAbierto(false);
    toast.success(
      nuevo?.permanente
        ? "Listo: tenés vita+ sin vencimiento"
        : nuevo?.venceAt
          ? `Listo: tenés vita+ hasta ${fechaLarga(nuevo.venceAt)}`
          : "Listo: ya tenés vita+",
      { duration: 8000 },
    );
    router.refresh();
  }

  async function arrepentirme() {
    if (arrepintiendo) return;
    setArrepintiendo(true);
    const r = await pedirApi({ action: "arrepentimiento" });
    setArrepintiendo(false);
    if (!r.ok) {
      toast.error(mensajeDe(r.datos));
      return;
    }
    const nuevo = r.datos.estado as EstadoVitaPlus | undefined;
    if (nuevo) setEstado(nuevo);
    setConfirmandoArrepentimiento(false);
    toast.success("Registramos tu arrepentimiento y cortamos la suscripción. El reembolso se procesa en los próximos días.", {
      duration: 8000,
    });
    router.refresh();
  }

  async function cancelar() {
    if (cancelando) return;
    setCancelando(true);
    const r = await pedirApi({ action: "cancelar" });
    setCancelando(false);
    if (!r.ok) {
      toast.error(mensajeDe(r.datos));
      return;
    }
    const nuevo = r.datos.estado as EstadoVitaPlus | undefined;
    if (nuevo) setEstado(nuevo);
    setConfirmandoCancelar(false);
    toast.success("Listo, no se te va a cobrar más.");
    router.refresh();
  }

  const def = PLANES_VITA_PLUS[plan];
  const pesosPlan = cotizacion?.pesos[plan] ?? null;

  return (
    <div className="fixed inset-0 z-[55] mx-auto flex max-w-md flex-col bg-canvas pt-[max(env(safe-area-inset-top),14px)]">
      <div className="flex shrink-0 items-center justify-between px-[18px] pt-1.5">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/app/perfil"))}
          aria-label="Cerrar"
          className="flex size-[38px] items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="close" size={15} strokeWidth={2.4} />
        </button>
        <div className="rounded-full bg-ink px-[13px] py-1 text-[15px] font-extrabold tracking-[-0.4px] text-on-ink">
          vita<span className="text-amber">+</span>
        </div>
        <div className="w-[38px]" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-[18px]">
        <h1 className="text-balance text-center font-heading text-[30px] font-extrabold leading-[1.08] tracking-[-0.045em]">
          Sumá a todos
          <br />
          los que cuidás
        </h1>
        <p className="mt-2 text-center text-[13.5px] font-medium text-slate-brand">
          De tus papás a tus hijos. Tocá un lugar vacío.
        </p>

        <div className="relative mx-auto mt-2.5 h-[300px] w-[353px] max-w-full shrink-0">
          <svg width="353" height="300" viewBox="0 0 353 300" className="absolute inset-0" aria-hidden>
            {LUGARES.map((l) => (
              <line
                key={l.nombre}
                x1="176"
                y1="150"
                x2={l.x}
                y2={l.y}
                strokeWidth="2"
                strokeDasharray="4 6"
                strokeLinecap="round"
                className="stroke-faint"
              />
            ))}
          </svg>
          <div className="absolute left-[176px] top-[150px] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
            <div className="flex size-[84px] items-center justify-center rounded-full bg-primary text-[30px] font-extrabold text-primary-foreground shadow-[0_0_0_8px_color-mix(in_srgb,var(--teal)_14%,transparent),0_10px_24px_color-mix(in_srgb,var(--teal)_35%,transparent)]">
              {inicial}
            </div>
            <div className="text-[12.5px] font-extrabold">Vos</div>
          </div>
          {LUGARES.map((l) => (
            <button
              key={l.nombre}
              type="button"
              onClick={() => toast(AVISO)}
              style={{ left: l.x, top: l.y }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            >
              <span className="flex size-[62px] items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-card text-[26px] font-extrabold text-primary">
                +
              </span>
              <span className="text-xs font-bold text-subtle">{l.nombre}</span>
            </button>
          ))}
        </div>

        <ul className="mt-1 flex flex-col gap-[9px]">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-sm font-bold">
              <VitaIcon name="check" size={17} strokeWidth={2.8} className="shrink-0 text-primary" />
              {b}
            </li>
          ))}
        </ul>
        <div className="min-h-4 flex-1" />
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 px-[18px] pb-[max(env(safe-area-inset-bottom),24px)] pt-3.5">
        {estado.activo ? (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-[var(--radius-item)] bg-card p-4 text-center shadow-card">
              <div className="font-heading text-[17px] font-extrabold tracking-[-0.02em]">
                Sos vita<span className="text-aviso">+</span>
                {estado.permanente ? " · sin vencimiento" : estado.venceAt ? ` · hasta ${fechaLarga(estado.venceAt)}` : ""}
              </div>
              <p className="mt-1 text-[12.5px] font-medium text-slate-brand">
                {estado.permanente
                  ? "vita+ sin vencimiento."
                  : estado.renueva
                    ? "Se renueva automáticamente."
                    : "No se renueva: al llegar esa fecha termina."}
              </p>
            </div>
            {estado.puedeArrepentirse && !confirmandoArrepentimiento && (
              <button
                type="button"
                onClick={() => setConfirmandoArrepentimiento(true)}
                className="text-center text-[12.5px] font-bold text-slate-brand underline underline-offset-2"
              >
                Botón de arrepentimiento
              </button>
            )}
            {estado.puedeArrepentirse && confirmandoArrepentimiento && (
              <div role="alertdialog" aria-label="Confirmar arrepentimiento" className="rounded-[var(--radius-item)] bg-card p-4 shadow-card">
                <p className="text-[13.5px] font-bold">¿Te arrepentís de la contratación?</p>
                <p className="mt-1 text-[12.5px] font-medium text-slate-brand">
                  Cancelamos la suscripción ahora y procesamos el reembolso de lo que pagaste. Dejás de tener vita+.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={arrepintiendo}
                    onClick={() => setConfirmandoArrepentimiento(false)}
                    className="flex-1 rounded-full bg-muted py-3 text-[13.5px] font-bold disabled:opacity-60"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    disabled={arrepintiendo}
                    onClick={arrepentirme}
                    className="flex-1 rounded-full bg-ink py-3 text-[13.5px] font-extrabold text-on-ink disabled:opacity-60"
                  >
                    {arrepintiendo ? "Enviando…" : "Sí, me arrepiento"}
                  </button>
                </div>
              </div>
            )}
            {estado.renueva && !confirmandoCancelar && (
              <button
                type="button"
                onClick={() => setConfirmandoCancelar(true)}
                className="w-full rounded-full bg-muted py-3.5 text-[14px] font-bold text-slate-brand transition-transform active:scale-[0.98] motion-reduce:transition-none"
              >
                Cancelar suscripción
              </button>
            )}
            {estado.renueva && confirmandoCancelar && (
              <div role="alertdialog" aria-label="Confirmar cancelación" className="rounded-[var(--radius-item)] bg-card p-4 shadow-card">
                <p className="text-[13.5px] font-bold">¿Cancelamos la suscripción?</p>
                <p className="mt-1 text-[12.5px] font-medium text-slate-brand">
                  No se te va a cobrar más{estado.venceAt ? ` y seguís con vita+ hasta el ${fechaLarga(estado.venceAt)}` : ""}.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={cancelando}
                    onClick={() => setConfirmandoCancelar(false)}
                    className="flex-1 rounded-full bg-muted py-3 text-[13.5px] font-bold disabled:opacity-60"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    disabled={cancelando}
                    onClick={cancelar}
                    className="flex-1 rounded-full bg-ink py-3 text-[13.5px] font-extrabold text-on-ink disabled:opacity-60"
                  >
                    {cancelando ? "Cancelando…" : "Sí, cancelar"}
                  </button>
                </div>
              </div>
            )}
          </div>
) : porPagar ? (
          <div role="alertdialog" aria-label="Confirmar pago" className="flex flex-col gap-2.5 rounded-[var(--radius-item)] bg-card p-4 text-center shadow-card">
            <p className="font-heading text-[17px] font-extrabold tracking-[-0.02em]">
              Vas a pagar {textoPesosPorPeriodo(porPagar.plan, porPagar.pesos)}
            </p>
            <p className="text-[12.5px] font-medium text-slate-brand">
              Dólar oficial de hoy: $ {formatoCotizacion(porPagar.fx)}.
              {porPagar.plan === "anual" ? ` Equivale a ${formatoUsd(PLANES_VITA_PLUS.anual.usdCentavos)} una vez por año.` : ""} Se renueva
              automáticamente con ese mismo importe en pesos.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.assign(porPagar.initPoint);
              }}
              className="w-full rounded-full bg-primary py-4 text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98] motion-reduce:transition-none"
            >
              Ir a Mercado Pago
            </button>
            <button type="button" onClick={() => setPorPagar(null)} className="w-full rounded-full bg-muted py-3 text-[13.5px] font-bold">
              Volver
            </button>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Plan" className="flex rounded-full bg-muted p-1">
              {PLANES.map((p) => {
                const activo = plan === p.clave;
                return (
                  <button
                    key={p.clave}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setPlan(p.clave)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-bold transition-all motion-reduce:transition-none",
                      activo ? "bg-card text-foreground shadow-item" : "text-slate-brand",
                    )}
                  >
                    {p.label} · {formatoUsd(p.usdPorMesCentavos)}/mes
                  </button>
                );
              })}
            </div>
            {habilitado ? (
              <>
                <button
                  type="button"
                  onClick={suscribirme}
                  disabled={procesando}
                  className="w-full rounded-full bg-primary py-4 text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none"
                >
                  {procesando ? "Un momento…" : "Suscribirme"}
                </button>
                <p className="text-center text-[12px] font-medium text-slate-brand">
                  {plan === "anual" ? `Se cobra una vez por año: ${formatoUsd(def.usdCentavos)}. ` : ""}
                  {cotizacion && pesosPlan !== null
                    ? `Se cobra en pesos: ${textoPesosPorPeriodo(plan, pesosPlan)} (dólar oficial de hoy, $ ${formatoCotizacion(cotizacion.fx)}).`
                    : "Se cobra en pesos al dólar oficial del día en que te suscribís."}
                </p>
                <p className="text-center text-[11.5px] font-medium text-subtle">
                  Se renueva automáticamente. Podés cancelar cuando quieras desde Perfil.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toast(AVISO)}
                  aria-disabled
                  className="w-full cursor-not-allowed rounded-full bg-faint py-4 text-[15px] font-extrabold text-on-ink"
                >
                  Muy pronto
                </button>
                <p className="text-center text-[11.5px] font-medium text-subtle">
                  Todavía no está disponible · no se cobra nada
                </p>
              </>
            )}
            {codigoAbierto ? (
              <form
                className="flex flex-col gap-2 rounded-[var(--radius-item)] bg-card p-3.5 shadow-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void canjear();
                }}
              >
                <label htmlFor="codigo-vita-plus" className="text-[12.5px] font-bold">
                  Tu código
                </label>
                <input
                  id="codigo-vita-plus"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={32}
                  placeholder="VITA-XXXX-XXXX"
                  className="w-full rounded-full border border-line bg-paper px-4 py-3 text-center text-[15px] font-bold uppercase tracking-wider"
                />
                {errorCodigo ? (
                  <p role="alert" className="text-center text-[12.5px] font-semibold text-destructive">
                    {errorCodigo}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={canjeando || codigo.trim() === ""}
                  className="w-full rounded-full bg-ink py-3 text-[14px] font-extrabold text-on-ink disabled:opacity-60"
                >
                  {canjeando ? "Canjeando…" : "Canjear"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCodigoAbierto(true)}
                className="text-center text-[12.5px] font-bold text-slate-brand underline underline-offset-2"
              >
                Tengo un código
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
