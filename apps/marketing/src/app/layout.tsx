import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    template: "%s | OZIOW",
    default: "OZIOW — Plateforme SaaS Nouvelle Génération",
  },
  description: "Construisez et déployez vos applications métiers avec l'intelligence artificielle et une architecture multi-tenant sécurisée.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} antialiased h-full`}>
      <body className="flex min-h-full flex-col bg-zinc-950 text-white selection:bg-indigo-500/30">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
