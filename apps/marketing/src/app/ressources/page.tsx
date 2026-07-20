import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Centre de Ressources",
  description: "Guides sectoriels, livres blancs et études de cas sur les SaaS métiers OZIOW.",
};

export default function RessourcesPage() {
  return (
    <div className="section mx-auto max-w-5xl" style={{ paddingTop: "4rem" }}>
      <span className="section-label">Centre de Savoir</span>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Centre de Ressources</h1>
      <p className="mt-4 text-lg text-slate-400">
        Guides pratiques, études de cas et meilleures pratiques pour réussir la transformation numérique de votre secteur.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        <div className="glass-card p-6">
          <span className="text-3xl">📘</span>
          <h2 className="mt-4 text-lg font-bold text-white">Livres Blancs</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Guide complet : L&apos;IA et le Multi-Tenant dans la gestion scolaire moderne.</p>
        </div>

        <div className="glass-card p-6">
          <span className="text-3xl">🎥</span>
          <h2 className="mt-4 text-lg font-bold text-white">Tutoriels Vidéo</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Vidéos pas-à-pas pour configurer votre premier tenant et l&apos;IA Concierge.</p>
        </div>

        <div className="glass-card p-6">
          <span className="text-3xl">📊</span>
          <h2 className="mt-4 text-lg font-bold text-white">Études de Cas</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Comment Yziow a permis à plus de 50 établissements de réduire leur charge administrative.</p>
        </div>
      </div>
    </div>
  );
}
