import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "Veille satellite",
  description: "Surveillance de zones par imagerie Sentinel et détection de changement par IA.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0b3d2e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
