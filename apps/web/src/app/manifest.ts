import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/email/marca";

// El manifest es JSON estático: no puede leer variables CSS. Los colores
// salen de lib/email/marca.ts, la única copia en hex de los tokens de
// globals.css (ver AGENTS.md), para que no haya una segunda copia que derive.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "vita",
    short_name: "vita",
    description: "Tu historial de salud, inteligente.",
    lang: "es-AR",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: MARCA.cream,
    theme_color: MARCA.teal,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
