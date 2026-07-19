import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sécurité Multi-Tenant : Comment Protéger les Données dans un SaaS Moderne",
  description:
    "Plongée technique dans le Row-Level Security de PostgreSQL, l'isolation des données et les meilleures pratiques de sécurité SaaS.",
};

export default function ArticleSecurite() {
  return (
    <article className="section mx-auto max-w-3xl" style={{ paddingTop: "3rem" }}>
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-indigo-400"
      >
        ← Retour au blog
      </Link>

      <span className="section-label">Technique</span>
      <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
        Sécurité Multi-Tenant : Comment Protéger les Données dans un SaaS Moderne
      </h1>
      <p className="mt-4 text-sm text-slate-500">19 juillet 2026 · 10 min de lecture</p>

      <div className="prose-custom mt-10 space-y-6 text-base leading-relaxed text-slate-300">
        <p>
          La sécurité des données est le fondement de toute plateforme SaaS multi-tenant.
          Un seul incident de fuite de données entre clients peut détruire la confiance et
          l&apos;entreprise tout entière. Chez OZIOW, nous avons adopté une approche de
          défense en profondeur qui garantit l&apos;isolation des données à chaque niveau
          de l&apos;architecture.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Qu&apos;est-ce que le Multi-Tenancy ?
        </h2>
        <p>
          Dans une architecture multi-tenant, une seule instance de l&apos;application sert
          plusieurs clients (tenants). Chaque tenant possède ses propres données, ses propres
          utilisateurs et sa propre configuration, mais partage la même infrastructure
          technique. C&apos;est le modèle utilisé par Salesforce, HubSpot et la plupart des
          SaaS modernes.
        </p>
        <p>
          Le défi critique est de garantir qu&apos;aucun tenant ne peut accéder aux données
          d&apos;un autre, même en cas de bug applicatif.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Niveau 1 : Row-Level Security (RLS) de PostgreSQL
        </h2>
        <p>
          OZIOW utilise le Row-Level Security de PostgreSQL comme première ligne de défense.
          Chaque table contenant des données de tenant possède une colonne
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-indigo-400">tenant_id</code> et une
          politique RLS qui filtre automatiquement les lignes :
        </p>
        <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-4 text-sm text-emerald-400">
{`-- Politique RLS sur la table saas_organizations
CREATE POLICY "tenant_isolation" ON saas_organizations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Chaque requête est automatiquement filtrée
-- Un tenant A ne peut JAMAIS voir les données du tenant B`}
        </pre>
        <p>
          Cette protection opère au niveau du moteur de base de données lui-même. Même si
          un développeur oublie un filtre <code className="rounded bg-white/5 px-1.5 py-0.5 text-indigo-400">WHERE tenant_id = ?</code>
          dans une requête, PostgreSQL bloque automatiquement l&apos;accès aux données
          des autres tenants.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Niveau 2 : Authentification JWT Multi-Couche
        </h2>
        <p>
          OZIOW utilise un système JWT (JSON Web Token) à double jeton :
        </p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>Access Token</strong> (15 min) : Contient l&apos;identité de l&apos;utilisateur, son tenant_id et ses rôles. Utilisé pour chaque requête API.</li>
          <li><strong>Refresh Token</strong> (7 jours) : Permet de renouveler l&apos;Access Token sans re-saisir le mot de passe. Stocké de manière sécurisée côté client.</li>
        </ul>
        <p>
          Le <code className="rounded bg-white/5 px-1.5 py-0.5 text-indigo-400">tenant_id</code> est
          encodé dans le JWT et vérifié à chaque requête par un Guard NestJS. Il est
          impossible de modifier le tenant_id d&apos;un token sans invalider sa signature
          cryptographique.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Niveau 3 : RBAC Granulaire
        </h2>
        <p>
          Le contrôle d&apos;accès basé sur les rôles (Role-Based Access Control) d&apos;OZIOW
          permet de définir des permissions fines pour chaque utilisateur au sein de son
          tenant :
        </p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>PLATFORM_OWNER</strong> : Accès total à la plateforme et tous les tenants</li>
          <li><strong>TENANT_ADMIN</strong> : Administrateur d&apos;un tenant spécifique</li>
          <li><strong>ORG_ADMIN</strong> : Administrateur d&apos;une organisation au sein d&apos;un tenant</li>
          <li><strong>MEMBER</strong> : Utilisateur standard avec accès limité</li>
        </ul>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Niveau 4 : Journaux d&apos;Audit
        </h2>
        <p>
          Chaque action critique est enregistrée dans la table
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-indigo-400">saas_audit_logs</code> avec
          un horodatage, l&apos;identité de l&apos;utilisateur, l&apos;adresse IP, le type
          d&apos;action et les données avant/après modification. Ces journaux sont
          immuables et exportables pour les audits de conformité RGPD.
        </p>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Niveau 5 : Chiffrement et Infrastructure
        </h2>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>HTTPS/TLS</strong> : Toutes les communications sont chiffrées via des certificats Let&apos;s Encrypt.</li>
          <li><strong>Chiffrement au repos</strong> : Les bases de données Supabase sont chiffrées avec AES-256.</li>
          <li><strong>Rate Limiting</strong> : Protection contre les attaques par force brute (100 requêtes/minute par IP).</li>
          <li><strong>CORS strict</strong> : Seuls les domaines autorisés peuvent communiquer avec l&apos;API.</li>
          <li><strong>Hébergement EU</strong> : Les serveurs sont hébergés à Francfort (Allemagne) pour la conformité RGPD.</li>
        </ul>

        <h2 className="!mt-10 text-xl font-bold text-white">
          Conclusion
        </h2>
        <p>
          La sécurité d&apos;une plateforme SaaS multi-tenant ne peut pas être un ajout
          tardif. Chez OZIOW, elle est intégrée dans l&apos;architecture dès la première
          ligne de code, de la base de données au réseau, en passant par l&apos;application.
          C&apos;est cette approche qui permet à nos clients de confier leurs données les plus
          sensibles à la plateforme en toute sérénité.
        </p>
      </div>

      <div className="mt-12 border-t border-white/5 pt-8">
        <Link href="/docs" className="btn-primary">
          Lire la documentation technique
        </Link>
      </div>
    </article>
  );
}
