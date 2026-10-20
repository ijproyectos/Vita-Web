"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VitaIcon } from "@/lib/vita-icons";

const MIN_PASSWORD = 8;
const INPUT = "h-12 w-full rounded-full bg-secondary px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FormularioNuevaContrasena() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== confirmacion) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setError("No pudimos guardar la contraseña. Pedí un link nuevo e intentá otra vez.");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mt-4 flex flex-col gap-2.5">
      <input
        type="password"
        name="password"
        aria-label="Contraseña nueva"
        placeholder="Contraseña nueva"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={INPUT}
        required
      />
      <input
        type="password"
        name="confirmacion"
        aria-label="Repetí la contraseña"
        placeholder="Repetí la contraseña"
        autoComplete="new-password"
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        className={INPUT}
        required
      />
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={cargando}
        className="h-14 w-full rounded-full font-heading text-[15px] font-bold text-primary-foreground transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        {cargando ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
