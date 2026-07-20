export function WhyOziowComparison() {
  return (
    <section className="section border-t border-white/5" aria-labelledby="why-oziow-title">
      <div className="text-center">
        <span className="section-label">En Moins de 30 Secondes</span>
        <h2 id="why-oziow-title" className="section-title mt-4">
          Pourquoi choisir <span className="gradient-text">OZIOW</span> ?
        </h2>
        <p className="section-subtitle mx-auto text-center">
          Comparez en un clin d&apos;œil ce qui différencie la plateforme OZIOW des approches de développement classiques.
        </p>
      </div>

      <div className="mt-16 grid gap-8 md:grid-cols-3">
        {/* Développement Traditionnel */}
        <div className="glass-card p-8 border-red-500/20 bg-red-950/10">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">❌</span>
            <div>
              <h3 className="text-lg font-bold text-white">Développement Custom</h3>
              <p className="text-xs text-slate-400">À partir de zéro (From scratch)</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex items-center gap-2">⚠️ 6 à 12 mois de développement</li>
            <li className="flex items-center gap-2">⚠️ RLS &amp; Multi-Tenant complexe à concevoir</li>
            <li className="flex items-center gap-2">⚠️ Intégration IA RAG manuelle et coûteuse</li>
            <li className="flex items-center gap-2">⚠️ Maintenance et sécurité à votre charge</li>
          </ul>
        </div>

        {/* Plateformes Monolithiques */}
        <div className="glass-card p-8 border-amber-500/20 bg-amber-950/10">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="text-lg font-bold text-white">SaaS Génériques</h3>
              <p className="text-xs text-slate-400">Solutions rigides et fermées</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex items-center gap-2">⚠️ Inadaptés aux spécificités de votre secteur</li>
            <li className="flex items-center gap-2">⚠️ Données mélangées sans isolation stricte</li>
            <li className="flex items-center gap-2">⚠️ Pas d&apos;IA Concierge contextuelle sur vos PDF</li>
            <li className="flex items-center gap-2">⚠️ Impossible de publier vos propres SaaS</li>
          </ul>
        </div>

        {/* La Solution OZIOW */}
        <div className="glass-card p-8 border-emerald-500/30 bg-emerald-950/20 ring-1 ring-emerald-500/30 relative">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black">
            Recommandé
          </span>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">🚀</span>
            <div>
              <h3 className="text-lg font-bold text-white">La Plateforme OZIOW</h3>
              <p className="text-xs text-emerald-400 font-semibold">Le Moteur SaaS + Marketplace</p>
            </div>
          </div>
          <ul className="space-y-3 text-sm text-slate-200">
            <li className="flex items-center gap-2">✅ Lancement immédiat en 1 clic</li>
            <li className="flex items-center gap-2">✅ Isolation RLS native au niveau PostgreSQL</li>
            <li className="flex items-center gap-2">✅ IA Concierge &amp; RAG Vectoriel clé en main</li>
            <li className="flex items-center gap-2">✅ Marketplace d&apos;applications &amp; Éditeurs Tiers</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
