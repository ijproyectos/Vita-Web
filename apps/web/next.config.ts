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
    ];
  },
  experimental: {
    // Default es 1mb — no alcanza para subir la foto de un estudio médico
    // desde la cámara (Server Action subirEstudioAction).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
