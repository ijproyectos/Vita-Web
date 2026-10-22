"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MINUTOS_VIGENCIA_CODIGO_ACCESO } from "@/lib/acceso-codigo/tipos";

// Tarjeta "Código para X" de V7 (Conectar su celular): seis cajas con el
// código, "Enviar por WhatsApp", "Copiar" y "Se lo leo por teléfono". El código
// es real (15 min, un solo uso, dígitos); este panel solo lo muestra y lo comparte.
export function PanelCodigoAcceso({
  codigo,
  expiraAt,
  nombre,
  onGenerarOtro,
  generando,
}: {
  codigo: string;
  expiraAt: string;
  nombre: string;
  onGenerarOtro?: () => void;
  generando?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [ahora, setAhora] = useState(() => new Date().getTime());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date().getTime()), 15000);
    return () => clearInterval(t);
  }, []);

  const restanteMs = new Date(expiraAt).getTime() - ahora;
  const vencido = restanteMs <= 0;
  const minutos = Math.max(1, Math.ceil(restanteMs / 60000));

  function mensaje() {
    return `Tu código para entrar a vita: ${codigo}. Abrí ${window.location.origin}/login, tocá «Tengo un código» y escribilo. Vence en ${MINUTOS_VIGENCIA_CODIGO_ACCESO} minutos y sirve una sola vez.`;
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje())}`, "_blank", "noopener,noreferrer");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      toast.success("Código copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No pudimos copiar el código.");
    }
  }

  return (
    <div className="flex flex-col items-center rounded-[22px] bg-card px-[18px] pb-5 pt-[22px] text-center shadow-card">
      <div className="eyebrow text-subtle">Código para {nombre}</div>
      <div
        className={cn("mt-4 grid w-full grid-cols-6 gap-2 transition-opacity", vencido && "opacity-40")}
        role="img"
        aria-label={`Código ${codigo.split("").join(" ")}`}
      >
        {codigo.split("").map((c, i) => (
          <div
            key={i}
            aria-hidden
            className="flex h-[58px] items-center justify-center rounded-[16px] bg-secondary font-heading text-[28px] font-extrabold text-teal-deep"
          >
            {c}
          </div>
        ))}
      </div>
      {vencido ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-[12.5px] font-semibold text-subtle">Este código venció.</p>
          {onGenerarOtro && (
            <button
              type="button"
              onClick={onGenerarOtro}
              disabled={generando}
              className="rounded-full bg-primary px-5 py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
            >
              {generando ? "Generando…" : "Generar código nuevo"}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-[18px] flex w-full gap-2">
            <button
              type="button"
              onClick={whatsapp}
              className="flex-1 rounded-full bg-primary py-[13px] font-heading text-sm font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
            >
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              onClick={copiar}
              className="rounded-full bg-card px-[22px] py-[13px] font-heading text-sm font-extrabold text-teal-deep shadow-[inset_0_0_0_1.5px_var(--chip-teal-bg)]"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => toast("Leéselo despacio, número por número")}
            className="mt-3.5 text-[13.5px] font-extrabold text-teal-deep"
          >
            Se lo leo por teléfono
          </button>
          <p className="mt-3 text-[11.5px] font-medium text-subtle">
            Vence en {minutos} {minutos === 1 ? "minuto" : "minutos"} y sirve una sola vez.
          </p>
          {onGenerarOtro && (
            <button
              type="button"
              onClick={onGenerarOtro}
              disabled={generando}
              className="mt-2 text-[12.5px] font-bold text-slate-brand disabled:opacity-60"
            >
              {generando ? "Generando…" : "Generar otro código"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
