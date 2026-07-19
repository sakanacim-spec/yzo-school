import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Découvrez les offres OZIOW : Starter, Professional et Enterprise. Des tarifs transparents.",
};

const plans = [
  {
    name: "Starter", price: { monthly: 7, annual: 5 }, description: "Pour les petites structures.", cta: "Commencer", highlighted: false,
    features: [
      { name: "1 tenant", ok: true }, { name: "3 organisations max", ok: true }, { name: "50 utilisateurs max", ok: true }, { name: "5 modules", ok: true },
      { name: "IA Concierge (100 req/mois)", ok: true }, { name: "Knowledge Base (50 docs)", ok: true }, { name: "Support email", ok: true },
      { name: "API Access", ok: true }, { name: "Audit Logs (30j)", ok: true }, { name: "Paiements", ok: false }, { name: "Multi-langues", ok: false },
      { name: "Support prioritaire", ok: false }, { name: "SLA garanti", ok: false },
    ],
  },
  {
    name: "Professional", price: { monthly: 29, annual: 23 }, description: "Pour les organisations en croissance.", cta: "Essai gratuit 14j", highlighted: true,
    features: [
      { name: "1 tenant", ok: true }, { name: "15 organisations max", ok: true }, { name: "500 utilisateurs max", ok: true }, { name: "Tous les modules", ok: true },
      { name: "IA Concierge (1 000 req/mois)", ok: true }, { name: "Knowledge Base (500 docs)", ok: true }, { name: "Support email + chat", ok: true },
      { name: "API illimité", ok: true }, { name: "Audit Logs (1 an)", ok: true }, { name: "Paiements", ok: true }, { name: "Multi-langues (3)", ok: true },
      { name: "Support prioritaire", ok: false }, { name: "SLA 99.9%", ok: true },
    ],
  },
  {
    name: "Enterprise", price: { monthly: 99, annual: 79 }, description: "Pour les grandes organisations.", cta: "Contacter l'équipe", highlighted: false,
    features: [
      { name: "Tenants illimités", ok: true }, { name: "Organisations illimitées", ok: true }, { name: "Utilisateurs illimités", ok: true }, { name: "Tous les modules", ok: true },
      { name: "IA Concierge illimité", ok: true }, { name: "Knowledge Base illimitée", ok: true }, { name: "Support dédié 24/7", ok: true },
      { name: "API illimité", ok: true }, { name: "Audit Logs illimité", ok: true }, { name: "Paiements", ok: true }, { name: "Multi-langues illimité", ok: true },
      { name: "Support prioritaire", ok: true }, { name: "SLA 99.99%", ok: true },
    ],
  },
];

const faqs = [
  { q: "Puis-je changer de plan ?", a: "Oui, à tout moment. La différence est calculée au prorata." },
  { q: "Y a-t-il un engagement ?", a: "Non, tous les plans sont sans engagement. Annulez à tout moment." },
  { q: "Acceptez-vous le Mobile Money ?", a: "Oui, via Paystack (Orange Money, MTN, Wave) en plus de Stripe pour les cartes." },
];

export default function TarifsPage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="pricing-title">
        <div className="glow-purple -top-40 left-1/2 -translate-x-1/2 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "3rem" }}>
          <span className="section-label">Tarifs Transparents</span>
          <h1 id="pricing-title" className="section-title mt-6">Un plan pour chaque <span className="gradient-text">ambition</span></h1>
          <p className="section-subtitle mx-auto text-center">Pas de frais cachés. Pas d&apos;engagement. Évoluez à votre rythme.</p>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="section" style={{ paddingTop: "3rem" }}>
          <div className="grid gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className={`glass-card relative flex flex-col p-8 ${plan.highlighted ? "border-indigo-500/30 ring-1 ring-indigo-500/20 shadow-2xl shadow-indigo-500/10" : ""}`}>
                {plan.highlighted && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-1 text-xs font-bold text-white">Le plus populaire</span>}
                <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight gradient-text">${plan.price.monthly}</span>
                  <span className="text-sm text-slate-500">/mois</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">ou ${plan.price.annual}/mois facturé annuellement</p>
                <Link href="/contact" className={`mt-8 ${plan.highlighted ? "btn-primary" : "btn-secondary"} w-full text-center`}>{plan.cta}</Link>
                <ul className="mt-8 flex-1 space-y-3 border-t border-white/5 pt-8">
                  {plan.features.map((f) => (
                    <li key={f.name} className={`flex items-center gap-3 text-sm ${f.ok ? "text-slate-300" : "text-slate-600"}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${f.ok ? "bg-indigo-500/20 text-indigo-400" : "bg-white/5 text-slate-600"}`}>{f.ok ? "✓" : "—"}</span>
                      {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5" aria-labelledby="faq-pricing">
        <div className="section">
          <h2 id="faq-pricing" className="section-title text-center">Questions fréquentes</h2>
          <div className="mx-auto mt-10 max-w-3xl space-y-6">
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
