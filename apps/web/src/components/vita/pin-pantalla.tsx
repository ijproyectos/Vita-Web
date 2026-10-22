"use client";

import { useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { INTENTOS_MAXIMOS, LARGO_PIN, guardarPin, verificarPin } from "@/lib/seguridad/pin";

// Pantalla completa de PIN (V7 acceso › PIN): teclado de 12 teclas, 4 puntos
// y los tres modos que usa el diseño. Toda la lógica de validación vive acá;
// quien la monta decide qué pasa al terminar (`onListo`).
//   desbloquear  "Hola, {nombre}" · Ingresá tu PIN
//   cambiar      PIN actual → PIN nuevo → repetirlo
//   nuevo        PIN nuevo → repetirlo (al activar el PIN)
export type ModoPin = "desbloquear" | "cambiar" | "nuevo";

type Fase = "actual" | "nuevo1" | "nuevo2";

export function PinPantalla({
  uid,
  nombre,
  modo,
  onListo,
  onCancelar,
  onOlvide,
  onAgotado,
}: {
  uid: string;
  nombre: string;
  modo: ModoPin;
  onListo: (que: "desbloqueado" | "nuevo") => void;
  onCancelar?: () => void;
  /** "Olvidé mi PIN" (solo al desbloquear). */
  onOlvide?: () => void;
  /** 5 intentos fallidos. */
  onAgotado?: () => void;
}) {
  const [fase, setFase] = useState<Fase>(modo === "nuevo" ? "nuevo1" : "actual");
  const [entrada, setEntrada] = useState("");
  const [primero, setPrimero] = useState("");
  const [errores, setErrores] = useState(0);
  const [mala, setMala] = useState(false);
  const [sacudida, setSacudida] = useState(0);
  const [ocupado, setOcupado] = useState(false);

  const titulo =
    fase === "actual"
      ? modo === "cambiar"
        ? "Cambiar PIN"
        : `Hola, ${nombre}`
      : fase === "nuevo1"
        ? "Elegí un PIN nuevo"
        : "Repetilo";
  const restantes = INTENTOS_MAXIMOS - errores;
  const mensaje =
    fase === "actual"
      ? mala
        ? errores >= 3
          ? `PIN incorrecto · te ${restantes === 1 ? "queda 1 intento" : `quedan ${restantes} intentos`}`
          : "PIN incorrecto · probá de nuevo"
        : modo === "cambiar"
          ? "Primero, tu PIN actual"
          : "Ingresá tu PIN"
      : mala
        ? "No coincidían. Elegilo de nuevo."
        : fase === "nuevo1"
          ? "4 números fáciles de recordar. Evitá tu fecha de nacimiento."
          : "Para confirmar que lo recordás.";

  async function procesar(pin: string) {
    if (fase === "actual") {
      const ok = await verificarPin(uid, pin);
      if (ok) {
        setEntrada("");
        if (modo === "cambiar") setFase("nuevo1");
        else onListo("desbloqueado");
        return;
      }
      const n = errores + 1;
      if (n >= INTENTOS_MAXIMOS) {
        onAgotado?.();
        return;
      }
      setErrores(n);
      setMala(true);
      setSacudida((s) => s + 1);
      setEntrada("");
    } else if (fase === "nuevo1") {
      setPrimero(pin);
      setEntrada("");
      setMala(false);
      setFase("nuevo2");
    } else {
      if (pin === primero) {
        const ok = await guardarPin(uid, pin);
        if (ok) onListo("nuevo");
        else {
          setMala(true);
          setEntrada("");
        }
        return;
      }
      setMala(true);
      setSacudida((s) => s + 1);
      setEntrada("");
      setPrimero("");
      setFase("nuevo1");
    }
  }

  function presionar(d: string) {
    if (ocupado || entrada.length >= LARGO_PIN) return;
    const nueva = entrada + d;
    setEntrada(nueva);
    setMala(false);
    if (nueva.length === LARGO_PIN) {
      setOcupado(true);
      // Un instante para que se vea el cuarto punto lleno antes de validar.
      setTimeout(() => {
        void procesar(nueva).finally(() => setOcupado(false));
      }, 180);
    }
  }

  function borrar() {
    if (ocupado) return;
    setEntrada((e) => e.slice(0, -1));
  }

  const esDesbloqueo = modo === "desbloquear";
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const claseTecla =
    "flex size-[76px] items-center justify-center rounded-full bg-card font-heading text-[28px] font-bold text-foreground shadow-card transition-transform select-none active:scale-[0.93] motion-reduce:transition-none";

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 pb-[34px] pt-[30px]">
      {esDesbloqueo ? (
        <div className="flex size-[84px] items-center justify-center rounded-full bg-foreground font-heading text-[34px] font-extrabold tracking-[-0.04em] text-background">
          {(nombre.trim().charAt(0) || "V").toUpperCase()}
        </div>
      ) : (
        <div className="flex size-[84px] items-center justify-center rounded-full bg-persona-1-tint text-persona-1-deep">
          <VitaIcon name="lock" size={34} />
        </div>
      )}
      <h1 className="mt-[18px] text-center font-heading text-[30px] font-extrabold leading-[1.12] tracking-[-0.04em]">{titulo}</h1>
      <p
        role="status"
        className={cn(
          "mt-2 min-h-6 max-w-[300px] text-balance text-center text-[17px] font-semibold",
          mala ? "text-destructive" : "text-slate-brand"
        )}
      >
        {mensaje}
      </p>
      <div key={sacudida} className={cn("mt-[26px] flex gap-[18px]", mala && "vita-sacudir")} aria-hidden>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full transition-colors",
              i < entrada.length ? "bg-foreground" : mala ? "shadow-[inset_0_0_0_2px_var(--destructive)]" : "shadow-[inset_0_0_0_2px_var(--faint)]"
            )}
          />
        ))}
      </div>

      <div className="min-h-5 flex-1" />

      <div className="grid grid-cols-3 gap-x-[26px] gap-y-3.5">
        {teclas.map((d) => (
          <button key={d} type="button" onClick={() => presionar(d)} className={claseTecla} aria-label={d}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => presionar("0")} className={claseTecla} aria-label="0">
          0
        </button>
        <button
          type="button"
          onClick={borrar}
          aria-label="Borrar"
          className="flex size-[76px] items-center justify-center rounded-full text-slate-brand transition-transform select-none active:scale-[0.93] motion-reduce:transition-none"
        >
          <VitaIcon name="backspace" size={26} />
        </button>
      </div>

      {esDesbloqueo && onOlvide && (
        <button type="button" onClick={onOlvide} className="mt-5 text-[15px] font-bold text-teal-deep">
          Olvidé mi PIN
        </button>
      )}
      {onCancelar && (
        <button type="button" onClick={onCancelar} className="mt-5 text-[15px] font-bold text-slate-brand">
          Cancelar
        </button>
      )}
    </div>
  );
}

// "Por seguridad, pausamos vita" (V7 acceso › locked) — también sirve para
// "Olvidé mi PIN": el PIN solo vive en este dispositivo, así que la salida es
// volver a iniciar sesión (la sesión se cierra y el PIN de este dispositivo
// se borra) y elegir uno nuevo si se quiere.
export function PinPausado({ motivo, onBorrarPin }: { motivo: "agotado" | "olvido"; onBorrarPin: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-2">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex size-28 items-center justify-center rounded-full bg-aviso-panel text-aviso-panel-ink">
          <VitaIcon name="lock" size={46} />
        </div>
        <h1 className="mt-[26px] text-balance text-center font-heading text-[30px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          {motivo === "agotado" ? "Por seguridad, pausamos vita" : "¿Olvidaste tu PIN?"}
        </h1>
        <p className="mt-3 text-balance text-center text-[17px] font-medium leading-[1.5] text-slate-brand">
          {motivo === "agotado"
            ? "El PIN se ingresó mal 5 veces. Volvé a entrar a tu cuenta para elegir uno nuevo."
            : "Volvé a entrar a tu cuenta. Vamos a borrar el PIN de este dispositivo; después podés elegir uno nuevo."}
        </p>
        <p className="mt-6 self-stretch rounded-[20px] bg-card px-4 py-3.5 text-[15px] font-semibold leading-[1.45] text-slate-brand shadow-card">
          Los avisos de remedios y turnos siguen sonando, sin mostrar detalles.
        </p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          onClick={onBorrarPin}
          className="h-14 w-full rounded-full bg-primary font-heading text-base font-extrabold text-primary-foreground shadow-cta"
        >
          Volver a entrar
        </button>
      </form>
    </div>
  );
}
