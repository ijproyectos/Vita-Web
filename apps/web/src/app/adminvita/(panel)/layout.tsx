import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/acceso";
import { cerrarSesionAdminAction } from "../acciones-sesion";
import { InactividadAdmin } from "./_componentes/inactividad";
import { BotonActualizar, NavAdmin } from "./_componentes/nav";
import { Avatar } from "./_componentes/ui";
import { VitaIcon } from "@/lib/vita-icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "vita · panel",
  robots: { index: false, follow: false, nocache: true },
};

// Árbol propio: sin BottomNav ni chat overlay, y fuera del gate de onboarding de /app. El acceso se exige acá y
// ADEMÁS en cada página y función de datos (los layouts no se re-ejecutan en cada navegación del cliente).
export default async function AdminLayout({ children }: LayoutProps<"/adminvita">) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-panel px-3 py-3 sm:px-6 sm:py-5">
      <InactividadAdmin />
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-3 rounded-[32px] bg-card p-3 shadow-panel lg:flex-row lg:items-center lg:justify-between lg:pl-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-[-0.06em] text-ink">
                vita<span className="text-amber">.</span>
              </span>
              <span className="eyebrow text-subtle">panel</span>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <BotonActualizar />
            </div>
          </div>
          <NavAdmin />
          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <div className="hidden lg:block">
              <BotonActualizar />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Avatar nombre={admin.email} className="size-10" />
              <p className="min-w-0 truncate text-xs font-semibold text-slate-brand">{admin.email}</p>
            </div>
            <form action={cerrarSesionAdminAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-panel-track px-4 py-2.5 text-xs font-bold text-slate-brand transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-teal motion-reduce:transition-none"
              >
                <VitaIcon name="logout" size={14} />
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <main className="pb-16 pt-6">{children}</main>
      </div>
    </div>
  );
}
