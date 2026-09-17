import { requireUser } from "@/lib/dal";

// Árbol separado de /app/layout.tsx (que asume que el usuario autenticado
// es dueño de su propia data): acá el usuario autenticado es un cuidador
// mirando datos de OTRA persona. Por eso no monta ChatOverlayProvider, ni
// BottomNav, ni el FAB de vita — ninguno de los tres tiene sentido en un
// modo de solo lectura sobre datos ajenos.
//
// A propósito solo valida sesión acá (`requireUser`), no `requireCuidador`
// (que redirige a `/cuidar/sin-vinculos` si no hay vínculos): esa página
// vive bajo este mismo layout, así que llamar `requireCuidador` acá
// produciría un loop de redirects. Cada página hija (`/cuidar`,
// `/cuidar/[elderId]`) llama `requireCuidador` por su cuenta.
export default async function CuidarLayout({ children }: LayoutProps<"/cuidar">) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-6">
      {children}
    </div>
  );
}
