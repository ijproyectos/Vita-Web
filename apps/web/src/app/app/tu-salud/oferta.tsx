"use client";

import { useRouter } from "next/navigation";
import { ArmarPerfil } from "@/components/vita/invitacion/armar-perfil";
import { volverAMiPerfilAction } from "../familia/actions";

// Cambia al perfil propio antes de armarlo: con vita (onboarding conversado) o a mano (editar perfil).
export function OfertaTuSalud({ nombre }: { nombre: string | null }) {
  const router = useRouter();

  async function irAMiPerfil(destino: string) {
    await volverAMiPerfilAction().catch(() => null);
    router.push(destino);
  }

  return (
    <ArmarPerfil
      titulo="¿Querés llevar tu salud en vita?"
      nombre={nombre}
      onConVita={() => irAMiPerfil("/onboarding/conversar")}
      onYo={() => irAMiPerfil("/app/perfil/editar")}
      onAhoraNo={() => router.push("/app")}
    />
  );
}
