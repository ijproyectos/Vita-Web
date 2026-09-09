import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { LogOut, Pill, MessageCircle } from "lucide-react";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, avatar_url")
    .eq("id", usuario.id)
    .single();

  const nombre = perfil?.nombre ?? usuario.email ?? "Tu cuenta";

  return (
    <div className="flex min-h-screen flex-col">
      {/* AppBar navy con texto blanco — mismo AppBarTheme(backgroundColor:
          primaryColor, foregroundColor: Colors.white) del Vitapp original.
          Los Button variant="ghost" no necesitan color propio: heredan
          text-primary-foreground en reposo y su hover (bg-muted claro)
          ya da el contraste correcto sobre navy, sin tocar button.tsx. */}
      <header className="flex items-center justify-between bg-primary px-6 py-3 text-primary-foreground">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">Vitapp</span>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app/medicamentos" />}>
              <Pill className="size-4" />
              Medicamentos
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app/chat" />}>
              <MessageCircle className="size-4" />
              Asistente
            </Button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-primary-foreground/70">{nombre}</span>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
