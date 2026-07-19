import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Découvrez la vision, la mission et les valeurs fondatrices d'OZIOW — la plateforme SaaS intelligente pour l'Afrique et au-delà.",
};

const values = [
  {
    icon: "🌍",
    title: "Impact Local, Vision Globale",
    description:
      "Nous construisons des outils qui résolvent des problèmes concrets pour les organisations africaines, avec une architecture qui peut servir le monde entier.",
  },
  {
    icon: "🔓",
    title: "Accessibilité",
    description:
      "Les technologies Enterprise — IA, multi-tenant, sécurité avancée — ne devraient pas être réservées aux grandes entreprises. OZIOW les rend accessibles à tous.",
  },
  {
    icon: "🧩",
    title: "Modularité",
    description:
      "Pas de logiciel monolithique. Activez uniquement les modules dont vous avez besoin, quand vous en avez besoin. Votre outil évolue avec vous.",
  },
  {
    icon: "🛡️",
    title: "Confiance & Transparence",
    description:
      "Sécurité de niveau bancaire, tarifs transparents, documentation ouverte. Vos données vous appartiennent, toujours.",
  },
];

const milestones = [
  { date: "Q1 2026", event: "Conception de l'architecture OZIOW", status: "done" },
  { date: "Q2 2026", event: "Développement du moteur SaaS multi-tenant", status: "done" },
  { date: "Juillet 2026", event: "Lancement de Yziow — Gestion Scolaire IA", status: "done" },
  { date: "Q3 2026", event: "Paiements Stripe + Mobile Money", status: "progress" },
  { date: "Q4 2026", event: "Lancement de Mediow — Gestion de Cliniques", status: "planned" },
  { date: "Q1 2027", event: "Marketplace publique de modules", status: "planned" },
  { date: "Q2 2027", event: "Programme d'affiliation et parrainage", status: "planned" },
];

export default function AboutPage() {
  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="about-title">
        <div className="glow-indigo -top-40 left-1/3 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Notre Histoire</span>
          <h1 id="about-title" className="section-title mt-6">
            Construire l&apos;infrastructure{" "}
            <span className="gradient-text">SaaS de demain</span>
          </h1>
          <p className="section-subtitle mx-auto text-center">
            OZIOW est née d&apos;une conviction : les organisations africaines méritent
            des outils aussi puissants que ceux des grandes entreprises mondiales,
            à un prix accessible et avec une IA intégrée nativement.
          </p>
        </div>
      </section>

      {/* ─── VISION & MISSION ────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="section">
          <div className="grid gap-12 md:grid-cols-2">
            <div className="glass-card p-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                Notre Vision
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-300">
                Un monde où chaque organisation — quelle que soit sa taille, son secteur
                ou sa localisation — dispose d&apos;outils numériques intelligents pour
                servir sa communauté avec excellence.
              </p>
            </div>
            <div className="glass-card p-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                Notre Mission
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-300">
                Démocratiser l&apos;accès aux technologies Enterprise — IA, architecture
                cloud, sécurité avancée — en les rendant modulaires, abordables et
                immédiatement opérationnelles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── VALEURS ─────────────────────────────────────── */}
      <section className="border-t border-white/5" aria-labelledby="values-title">
        <div className="section">
          <div className="text-center">
            <span className="section-label">Nos Valeurs</span>
            <h2 id="values-title" className="section-title">
              Ce qui guide chacune de nos décisions
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <div key={value.title} className="glass-card p-6">
                <span className="text-3xl">{value.icon}</span>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ROADMAP ─────────────────────────────────────── */}
      <section className="border-t border-white/5 grid-pattern" aria-labelledby="roadmap-title">
        <div className="glow-purple -bottom-20 right-1/3 animate-pulse-glow" />
        <div className="section relative z-10">
          <div className="text-center">
            <span className="section-label">Roadmap</span>
            <h2 id="roadmap-title" className="section-title">
              Notre feuille de route
            </h2>
          </div>
          <div className="mx-auto mt-12 max-w-2xl space-y-0">
            {milestones.map((ms, i) => (
              <div key={ms.event} className="flex gap-6">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`h-4 w-4 rounded-full border-2 ${
                      ms.status === "done"
                        ? "border-emerald-500 bg-emerald-500"
                        : ms.status === "progress"
                        ? "border-indigo-500 bg-indigo-500 animate-pulse"
                        : "border-slate-600 bg-transparent"
                    }`}
                  />
                  {i < milestones.length - 1 && (
                    <div className="w-px flex-1 bg-white/10" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-8">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {ms.date}
                  </p>
                  <p
                    className={`mt-1 text-sm font-medium ${
                      ms.status === "done"
                        ? "text-white"
                        : ms.status === "progress"
                        ? "text-indigo-400"
                        : "text-slate-500"
                    }`}
                  >
                    {ms.event}
                    {ms.status === "done" && (
                      <span className="ml-2 text-emerald-400">✓</span>
                    )}
                    {ms.status === "progress" && (
                      <span className="ml-2 text-indigo-400">⟳</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="section text-center">
          <h2 className="section-title">Rejoignez l&apos;aventure</h2>
          <p className="section-subtitle mx-auto text-center">
            Que vous soyez un établissement scolaire, une clinique, une ONG ou un
            entrepreneur, OZIOW est conçue pour vous accompagner dans votre
            transformation numérique.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="btn-primary">
              Nous contacter
            </Link>
            <Link href="/solutions" className="btn-secondary">
              Voir les solutions
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
