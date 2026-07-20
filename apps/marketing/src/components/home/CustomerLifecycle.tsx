"use client";

const steps = [
  { step: "1", title: "Découverte", desc: "Marketplace & Hub OZIOW", icon: "🔍" },
  { step: "2", title: "Essai Gratuit", desc: "14 jours ou Sandbox IA", icon: "🧪" },
  { step: "3", title: "Tenant Auto", desc: "Provisioning RLS instantané", icon: "⚡" },
  { step: "4", title: "Choix du Plan", desc: "Starter, Pro ou Enterprise", icon: "📋" },
  { step: "5", title: "Paiement", desc: "Stripe ou Mobile Money", icon: "💳" },
  { step: "6", title: "Production", desc: "Utilisation active avec IA", icon: "🚀" },
  { step: "7", title: "Support & SLA", desc: "Support 24/7 & Uptime 99.9%", icon: "🛠️" },
  { step: "8", title: "Renouvellement", desc: "Reconduction automatique", icon: "🔄" },
  { step: "9", title: "Parrainage", desc: "Affiliation & Commissions", icon: "🎁" },
];

export function CustomerLifecycle() {
  return (
    <section className="section border-t border-white/5" aria-labelledby="lifecycle-title">
      <div className="text-center">
        <span className="section-label">Parcours Client Harmonisé</span>
        <h2 id="lifecycle-title" className="section-title mt-4">
          Du premier clic au <span className="gradient-text">parrainage</span>
        </h2>
        <p className="section-subtitle mx-auto text-center">
          Un cycle de vie fluide et entièrement automatisé pour garantir la satisfaction et la fidélisation des utilisateurs de chaque SaaS.
        </p>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-9">
        {steps.map((s) => (
          <div key={s.step} className="glass-card flex flex-col items-center p-4 text-center relative group">
            <span className="text-3xl mb-2">{s.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Étape {s.step}</span>
            <h3 className="mt-1 text-xs font-bold text-white leading-tight">{s.title}</h3>
            <p className="mt-1 text-[11px] text-slate-400 leading-tight">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
