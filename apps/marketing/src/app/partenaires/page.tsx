import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Réseau de Partenaires",
  description: "Devenez partenaire OZIOW : agences, intégrateurs, et apporteurs d'affaires.",
};

export default function PartenairesPage() {
  return (
    <div className="section mx-auto max-w-5xl" style={{ paddingTop: "4rem" }}>
      <span className="section-label">Écosystème</span>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Réseau de Partenaires OZIOW</h1>
      <p className="mt-4 text-lg text-slate-400">
        Rejoignez notre réseau d&apos;agences, d&apos;intégrateurs et d&apos;experts métiers qui accompagnent nos clients dans l&apos;intégration et le déploiement des SaaS métiers.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className="glass-card p-6 border-indigo-500/20">
          <span className="text-3xl">🏢</span>
          <h2 className="mt-4 text-xl font-bold text-white">Agences &amp; Intégrateurs</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Accompagnez les établissements et entreprises dans la configuration sur-mesure de leurs espaces OZIOW et bénéficiez de marges privilégiées.
          </p>
        </div>

        <div className="glass-card p-6 border-purple-500/20">
          <span className="text-3xl">🤝</span>
          <h2 className="mt-4 text-xl font-bold text-white">Apporteurs d&apos;Affaires</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Recommandez la plateforme OZIOW et percevez des commissions récurrentes sur chaque abonnement souscrit par vos prospects.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center">
        <Link href="/contact" className="btn-primary">Rejoindre le Programme Partenaires</Link>
      </div>
    </div>
  );
}
