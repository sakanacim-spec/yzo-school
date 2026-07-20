import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de Confidentialité",
  description: "Politique de confidentialité et protection des données personnelles sur OZIOW.",
};

export default function ConfidentialitePage() {
  return (
    <article className="section mx-auto max-w-4xl" style={{ paddingTop: "3rem" }}>
      <span className="section-label">Légal</span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">Politique de Confidentialité</h1>
      <p className="mt-2 text-sm text-slate-400">Dernière mise à jour : 20 juillet 2026</p>
      
      <div className="mt-10 space-y-8 text-base leading-relaxed text-slate-300">
        <section>
          <h2 className="text-xl font-bold text-white mb-3">1. Collecte des Données</h2>
          <p>OZIOW collecte les informations strictement nécessaires à la fourniture de nos services SaaS. Cela inclut votre nom, adresse email, nom d&apos;organisation et données d&apos;utilisation lors de la création d&apos;un compte.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">2. Isolation des Données (Multi-Tenant)</h2>
          <p>Grâce à notre architecture basée sur le Row-Level Security (RLS) de PostgreSQL, les données de chaque organisation (tenant) sont hermétiquement isolées. Aucun tiers ou autre tenant ne peut accéder à vos données d&apos;entreprise ou scolaires.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">3. Utilisation de l&apos;IA et des Embeddings</h2>
          <p>Les documents importés dans la base de connaissances vectorielle (IA Concierge) sont traités exclusivement pour votre tenant. Vos données ne sont pas utilisées pour réentraîner des modèles d&apos;IA publics.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">4. Vos Droits (RGPD)</h2>
          <p>Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;exportation et de suppression de toutes vos données. Pour exercer ce droit, contactez-nous à <a href="mailto:privacy@oziow.com" className="text-indigo-400 underline">privacy@oziow.com</a>.</p>
        </section>
      </div>
    </article>
  );
}
