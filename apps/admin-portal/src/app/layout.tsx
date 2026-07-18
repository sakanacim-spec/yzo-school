import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "../providers/AppProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oziow Admin Portal",
  description: "SaaS Admin Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dans un vrai cas, l'URL et l'Anon Key viendraient de variables d'environnement (NEXT_PUBLIC_SUPABASE_URL)
  // Pour le MVP local Oziow, nous utilisons la config locale.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTUxNTEyMDAsImV4cCI6MjAyMjUxMTIwMH0.xxxx";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppProviders supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
