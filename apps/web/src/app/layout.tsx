import type { Metadata } from "next";
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
