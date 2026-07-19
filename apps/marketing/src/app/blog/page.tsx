import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Actualités, tutoriels et études de cas sur OZIOW et le SaaS intelligent.",
};

const articles = [
  { slug: "oziow-plateforme-saas-intelligente", title: "OZIOW : La Plateforme SaaS Intelligente qui Repense la Gestion Métier", excerpt: "Découvrez comment OZIOW combine l'IA, une architecture multi-tenant sécurisée et un catalogue de modules pour transformer la gestion des organisations.", category: "Annonce", date: "19 juillet 2026", readTime: "6 min", gradient: "from-indigo-500 to-purple-600" },
  { slug: "yziow-ia-education", title: "Comment Yziow Révolutionne la Gestion Scolaire grâce à l'IA", excerpt: "Étude de cas : comment Yziow utilise les embeddings vectoriels et l'IA Concierge pour transformer l'expérience éducative.", category: "Étude de cas", date: "19 juillet 2026", readTime: "8 min", gradient: "from-blue-500 to-cyan-600" },
  { slug: "securite-multi-tenant-saas", title: "Sécurité Multi-Tenant : Comment Protéger les Données dans un SaaS Moderne", excerpt: "Plongée technique dans le Row-Level Security de PostgreSQL, l'isolation des données et les meilleures pratiques de sécurité SaaS.", category: "Technique", date: "19 juillet 2026", readTime: "10 min", gradient: "from-emerald-500 to-teal-600" },
];

export default function BlogPage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="blog-title">
        <div className="glow-indigo -top-40 left-1/4 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Blog</span>
          <h1 id="blog-title" className="section-title mt-6">Actualités &amp; <span className="gradient-text">Ressources</span></h1>
          <p className="section-subtitle mx-auto text-center">Tutoriels, études de cas et réflexions sur l&apos;avenir du SaaS intelligent.</p>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="section">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link key={article.slug} href={`/blog/${article.slug}`} className="glass-card group flex flex-col overflow-hidden p-0">
                <div className={`h-48 bg-gradient-to-br ${article.gradient} flex items-center justify-center`}>
                  <span className="text-6xl font-black text-white/20">O</span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">{article.category}</span>
                    <span className="text-xs text-slate-500">{article.readTime}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">{article.title}</h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{article.excerpt}</p>
                  <p className="mt-4 text-xs text-slate-500">{article.date}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
