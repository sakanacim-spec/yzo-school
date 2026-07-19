import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Découvrez les solutions verticales alimentées par la plateforme OZIOW : éducation, santé, commerce, ONG et plus encore.",
};

const liveSolutions = [
  {
    id: "yziow",
    name: "Yziow",
    category: "Gestion Scolaire",
    tagline: "La gestion scolaire réinventée par l'IA",
    gradient: "from-indigo-500 to-blue-600",
    description:
      "Yziow est la première solution verticale propulsée par OZIOW. Elle transforme la gestion des établissements scolaires grâce à l'intelligence artificielle, une base de connaissances vectorielle et une architecture multi-tenant sécurisée.",
    features: [
      "Gestion multi-établissements avec isolation des données",
      "Assistant IA Concierge pour parents, élèves et enseignants",
      "Base de connaissances intelligente (RAG + pgvector)",
      "Gestion des rôles granulaire (Directeur, Enseignant, Parent, Élève)",
      "Tableau de bord analytique en temps réel",
      "Import de documents PDF avec embeddings automatiques",
      "Notifications multi-canal (Email, SMS, Push)",
      "Facturation et paiements intégrés",
    ],
  },
];

const upcomingSolutions = [
  { id: "sante", name: "Mediow", category: "Santé", tagline: "Gestion de cliniques et cabinets médicaux", gradient: "from-emerald-500 to-teal-600", features: ["Dossiers patients numériques", "Prise de rendez-vous IA", "Ordonnances électroniques", "Conformité RGPD Santé"] },
  { id: "commerce", name: "Shopow", category: "Commerce", tagline: "ERP et gestion commerciale intelligente", gradient: "from-orange-500 to-red-500", features: ["Gestion des stocks IA", "Point de vente multi-devises", "Facturation automatique", "Analytics prédictifs"] },
  { id: "ong", name: "Ngo-ow", category: "ONG & Associations", tagline: "Suivi de projets et gestion des donateurs", gradient: "from-pink-500 to-rose-600", features: ["Suivi de projets terrain", "Gestion des donateurs", "Rapports d'impact automatisés", "Conformité bailleurs"] },
  { id: "eglise", name: "Churchow", category: "Églises & Communautés", tagline: "Gestion communautaire et pastorale", gradient: "from-amber-500 to-yellow-600", features: ["Annuaire des membres", "Gestion des événements", "Dons et offrandes en ligne", "Communication ciblée"] },
  { id: "immo", name: "Immow", category: "Immobilier", tagline: "Gestion locative et immobilière", gradient: "from-cyan-500 to-blue-500", features: ["Gestion des biens", "Suivi des loyers", "Contrats numériques", "Portail locataire"] },
];

export default function SolutionsPage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="solutions-title">
        <div className="glow-indigo -top-40 right-1/4 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Solutions Verticales</span>
          <h1 id="solutions-title" className="section-title mt-6">Un moteur SaaS, <span className="gradient-text">des solutions infinies</span></h1>
          <p className="section-subtitle mx-auto text-center">Chaque solution verticale OZIOW hérite de la puissance de la plateforme tout en s&apos;adaptant parfaitement aux besoins de son secteur d&apos;activité.</p>
        </div>
      </section>

      {liveSolutions.map((sol) => (
        <section key={sol.id} id={sol.id} className="border-t border-white/5" aria-labelledby={`${sol.id}-title`}>
          <div className="section">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">✅ Disponible</span>
                <h2 id={`${sol.id}-title`} className="mt-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">{sol.name} <span className="text-slate-500">— {sol.category}</span></h2>
                <p className="mt-2 text-lg font-medium text-indigo-400">{sol.tagline}</p>
                <p className="mt-4 text-base leading-relaxed text-slate-400">{sol.description}</p>
                <div className="mt-8 flex gap-4">
                  <Link href="/contact" className="btn-primary">Demander une démo</Link>
                  <Link href="/tarifs" className="btn-secondary">Voir les tarifs</Link>
                </div>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Fonctionnalités principales</h3>
                <ul className="mt-4 space-y-3">
                  {sol.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-3 text-sm text-slate-300">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs text-indigo-400">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-white/5 grid-pattern" aria-labelledby="upcoming-title">
        <div className="glow-purple -bottom-20 right-1/4 animate-pulse-glow" />
        <div className="section relative z-10">
          <div className="text-center">
            <span className="section-label">Roadmap</span>
            <h2 id="upcoming-title" className="section-title">Les prochaines solutions <span className="gradient-text-warm">en préparation</span></h2>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingSolutions.map((sol) => (
              <div key={sol.id} id={sol.id} className="glass-card p-6 opacity-80">
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${sol.gradient} text-sm font-black text-white`}>{sol.name.charAt(0)}</div>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-500">Bientôt</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{sol.name}</h3>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{sol.category}</p>
                <p className="mt-2 text-sm text-slate-400">{sol.tagline}</p>
                <ul className="mt-4 space-y-2">
                  {sol.features.map((feat) => (<li key={feat} className="flex items-center gap-2 text-xs text-slate-500"><span className="h-1 w-1 rounded-full bg-slate-600" />{feat}</li>))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/5">
        <div className="section text-center">
          <h2 className="section-title">Votre secteur n&apos;est pas listé ?</h2>
          <p className="section-subtitle mx-auto text-center">La plateforme OZIOW est conçue pour s&apos;adapter à n&apos;importe quel domaine métier.</p>
          <Link href="/contact" className="btn-primary mt-8">Nous contacter</Link>
        </div>
      </section>
    </>
  );
}
