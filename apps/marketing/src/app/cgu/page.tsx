import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions Générales d'Utilisation (CGU) des services SaaS OZIOW.",
};

export default function CGUPage() {
  return (
    <article className="section mx-auto max-w-4xl" style={{ paddingTop: "3rem" }}>
      <span className="section-label">Légal</span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white md:text-4xl">Conditions Générales d&apos;Utilisation</h1>
      <p className="mt-2 text-sm text-slate-400">Dernière mise à jour : 20 juillet 2026</p>
      
      <div className="mt-10 space-y-8 text-base leading-relaxed text-slate-300">
        <section>
          <h2 className="text-xl font-bold text-white mb-3">1. Objet du Service</h2>
          <p>OZIOW fournit une plateforme de logiciels en tant que service (SaaS) permettant de déployer et gérer des applications métiers intelligentes (dont Yziow pour la gestion scolaire).</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">2. Accès et Compte</h2>
          <p>L&apos;utilisateur est responsable de la confidentialité de ses identifiants de connexion et de toutes les activités effectuées sous son compte Super-Administrateur ou administrateur de tenant.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">3. Disponibilité et SLA</h2>
          <p>OZIOW s&apos;efforce d&apos;assurer une disponibilité minimale de 99.9% des services API et portails. Des fenêtres de maintenance planifiées peuvent intervenir et seront notifiées à l&apos;avance.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">4. Tarification et Abonnements</h2>
          <p>Les abonnements (Starter, Professional, Enterprise) sont facturés mensuellement ou annuellement sans engagement, sauf stipulation contraire dans un contrat Enterprise dédié.</p>
        </section>
      </div>
    </article>
  );
}
