export interface EcosystemLink {
  title: string;
  href: string;
  description: string;
  icon: string;
  tag: string;
  status: "active" | "coming_soon";
}

export const ECOSYSTEM_SECTIONS: EcosystemLink[] = [
  {
    title: "Partenaires",
    href: "/partenaires",
    description: "Rejoignez l'écosystème d'intégrateurs, d'agences et d'apporteurs d'affaires OZIOW. Développez votre activité en accompagnant nos clients.",
    icon: "🤝",
    tag: "Business",
    status: "active",
  },
  {
    title: "Développeurs",
    href: "/developpeurs",
    description: "Accédez à la documentation de l'API Gateway, aux SDKs clients, à la spécification OpenAPI (Swagger) et aux guides d'intégration Webhooks.",
    icon: "💻",
    tag: "Technique",
    status: "active",
  },
  {
    title: "Communauté",
    href: "/communaute",
    description: "Échangez avec les autres éditeurs de SaaS et utilisateurs de la plateforme. Partagez vos retours d'expérience et suggérez des fonctionnalités.",
    icon: "💬",
    tag: "Entraide",
    status: "active",
  },
  {
    title: "Centre de Ressources",
    href: "/ressources",
    description: "Guides sectoriels, livres blancs, tutoriels vidéo et études de cas pour maximiser le succès de votre SaaS métier.",
    icon: "📚",
    tag: "Savoir",
    status: "active",
  },
  {
    title: "Statut de la Plateforme",
    href: "/statut",
    description: "Consultez en direct l'état des services OZIOW (API, Multi-tenant, IA Concierge, Base de données RLS) et le taux de disponibilité (SLA 99.99%).",
    icon: "🟢",
    tag: "Monitoring",
    status: "active",
  },
];
