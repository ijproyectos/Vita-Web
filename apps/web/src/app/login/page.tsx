import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-2xl text-2xl font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,.18)]"
            style={{ background: "linear-gradient(150deg,#42A5F5,#2C3E50)" }}
          >
            V
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Vitapp
          </h1>
          <p className="text-sm text-muted-foreground">
            Tus medicamentos y tu asistente de salud, en un solo lugar
          </p>
        </div>

        <LoginForm next={next} />
      </Card>
    </div>
  );
}
