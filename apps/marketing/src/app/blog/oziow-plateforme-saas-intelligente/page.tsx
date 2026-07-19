import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OZIOW : La Plateforme SaaS Intelligente qui Repense la Gestion Métier",
  description: "Découvrez comment OZIOW combine l'IA, une architecture multi-tenant sécurisée et des modules prêts à l'emploi.",
};

export default function ArticleOziowSaaS() {
  return (
    <article className="section mx-auto max-w-3xl" style={{ paddingTop: "3rem" }}>
      <Link href="/blog" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-indigo-400">← Retour au blog</Link>
      <span className="section-label">Annonce</span>
      <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">OZIOW : La Plateforme SaaS Intelligente qui Repense la Gestion Métier</h1>
      <p className="mt-4 text-sm text-slate-500">19 juillet 2026 · 6 min de lecture</p>
      <div className="mt-10 space-y-6 text-base leading-relaxed text-slate-300">
        <p>Dans un monde où les organisations jonglent entre des dizaines d&apos;outils déconnectés, OZIOW propose une vision radicalement différente : une plateforme SaaS unique, modulaire et alimentée par l&apos;intelligence artificielle.</p>
        <h2 className="!mt-10 text-xl font-bold text-white">Le Problème : La Fragmentation des Outils Métier</h2>
        <p>Aujourd&apos;hui, un directeur d&apos;école en Afrique de l&apos;Ouest utilise en moyenne 5 à 8 outils différents. Ces outils ne communiquent pas entre eux, les données sont dupliquées et la vision d&apos;ensemble est impossible.</p>
        <h2 className="!mt-10 text-xl font-bold text-white">La Solution : Une Plateforme, Des Solutions Infinies</h2>
        <p>OZIOW est une plateforme SaaS horizontale qui alimente des solutions verticales spécialisées. Le cœur fournit tous les composants techniques communs — authentification, gestion des rôles, IA, paiements, notifications — tandis que chaque solution verticale les orchestre pour son secteur.</p>
        <h2 className="!mt-10 text-xl font-bold text-white">L&apos;Intelligence Artificielle au Cœur</h2>
        <p>Chaque solution OZIOW intègre nativement un assistant IA Concierge. Alimenté par OpenAI et des embeddings vectoriels, cet assistant répond en langage naturel aux questions des utilisateurs en se basant sur la documentation propre à chaque organisation.</p>
        <h2 className="!mt-10 text-xl font-bold text-white">Sécurité Enterprise, Accessible à Tous</h2>
        <p>Grâce au Row-Level Security de PostgreSQL, les données de chaque client sont complètement isolées au niveau de la base de données. Même en cas de bug applicatif, il est physiquement impossible pour un tenant d&apos;accéder aux données d&apos;un autre.</p>
      </div>
      <div className="mt-12 border-t border-white/5 pt-8">
        <Link href="/contact" className="btn-primary">Demander une démo</Link>
      </div>
    </article>
  );
}
