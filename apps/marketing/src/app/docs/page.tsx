import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Centre d'aide OZIOW : guides de démarrage, documentation API, FAQ et ressources.",
};

const guides = [
  { icon: "🚀", title: "Démarrage Rapide", description: "Créez votre premier tenant et déployez en moins de 10 minutes.", tag: "Essentiel" },
  { icon: "🏗️", title: "Architecture Multi-Tenant", description: "Comprendre l'isolation des données et le Row-Level Security.", tag: "Architecture" },
  { icon: "🤖", title: "IA Concierge", description: "Configurer l'assistant IA, importer des PDF et utiliser les embeddings.", tag: "IA" },
  { icon: "🔐", title: "Authentification", description: "JWT, refresh tokens, RBAC et permissions granulaires.", tag: "Sécurité" },
  { icon: "🔌", title: "Intégration API", description: "API RESTful versionnée, clés API et rate limiting.", tag: "API" },
  { icon: "💳", title: "Paiements", description: "Configurer Stripe, Paystack et le Mobile Money.", tag: "Facturation" },
];

const faqs = [
  { q: "Qu'est-ce qu'OZIOW ?", a: "OZIOW est une plateforme SaaS modulaire qui permet aux organisations de créer et déployer leurs applications métiers avec l'IA." },
  { q: "Comment fonctionne l'IA Concierge ?", a: "L'IA Concierge utilise OpenAI et des embeddings vectoriels (pgvector) pour répondre en langage naturel à partir de votre documentation." },
  { q: "Mes données sont-elles sécurisées ?", a: "Oui. Le Row-Level Security de PostgreSQL isole complètement les données de chaque tenant au niveau de la base de données." },
  { q: "Y a-t-il une API disponible ?", a: "Oui, OZIOW expose une API RESTful versionnée complète avec documentation Swagger interactive." },
];

export default function DocsPage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="docs-title">
        <div className="glow-indigo -top-40 right-1/3 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Centre d&apos;Aide</span>
          <h1 id="docs-title" className="section-title mt-6"><span className="gradient-text">Documentation</span> &amp; Ressources</h1>
          <p className="section-subtitle mx-auto text-center">Tout ce dont vous avez besoin pour intégrer et configurer OZIOW.</p>
        </div>
      </section>

      <section id="guides" className="border-t border-white/5" aria-labelledby="guides-title">
        <div className="section">
          <h2 id="guides-title" className="text-xl font-bold text-white mb-8">📖 Guides de Démarrage</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <div key={g.title} className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{g.icon}</span>
                  <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">{g.tag}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-white">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{g.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="api" className="border-t border-white/5" aria-labelledby="api-title">
        <div className="section">
          <div className="glass-card flex flex-col items-center p-10 text-center md:flex-row md:text-left md:justify-between">
            <div>
              <h2 id="api-title" className="text-xl font-bold text-white">🔌 Documentation API Interactive</h2>
              <p className="mt-2 max-w-lg text-sm text-slate-400">Explorez notre API RESTful avec Swagger. Testez les endpoints en direct.</p>
            </div>
            <Link href="https://api.oziow.com/v1/docs" target="_blank" rel="noopener noreferrer" className="btn-primary mt-6 md:mt-0 shrink-0">
              Ouvrir Swagger
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-white/5" aria-labelledby="faq-title">
        <div className="section">
          <div className="text-center">
            <span className="section-label">FAQ</span>
            <h2 id="faq-title" className="section-title">Questions Fréquentes</h2>
          </div>
          <div className="mx-auto mt-10 max-w-3xl space-y-5">
            {faqs.map((faq) => (
              <div key={faq.q} className="glass-card p-6">
                <h3 className="text-base font-semibold text-white">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
