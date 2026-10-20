import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";

// Destino del callback cuando no se pudo crear la sesión: el link de Google
// falló, o el link del mail (confirmación / nueva contraseña) ya venció o
// ya se usó.
export default function AuthCodeErrorPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background p-6">
      <div className="flex w-full flex-col items-center gap-4 rounded-[20px] bg-card p-8 text-center shadow-card">
        <div className="flex size-14 items-center justify-center rounded-[var(--radius-tile)] bg-destructive/10 text-destructive">
          <VitaIcon name="alert-triangle" size={24} />
        </div>
        <h1 className="font-heading text-xl font-extrabold tracking-[-0.02em]">No pudimos iniciar tu sesión</h1>
        <p className="text-sm text-slate-brand">
          El link puede haber vencido o ya haberse usado. Volvé a intentarlo desde el inicio.
        </p>
        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-full font-heading text-[15px] font-bold text-primary-foreground"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          Volver a intentar
        </Link>
      </div>
    </div>
  );
}
