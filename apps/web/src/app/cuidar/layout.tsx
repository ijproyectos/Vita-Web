import { requireUser } from "@/lib/dal";
import { requireNoSuspendida } from "@/lib/suspensiones/guardia";
import { RastreadorNavegacion } from "@/lib/navegacion/rastreador";

// Árbol separado de /app/layout.tsx (que asume que el usuario autenticado
// es dueño de su propia data): acá el usuario autenticado es un cuidador
// mirando datos de OTRA persona. Por eso no monta ChatOverlayProvider, ni
// BottomNav, ni el FAB de vita — ninguno de los tres tiene sentido en un
// modo de solo lectura sobre datos ajenos.
//
// Solo valida sesión (`requireUser`), no `requireCuidador`: la invitación
// (`/cuidar/invitacion/[token]`) la abre alguien que todavía no cuida a nadie.
// Las páginas hijas solo redirigen, así que acá no se consulta nada más.
export default async function CuidarLayout({ children }: LayoutProps<"/cuidar">) {
  await requireUser();
  await requireNoSuspendida();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-6">
      <RastreadorNavegacion />
      {children}
    </div>
  );
}
