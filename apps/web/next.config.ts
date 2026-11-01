import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
