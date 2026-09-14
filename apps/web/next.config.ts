import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default es 1mb — no alcanza para subir la foto de un estudio médico
    // desde la cámara (Server Action subirEstudioAction).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
