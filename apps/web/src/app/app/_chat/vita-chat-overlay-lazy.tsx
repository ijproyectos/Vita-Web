"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { cuandoOcioso, debeMontarOverlay } from "@/lib/chat/montaje";

// El overlay (chat, voz, avatar 3D) pesa bastante y no hace falta para pintar la pantalla: se carga en un chunk
// aparte, cuando el navegador queda ocioso o cuando alguien lo abre, lo que pase primero. Una vez montado se queda
// montado (conserva la conversación, `activo={abierto}` sigue igual). Si se abre antes de que cargue, el
// proveedor (`ChatOverlayProvider`, ya montado en el layout) guarda `abierto` y el mensaje inicial, y el overlay los
// toma al aparecer: el pedido de abrir no se pierde.
const VitaChatOverlay = dynamic(() => import("./vita-chat-overlay").then((m) => m.VitaChatOverlay), { ssr: false });

const PLAZO_OCIOSO_MS = 4000;

type Props = { esPropio: boolean; nombreActivo: string; perfilActivoId: string };

export function VitaChatOverlayLazy(props: Props) {
  const { abierto } = useChatOverlay();
  const [montado, setMontado] = useState(false);
  const [ociosoListo, setOciosoListo] = useState(false);

  useEffect(() => cuandoOcioso(() => setOciosoListo(true), PLAZO_OCIOSO_MS, window), []);

  const montar = debeMontarOverlay({ yaMontado: montado, abierto, ociosoListo });
  // Ajuste de estado durante el render (patrón de React para derivar estado): recuerda que ya se montó.
  if (montar && !montado) setMontado(true);

  return montar ? <VitaChatOverlay {...props} /> : null;
}
