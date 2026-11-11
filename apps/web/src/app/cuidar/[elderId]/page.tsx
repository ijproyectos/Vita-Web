import { redirect } from "next/navigation";
import { rolSobre } from "@/lib/familia/perfil-activo";
import { urlFichaPersona } from "@/lib/notificaciones/mensajes";

// The old caregiver dashboard was replaced by the person's card in the app
// (`/app/familia/<id>`: "Hoy", Recordarle, stock). Old links (notifications
// already in the feed, the overdue-dose popup, the /cuidar list) land here and
// go to the same place every other family notification opens: the card for an
// Admin, the app home for a Lector. Access is still enforced there (RLS and the
// card's own role check); this page only decides where to go.
export default async function CuidarElderPage(props: PageProps<"/cuidar/[elderId]">) {
  const { elderId } = await props.params;
  redirect(urlFichaPersona(elderId, await rolSobre(elderId)));
}
