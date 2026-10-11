import Link from "next/link";
import { VMark, VitaWordmark } from "@/components/vita/v-mark";
import { LoginForm } from "./login-form";

// Porta LoginScreen.jsx del diseño — logo circular con gradiente teal,
// wordmark "vita.", botón de Google (sin Apple, ver CLAUDE.md).
export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;
  const cuentaEliminada = searchParams?.cuenta === "eliminada";

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-background to-card px-7 pb-10 pt-16">
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] size-[360px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%)" }}
      />

      <div className="z-10 flex flex-1 flex-col items-center justify-center">
        <VMark size={84} />
        <div className="mt-5.5">
          <VitaWordmark size={50} solo />
        </div>
        <p className="mt-2 max-w-[280px] text-center text-[15px] text-muted-foreground">
          Tu historial de salud, inteligente.
        </p>
      </div>

      <div className="z-10 flex flex-col gap-3">
        {cuentaEliminada && (
          <p role="status" className="rounded-[14px] bg-secondary px-3.5 py-2.5 text-center text-sm text-foreground">
            Tu cuenta y todos tus datos fueron eliminados.
          </p>
        )}
        <LoginForm next={next} />

        <p className="mt-3.5 text-center text-[11.5px] leading-snug text-muted-foreground">
          Al continuar, aceptás los{" "}
          <Link href="/legal/terminos" className="font-semibold text-primary underline-offset-2 hover:underline">
            Términos
          </Link>{" "}
          y la{" "}
          <Link href="/legal/privacidad" className="font-semibold text-primary underline-offset-2 hover:underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
