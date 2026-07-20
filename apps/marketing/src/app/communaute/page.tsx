import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Communauté OZIOW",
  description: "Rejoignez la communauté d'éditeurs et d'utilisateurs des solutions SaaS OZIOW.",
};

export default function CommunautePage() {
  return (
    <div className="section mx-auto max-w-5xl" style={{ paddingTop: "4rem" }}>
      <span className="section-label">Écosystème</span>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">La Communauté OZIOW</h1>
      <p className="mt-4 text-lg text-slate-400">
        Échangez avec les autres fondateurs, éditeurs de SaaS et administrateurs d&apos;établissements qui utilisent la plateforme au quotidien.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <div className="glass-card p-6">
          <span className="text-3xl">💬</span>
          <h2 className="mt-4 text-xl font-bold text-white">Forum &amp; Entraide</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">Posez vos questions, suggérez des fonctionnalités et partagez vos meilleures pratiques d&apos;utilisation.</p>
        </div>

        <div className="glass-card p-6">
          <span className="text-3xl">💡</span>
          <h2 className="mt-4 text-xl font-bold text-white">Roadmap Collaborative</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">Votez pour les prochains SaaS métiers et modules fonctionnels qui seront développés sur la plateforme.</p>
        </div>
      </div>
    </div>
  );
}
