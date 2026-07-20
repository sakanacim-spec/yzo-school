// ============================================================
// @saas/types — Source Unique de Vérité Registre Multi-SaaS
// Registre partagé entre Backend API, Marketing, Admin Portal & Marketplace
// ============================================================

export interface SaaSDefinition {
  id: string;
  name: string;
  category: "education" | "health" | "commerce" | "community" | "realestate" | "ngo";
  categoryLabel: string;
  tagline: string;
  description: string;
  publisher: "OZIOW Official" | "Third-Party Publisher";
  status: "active" | "beta" | "roadmap";
  modules: string[]; // Modules requis (ex: ["auth", "billing", "ai-concierge"])
  priceMonthly: number;
  route: string;
  icon: string;
  gradient: string;
  targetAudience: string[];
  features: string[];
}

export interface TenantApp {
  id: string;
  tenantId: string;
  saasId: string;
  status: "active" | "trial" | "suspended" | "cancelled";
  modules: string[];
  activatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const SHARED_SAAS_REGISTRY: SaaSDefinition[] = [
  {
    id: "yziow",
    name: "Yziow",
    category: "education",
    categoryLabel: "Gestion Scolaire",
    tagline: "La gestion scolaire intelligente alimentée par l'IA",
    description: "Solution complète de gestion d'établissements scolaires (écoles, collèges, lycées, universités). Intègre un Assistant IA Concierge pour parents, enseignants et directeurs.",
    publisher: "OZIOW Official",
    status: "active",
    modules: ["auth", "billing", "ai-concierge", "notifications", "files"],
    priceMonthly: 29,
    route: "/solutions/yziow",
    icon: "🎓",
    gradient: "from-indigo-500 to-blue-600",
    targetAudience: ["Écoles primaires", "Lycées & Collèges", "Universités", "Centres de formation"],
    features: [
      "Gestion multi-établissements avec isolation des données (RLS)",
      "Assistant IA Concierge pour parents, élèves et enseignants",
      "Base de connaissances vectorielle (RAG + pgvector)",
      "Gestion des rôles (Directeur, Enseignant, Parent, Élève)",
      "Tableau de bord analytique en temps réel",
      "Import de documents PDF avec embeddings automatiques",
      "Notifications multi-canal (Email, SMS, Push)",
      "Facturation et paiements des scolarités intégrés",
    ],
  },
  {
    id: "mediow",
    name: "Mediow",
    category: "health",
    categoryLabel: "Santé & Cliniques",
    tagline: "Gestion de cliniques et cabinets médicaux",
    description: "Solution SaaS dédiée aux professionnels de santé : dossiers patients sécurisés, prise de rendez-vous IA et ordonnances électroniques.",
    publisher: "OZIOW Official",
    status: "roadmap",
    modules: ["auth", "billing", "ai-concierge", "files"],
    priceMonthly: 49,
    route: "/solutions/mediow",
    icon: "🏥",
    gradient: "from-emerald-500 to-teal-600",
    targetAudience: ["Cliniques privées", "Cabinets médicaux", "Centres de santé", "Pharmacies"],
    features: [
      "Dossiers patients numériques cryptés",
      "Prise de rendez-vous assistée par IA",
      "Gestion des ordonnances électroniques",
      "Conformité données de santé & RGPD",
    ],
  },
  {
    id: "shopow",
    name: "Shopow",
    category: "commerce",
    categoryLabel: "Commerce & POS",
    tagline: "ERP et gestion commerciale intelligente",
    description: "Point de vente (POS), gestion des stocks automatisée par IA et facturation multi-devises pour commerçants et franchises.",
    publisher: "OZIOW Official",
    status: "roadmap",
    modules: ["auth", "billing", "notifications"],
    priceMonthly: 39,
    route: "/solutions/shopow",
    icon: "🛒",
    gradient: "from-orange-500 to-red-500",
    targetAudience: ["Boutiques & Commerces", "Franchises", "E-commerce", "Grossistes"],
    features: [
      "Gestion des stocks prédictive par IA",
      "Point de vente multi-devises (€, $, FCFA)",
      "Facturation automatique & TPV",
      "Analytics des ventes en temps réel",
    ],
  },
  {
    id: "churchow",
    name: "Churchow",
    category: "community",
    categoryLabel: "Églises & Communautés",
    tagline: "Gestion communautaire et pastorale",
    description: "Solution complète de suivi des membres, gestion d'événements, collecte de dons en ligne et communication ciblée.",
    publisher: "OZIOW Official",
    status: "roadmap",
    modules: ["auth", "billing", "notifications"],
    priceMonthly: 19,
    route: "/solutions/churchow",
    icon: "⛪",
    gradient: "from-amber-500 to-yellow-600",
    targetAudience: ["Églises", "Communautés religieuses", "Associations"],
    features: [
      "Annuaire sécurisé des membres",
      "Dons & offrandes en ligne (Stripe/Paystack)",
      "Gestion des événements et cultes",
      "Diffusion de messages et sermons",
    ],
  },
];
