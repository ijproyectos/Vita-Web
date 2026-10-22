"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VitaAvatar } from "@/components/vita/vita-avatar";
import {
  AvisoAuth,
  BotonCta,
  CampoPassword,
  IconoTilde,
  PantallaAuth,
  ReglasPassword,
  TituloAuth,
  passwordValida,
} from "@/components/vita/auth-ui";

// "Creá una contraseña nueva" + "Listo, tu contraseña nueva ya está activa"
// (V7 new-pass / pass-ok). Mismas reglas que el alta de cuenta.
export function FormularioNuevaContrasena() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const coinciden = password.length > 0 && password === confirmacion;
  const habilitado = passwordValida(password) && coinciden;

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!habilitado) return;
    setError(null);
    setCargando(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setError("No pudimos guardar la contraseña. Pedí un link nuevo e intentá otra vez.");
        return;
      }
      setListo(true);
    } catch {
      setError("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  if (listo) {
    return (
      <PantallaAuth>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative">
            <div className="flex size-[150px] items-center justify-center overflow-hidden rounded-full bg-avatar-fondo">
              <VitaAvatar size={136} estado="happy" />
            </div>
            <div className="absolute bottom-1.5 right-0.5 flex size-[46px] items-center justify-center rounded-full border-4 border-cream bg-primary text-primary-foreground">
              <IconoTilde size={22} />
            </div>
          </div>
          <h1 className="mt-[26px] text-balance text-center font-heading text-[30px] font-extrabold leading-[1.15] tracking-[-0.04em]">
            Listo, tu contraseña nueva ya está activa.
          </h1>
          <p className="mt-3 text-balance text-center text-[17px] font-medium leading-normal text-slate-brand">
            Usala la próxima vez que entres a Vita.
          </p>
        </div>
        <BotonCta
          type="button"
          onClick={() => {
            router.push("/app");
            router.refresh();
          }}
        >
          Entrar a Vita
        </BotonCta>
      </PantallaAuth>
    );
  }

  return (
    <PantallaAuth>
      <form onSubmit={guardar} className="flex flex-1 flex-col">
        <TituloAuth titulo="Creá una contraseña nueva" sub="Elegí una que no uses en otras apps." />
        <div className="mt-[26px] flex flex-col gap-3.5">
          <CampoPassword
            etiqueta="Contraseña nueva"
            name="password"
            placeholder="8 o más, con número y símbolo"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <CampoPassword
            etiqueta="Repetila"
            name="confirmacion"
            placeholder="La misma contraseña"
            autoComplete="new-password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            required
          />
        </div>
        <div className="mt-[18px]">
          <ReglasPassword password={password} coinciden={coinciden} />
        </div>
        {error && <AvisoAuth>{error}</AvisoAuth>}
        <div className="flex-1" />
        <BotonCta type="submit" habilitado={habilitado} disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar contraseña"}
        </BotonCta>
      </form>
    </PantallaAuth>
  );
}
