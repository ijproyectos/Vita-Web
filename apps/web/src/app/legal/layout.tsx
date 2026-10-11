import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VitaWordmark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";

// Layout público de los documentos legales: no exige sesión (se linkean
// desde /login). El link "Volver" depende de si hay sesión, no de
// router.back(), porque se puede entrar directo desde un link externo.
export default async function LegalLayout({ children }: LayoutProps<"/legal">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-5 pb-16 pt-6">
      <header className="flex items-center justify-between gap-3">
        <Link
          href={user ? "/app/perfil" : "/login"}
          className="flex h-10 items-center gap-1.5 rounded-full bg-card pl-3 pr-4 text-sm font-semibold shadow-card"
        >
          <VitaIcon name="chevron-left" size={16} />
          Volver
        </Link>
        <VitaWordmark size={26} tono="menta" />
      </header>
      {children}
    </div>
  );
}
