import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espace Développeurs",
  description: "Documentation API Gateway, SDKs, Webhooks et guides d'intégration pour développeurs.",
};

export default function DeveloppeursPage() {
  return (
    <div className="section mx-auto max-w-5xl" style={{ paddingTop: "4rem" }}>
      <span className="section-label">Documentation Technique</span>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Hub Développeurs &amp; APIs</h1>
      <p className="mt-4 text-lg text-slate-400">
        Tout ce dont vous avez besoin pour intégrer les APIs d&apos;OZIOW, configurer des Webhooks ou construire votre propre SaaS métier.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        <div className="glass-card p-6">
          <span className="text-3xl">🔌</span>
          <h2 className="mt-4 text-lg font-bold text-white">API RESTful &amp; Swagger</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Spécification OpenAPI complète et console interactive Swagger.</p>
          <a href="https://api.oziow.com/v1/docs" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs font-bold text-indigo-400 hover:underline">
            Explorer Swagger →
          </a>
        </div>

        <div className="glass-card p-6">
          <span className="text-3xl">⚡</span>
          <h2 className="mt-4 text-lg font-bold text-white">Webhooks &amp; Events</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Événements en temps réel pour synchroniser vos systèmes externes.</p>
          <Link href="/docs" className="mt-4 inline-block text-xs font-bold text-indigo-400 hover:underline">
            Lire le Guide →
          </Link>
        </div>

        <div className="glass-card p-6">
          <span className="text-3xl">📦</span>
          <h2 className="mt-4 text-lg font-bold text-white">Client SDKs</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">Bibliothèques clients pour TypeScript/Node.js et Python.</p>
          <Link href="/docs" className="mt-4 inline-block text-xs font-bold text-indigo-400 hover:underline">
            Télécharger les SDKs →
          </Link>
        </div>
      </div>
    </div>
  );
}
