import { LoginForm } from "./login-form";

// Entrada de la app: la "Bienvenida" de Onboarding.dc.html (V7) y, detrás de
// "Continuar con email" / "Tengo un código", el resto de las pantallas de
// acceso. Todas viven en LoginForm como vistas internas.
export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;
  const cuentaEliminada = searchParams?.cuenta === "eliminada";

  return <LoginForm next={next} cuentaEliminada={cuentaEliminada} />;
}
