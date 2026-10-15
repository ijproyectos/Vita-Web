import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RegistrarServiceWorker } from "@/components/vita/registrar-service-worker";
import "./globals.css";

// Marca "vita." (Cuidado claro): Plus Jakarta Sans para todo, 500-800.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "vita",
  description: "Tu historial de salud, inteligente.",
  // iOS: sin esto "Agregar a inicio" no abre vita como app independiente
  // (requisito para recibir push en iPhone/iPad).
  appleWebApp: { capable: true, title: "vita", statusBarStyle: "default" },
};

// viewportFit: "cover" es lo que hace que env(safe-area-inset-*) resuelva
// a un valor real en iOS Safari en vez de 0 — sin esto, el header del
// chat overlay y el bottom nav (que ya usan esos env()) quedan como si el
// teléfono no tuviera notch/home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
