import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { LoginForm } from "./login-form";

// Porta LoginScreen.jsx del diseño — logo circular con gradiente teal,
// wordmark "vita.ia", botón de Google (sin Apple, ver CLAUDE.md).
export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7 pb-10 pt-16">
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] size-[360px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(8,145,178,0.14), transparent 60%)" }}
      />

      <div className="z-10 flex flex-1 flex-col items-center justify-center">
        <div className="flex size-[84px] items-center justify-center overflow-hidden rounded-full shadow-[0_20px_48px_rgba(8,145,178,0.3)]">
          <div
            className="flex size-full items-center justify-center"
            style={{ background: "linear-gradient(135deg, #22d3ee, #0e7490)" }}
          >
            <VMark size={54} />
          </div>
        </div>
        <div className="mt-5.5 font-heading text-[34px] font-extrabold tracking-tight text-foreground">
          vita<span className="text-primary">.ia</span>
        </div>
        <p className="mt-2 max-w-[280px] text-center text-[15px] text-muted-foreground">
          Tu historial de salud, inteligente.
        </p>
      </div>

      <div className="z-10 flex flex-col gap-3">
        <LoginForm next={next} />

        <div className="mt-4.5 flex items-center gap-3 rounded-[20px] bg-secondary p-3.5">
          <div className="flex -space-x-2.5">
            <div className="flex size-8 items-center justify-center rounded-[10px] bg-white shadow-[0_2px_6px_rgba(15,33,54,0.06)]">
              <VitaIcon name="heart-plus" size={17} color="#FF3B30" />
            </div>
            <div className="flex size-8 items-center justify-center rounded-[10px] bg-white shadow-[0_2px_6px_rgba(15,33,54,0.06)]">
              <VitaIcon name="activity" size={17} color="#4285F4" />
            </div>
          </div>
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            Nos conectamos con tu app de Salud y relojes para traer tu data automáticamente.
          </p>
        </div>

        <p className="mt-3.5 text-center text-[11.5px] leading-snug text-muted-foreground">
          Al continuar, aceptás los <span className="font-semibold text-primary">Términos</span> y{" "}
          <span className="font-semibold text-primary">Política de Privacidad</span>.
        </p>
      </div>
    </div>
  );
}
