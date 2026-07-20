import Link from "next/link";
import { notFound } from "next/navigation";
import { SAAS_REGISTRY } from "../../../config/saas-registry";

export function generateStaticParams() {
  return SAAS_REGISTRY.map((saas) => ({
    id: saas.id,
  }));
}

export default async function SaasDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saas = SAAS_REGISTRY.find((item) => item.id === id);

  if (!saas) {
    notFound();
  }

  return (
    <>
      <section className="relative overflow-hidden grid-pattern pt-32 pb-20" aria-labelledby="saas-detail-title">
        <div className="glow-indigo -top-40 right-1/4 animate-pulse-glow" />
        <div className="section">
          <Link href="/marketplace" className="text-xs text-indigo-400 font-semibold mb-6 inline-block hover:underline">
            ← Retour à la Marketplace
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-5xl">{saas.icon}</span>
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">{saas.category}</span>
              <h1 id="saas-detail-title" className="text-4xl font-extrabold text-white sm:text-5xl">
                {saas.name}
              </h1>
            </div>
          </div>
          <p className="mt-4 text-xl font-medium text-slate-300 max-w-3xl">{saas.tagline}</p>
          <p className="mt-4 text-base text-slate-400 max-w-3xl leading-relaxed">{saas.description}</p>

          <div className="mt-8 flex gap-4">
            <Link href="/contact" className="btn-primary">
              Demander un Accès / Démo
            </Link>
            <Link href="/tarifs" className="btn-secondary">
              Voir les Tarifs
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-16">
        <div className="section grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">✨ Fonctionnalités Clés</h2>
            <ul className="space-y-4">
              {saas.features.map((feat) => (
                <li key={feat} className="flex items-start gap-3 text-slate-300 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs text-indigo-400 font-bold">✓</span>
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card p-8 border-indigo-500/20">
            <h2 className="text-2xl font-bold text-white mb-6">👥 Utilisateurs &amp; Clients Cibles</h2>
            <div className="space-y-3">
              {saas.targetAudience.map((aud) => (
                <div key={aud} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold text-slate-200">
                  🏢 {aud}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
