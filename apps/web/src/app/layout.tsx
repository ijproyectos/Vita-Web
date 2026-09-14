import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// "vita.ia — Clinical Sanctuary" design system: Manrope para headings/UI
// display, Inter para texto de cuerpo. Reemplaza Geist del pase anterior.
const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "vita.ia",
  description: "Tu historial de salud, inteligente.",
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
      className={`${manrope.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
