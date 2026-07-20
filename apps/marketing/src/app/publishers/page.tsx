import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programme Éditeurs (Publishers)",
  description: "Publiez votre propre SaaS métier sur la plateforme OZIOW et bénéficiez de notre Moteur Core Multi-Tenant et IA.",
};

const benefits = [
  { icon: "⚡", title: "Moteur Core Clé en Main", desc: "Concentrez-vous sur votre logique métier. OZIOW gère le Multi-Tenant RLS, la sécurité, l'authentification et l'IA." },
  { icon: "🌍", title: "Distribution sur la Marketplace", desc: "Exposez immédiatement votre SaaS métier auprès de notre catalogue de clients finaux et d'organisations." },
  { icon: "💳", title: "Paiements Automatisés", desc: "Encaissez par cartes bancaires (Stripe) et Mobile Money (Paystack) avec gestion automatique des reversements." },
  { icon: "🤖", title: "IA Concierge & RAG Vectoriel", desc: "Offrez un assistant IA entraîné sur les documents de vos utilisateurs sans développer une seule ligne d'IA." },
];

export default function PublishersPage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="publishers-title">
        <div className="glow-indigo -top-40 right-1/3 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Programme Éditeurs Tiers</span>
          <h1 id="publishers-title" className="section-title mt-4">
            Construisez &amp; vendez votre SaaS <br />
            <span className="gradient-text">Powered by OZIOW</span>
          </h1>
          <p className="section-subtitle mx-auto text-center">
            Rejoignez notre réseau d&apos;éditeurs logiciels. Utilisez le moteur OZIOW pour lancer vos applications verticales 10x plus vite.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/contact" className="btn-primary">Rejoindre le Programme</Link>
            <Link href="/docs" className="btn-secondary">Consulter la Documentation</Link>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-16">
        <div className="section">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <div key={b.title} className="glass-card p-6">
                <span className="text-4xl">{b.icon}</span>
                <h3 className="mt-4 text-lg font-bold text-white">{b.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
