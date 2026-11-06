import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Versión y build se resuelven UNA vez al compilar y quedan incrustados en el
// bundle (cliente y servidor). No hay secretos: versión de package.json, SHA
// corto del commit (Netlify define COMMIT_REF; en local "dev") y fecha del build.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: process.env.COMMIT_REF ? process.env.COMMIT_REF.slice(0, 7) : "dev",
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
  async headers() {
    return [
      {
        // El service worker nunca se cachea: el navegador tiene que ver
        // cada versión nueva para actualizarlo.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // Versión del servidor en ejecución: nunca se cachea (ni en el CDN).
        source: "/api/version",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        // Panel de administración: nunca se cachea ni se indexa.
        source: "/adminvita/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  experimental: {
    // Default es 1mb — no alcanza para subir la foto de un estudio médico
    // desde la cámara (Server Action subirEstudioAction).
    serverActions: {
      bodySizeLimit: "15mb",
    },
    // Sin caché de Turbopack en disco durante el build: esa caché guarda una
    // copia de las variables de entorno, y el escaneo de secretos de Netlify
    // frena el deploy al encontrar ahí el valor de MP_WEBHOOK_SECRET. Así el
    // secreto nunca queda escrito y el escaneo sigue cubriendo todo.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
