import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comment Yziow Révolutionne la Gestion Scolaire grâce à l'IA",
  description:
    "Étude de cas : comment la solution Yziow utilise les embeddings vectoriels et l'IA Concierge pour transformer l'expérience éducative.",
};

export default function ArticleYziowIA() {
  return (
    <article className="section mx-auto max-w-3xl" style={{ paddingTop: "3rem" }}>
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-indigo-400"
      >
        ← Retour au blog
      </Link>

      <span className="section-label">Étude de cas</span>
      <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
        Comment Yziow Révolutionne la Gestion Scolaire grâce à l&apos;Intelligence Artificielle
      </h1>
      <p className="mt-4 text-sm text-slate-500">19 juillet 2026 · 8 min de lecture</p>

      <div className="prose-custom mt-10 space-y-6 text-base leading-relaxed text-slate-300">
        <p>
          Yziow est la première solution verticale propulsée par la plateforme OZIOW. Conçue
          spécifiquement pour les établissements scolaires, elle transforme la gestion
          quotidienne grâce à l&apos;intelligence artificielle et une architecture cloud
          moderne.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Le Défi de la Gestion Scolaire en 2026
        </h2>
        <p>
          En Afrique subsaharienne, plus de 70% des établissements scolaires privés utilisent
          encore des feuilles Excel, des registres papier ou des logiciels obsolètes pour
          gérer leurs opérations. Les parents appellent le secrétariat pour des questions
          simples (« À quelle heure est la réunion ? »), les enseignants manquent de visibilité
          sur les absences, et les directeurs naviguent à l&apos;aveugle sans tableau de bord.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          L&apos;IA Concierge : Un Assistant qui Ne Dort Jamais
        </h2>
        <p>
          Le cœur de l&apos;innovation de Yziow réside dans son IA Concierge. Alimenté par
          OpenAI (GPT-4) et des embeddings vectoriels stockés dans PostgreSQL via pgvector,
          cet assistant est capable de répondre en langage naturel à n&apos;importe quelle
          question des parents, élèves ou enseignants.
        </p>
        <p>
          <strong>Comment ça fonctionne :</strong>
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>Le directeur importe le règlement intérieur, les horaires et les circulaires en PDF.</li>
          <li>OZIOW découpe automatiquement ces documents en segments et génère des vecteurs d&apos;embeddings (1536 dimensions) via le modèle <code className="rounded bg-white/5 px-1.5 py-0.5 text-indigo-400">text-embedding-3-small</code>.</li>
          <li>Les vecteurs sont stockés dans une colonne pgvector de la base de données PostgreSQL.</li>
          <li>Quand un parent pose une question, l&apos;IA effectue une recherche de similarité vectorielle pour trouver les passages les plus pertinents.</li>
          <li>Ces passages sont injectés comme contexte dans la requête GPT-4 pour générer une réponse précise et sourcée.</li>
        </ol>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Architecture Multi-Tenant : Un Groupe, Plusieurs Écoles
        </h2>
        <p>
          Un groupe scolaire gérant 5 établissements peut les administrer depuis un seul
          tableau de bord, tout en garantissant que les données de chaque école sont
          complètement isolées. L&apos;architecture multi-tenant d&apos;OZIOW permet :
        </p>
        <ul className="list-disc ml-5 space-y-2">
          <li>Isolation complète des données par école (Row-Level Security PostgreSQL)</li>
          <li>Rôles et permissions personnalisés par établissement</li>
          <li>Tableau de bord consolidé pour le groupe</li>
          <li>Facturation séparée ou regroupée</li>
        </ul>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Résultats du Pilote
        </h2>
        <p>
          Le déploiement pilote de Yziow a démontré des résultats encourageants :
        </p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>Réduction de 80%</strong> des appels au secrétariat grâce à l&apos;IA Concierge</li>
          <li><strong>Latence API de 14ms</strong> pour le health check complet (API + base de données)</li>
          <li><strong>Uptime de 99.9%</strong> sur l&apos;infrastructure Render + Supabase</li>
          <li><strong>Temps de réponse IA de 1.2s</strong> incluant le roundtrip OpenAI</li>
        </ul>

        <h2 className="!mt-10 text-xl font-bold text-white">
          La Suite
        </h2>
        <p>
          Yziow continue d&apos;évoluer avec de nouvelles fonctionnalités en préparation :
          intégration des paiements Mobile Money, notifications SMS aux parents, et un
          portail élève dédié. La plateforme OZIOW sur laquelle elle repose garantit que
          chaque nouvelle fonctionnalité est immédiatement disponible pour tous les
          établissements connectés.
        </p>
      </div>

      <div className="mt-12 border-t border-white/5 pt-8">
        <Link href="/solutions#yziow" className="btn-primary">
          Découvrir Yziow
        </Link>
      </div>
    </article>
  );
}
