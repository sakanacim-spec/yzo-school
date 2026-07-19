import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion",
  description:
    "Accédez à votre espace OZIOW : portail Super-Administrateur, portails clients et applications métiers.",
};

const portals = [
  {
    icon: "🛡️",
    name: "Portail Super-Administrateur",
    description:
      "Gérez les tenants, les plans, les modules et la configuration globale de la plateforme OZIOW.",
    url: "https://admin.oziow.com",
    buttonLabel: "Accéder au portail admin",
    badge: "Production",
    badgeColor: "bg-emerald-500/15 text-emerald-400",
  },
  {
    icon: "🎓",
    name: "Yziow — Gestion Scolaire",
    description:
      "Portail dédié aux établissements scolaires : gestion des élèves, enseignants, parents et IA Concierge.",
    url: "#",
    buttonLabel: "Bientôt disponible",
    badge: "En développement",
    badgeColor: "bg-amber-500/15 text-amber-400",
    disabled: true,
  },
  {
    icon: "🏥",
    name: "Mediow — Gestion de Cliniques",
    description:
      "Portail dédié aux cliniques et cabinets médicaux : dossiers patients, rendez-vous, ordonnances.",
    url: "#",
    buttonLabel: "Bientôt disponible",
    badge: "Planifié",
    badgeColor: "bg-white/5 text-slate-500",
    disabled: true,
  },
  {
    icon: "🏪",
    name: "Shopow — Gestion Commerciale",
    description:
      "Portail dédié aux commerces : ERP, gestion des stocks, point de vente, facturation.",
    url: "#",
    buttonLabel: "Bientôt disponible",
    badge: "Planifié",
    badgeColor: "bg-white/5 text-slate-500",
    disabled: true,
  },
];

export default function ConnexionPage() {
  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="connexion-title">
        <div className="glow-purple -top-40 left-1/2 -translate-x-1/2 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "3rem" }}>
          <span className="section-label">Espace Connexion</span>
          <h1 id="connexion-title" className="section-title mt-6">
            Accédez à votre <span className="gradient-text">espace OZIOW</span>
          </h1>
          <p className="section-subtitle mx-auto text-center">
            Sélectionnez le portail correspondant à votre rôle pour accéder à
            votre application.
          </p>
        </div>
      </section>

      {/* ─── PORTALS GRID ────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="section">
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            {portals.map((portal) => (
              <div
                key={portal.name}
                className={`glass-card flex flex-col p-6 ${
                  portal.disabled ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{portal.icon}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${portal.badgeColor}`}
                  >
                    {portal.badge}
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-semibold text-white">
                  {portal.name}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                  {portal.description}
                </p>

                {portal.disabled ? (
                  <span className="btn-secondary mt-6 cursor-not-allowed opacity-50 text-center">
                    {portal.buttonLabel}
                  </span>
                ) : (
                  <a
                    href={portal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary mt-6 text-center"
                  >
                    {portal.buttonLabel}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Help section */}
          <div className="mx-auto mt-12 max-w-4xl text-center">
            <p className="text-sm text-slate-500">
              Vous n&apos;avez pas encore de compte ?{" "}
              <Link
                href="/contact"
                className="font-medium text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Contactez-nous pour créer votre espace
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
