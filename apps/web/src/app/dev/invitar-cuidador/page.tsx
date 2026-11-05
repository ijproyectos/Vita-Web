import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { InvitacionLista } from "@/components/vita/invitacion/invitacion-lista";
import { RecibirInvitacion } from "@/components/vita/invitacion/recibir-invitacion";
import { AceptarInvitacion } from "@/components/vita/invitacion/aceptar-invitacion";
import { InvitacionPendiente } from "@/components/vita/invitacion/invitacion-pendiente";
import { CodigoInvalido } from "@/components/vita/invitacion/codigo-invalido";
import { OtraCuenta } from "@/components/vita/invitacion/otra-cuenta";
import { YaUsaVita } from "@/components/vita/invitacion/ya-usa-vita";
import { ArmarPerfil } from "@/components/vita/invitacion/armar-perfil";

// Vista previa de las pantallas de la persona invitada SIN login, con datos de
// ejemplo y botones inertes. Solo dev/test: 404 en producción salvo
// NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true" (mismo criterio que /dev/charla-simple).
// `?pantalla=<clave>` abre una; sin parámetro lista todas.

const PANTALLAS: Record<string, { titulo: string; vista: () => ReactNode }> = {
  a2: {
    titulo: "A2 · Invitación lista",
    vista: () => (
      <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
        <InvitacionLista codigo="482915" persona="Jesus" invitado="Martina" rol="ver" email="martina@gmail.com" />
      </div>
    ),
  },
  b3: {
    titulo: "B3 · Quién te invita",
    vista: () => <RecibirInvitacion invitador="Micaela" persona="Jesus" relacion="Tu papá" rol="ver" email="martina@gmail.com" />,
  },
  "b4-lector": {
    titulo: "B4 · Vas a cuidar (Lector)",
    vista: () => <AceptarInvitacion nombre="Martina" persona="Jesus" rol="ver" />,
  },
  "b4-admin": {
    titulo: "B4 · Vas a cuidar (Admin, perfil gestionado)",
    vista: () => <AceptarInvitacion nombre="Martina" persona="Jesus" rol="editar" esPerfilGestionado />,
  },
  "b4-admin-propio": {
    titulo: "B4 · Vas a cuidar (Admin, sin nombre)",
    vista: () => <AceptarInvitacion persona="Jesus" rol="editar" />,
  },
  "ahora-no": {
    titulo: "Ahora no · invitación abierta",
    vista: () => <InvitacionPendiente fechaVence="12 de noviembre" persona="Jesus" />,
  },
  "c1-no-existe": {
    titulo: "C1 · Código inexistente",
    vista: () => <CodigoInvalido variante="no-existe" codigo="482917" />,
  },
  "c1-vencido": {
    titulo: "C1 · Código vencido",
    vista: () => <CodigoInvalido variante="vencido" codigo="482915" invitador="Micaela" />,
  },
  c2: {
    titulo: "C2 · Otro mail",
    vista: () => <OtraCuenta emailActual="tini.r@hotmail.com" emailInvitado="martina@gmail.com" invitador="Micaela" />,
  },
  c3: {
    titulo: "C3 · Ya usa vita",
    vista: () => <YaUsaVita yo="Martina" actuales={["Elsa"]} nueva="Jesus" />,
  },
  d1: {
    titulo: "D1 · Tu perfil",
    vista: () => <ArmarPerfil nombre="Martina Álvarez" persona="Jesus" invitador="Micaela" />,
  },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ pantalla?: string }> }) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();

  const { pantalla } = await searchParams;
  const elegida = pantalla && Object.hasOwn(PANTALLAS, pantalla) ? PANTALLAS[pantalla] : undefined;
  if (elegida) return elegida.vista();

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-cream px-6 py-10">
      <h1 className="font-heading text-2xl font-extrabold tracking-[-0.03em]">Invitar cuidador · vista previa</h1>
      <p className="mt-2 text-sm font-medium text-slate-brand">Datos de ejemplo; los botones no hacen nada.</p>
      <ul className="mt-6 flex flex-col gap-2">
        {Object.entries(PANTALLAS).map(([clave, { titulo }]) => (
          <li key={clave}>
            <Link href={`/dev/invitar-cuidador?pantalla=${clave}`} className="block rounded-[var(--radius-item)] bg-card px-4 py-3.5 text-[15px] font-bold shadow-card">
              {titulo}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
