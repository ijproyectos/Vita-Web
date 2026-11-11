import { redirect } from "next/navigation";

// The old caregiver panel ("A quién cuidás", "Vincular a alguien") is not part of
// the V7 design: everything it showed lives in Familia (/app/familia) and in each
// person's card (/app/familia/<id>: "Hoy", Recordarle, conectar su celular). Old
// links and bookmarks land here and go to Familia.
export default function CuidarPage() {
  redirect("/app/familia");
}
