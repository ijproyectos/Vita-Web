import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/acceso";
import { NavAdmin } from "./_componentes/nav";

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
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight text-ink">vita</span>
            <span className="eyebrow">panel</span>
          </div>
          <NavAdmin />
          <p className="truncate text-xs text-subtle">{admin.email}</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
