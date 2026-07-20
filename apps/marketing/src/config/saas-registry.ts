export interface SaaSProduct {
  id: string;
  name: string;
  category: "Éducation" | "Santé" | "Commerce" | "Communautés" | "Immobilier" | "ONG" | "Finance";
  tagline: string;
  description: string;
  publisher: "OZIOW Official" | "Third-Party Publisher";
  status: "live" | "beta" | "roadmap";
  icon: string;
  gradient: string;
  targetAudience: string[];
  features: string[];
  demoUrl?: string;
  pricingLink?: string;
}

export interface ModuleItem {
  id: string;
  name: string;
  category: "Intelligence Artificielle" | "Sécurité & Auth" | "Facturation & Paiement" | "Infrastructure" | "Communication" | "Croissance";
  description: string;
  icon: string;
  status: "live" | "beta" | "roadmap";
  keyBenefits: string[];
}

export const SAAS_REGISTRY: SaaSProduct[] = [
  {
    id: "yziow",
    name: "Yziow",
    category: "Éducation",
    tagline: "La gestion scolaire intelligente alimentée par l'IA",
    description: "Solution complète de gestion d'établissements scolaires (écoles, collèges, lycées, universités). Intègre un Assistant IA Concierge pour parents, enseignants et directeurs.",
    publisher: "OZIOW Official",
    status: "live",
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
    demoUrl: "https://admin.oziow.com",
    pricingLink: "/tarifs",
  },
  {
    id: "mediow",
    name: "Mediow",
    category: "Santé",
    tagline: "Gestion de cliniques et cabinets médicaux",
    description: "Solution SaaS dédiée aux professionnels de santé : dossiers patients sécurisés, prise de rendez-vous IA et ordonnances électroniques.",
    publisher: "OZIOW Official",
    status: "roadmap",
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
    category: "Commerce",
    tagline: "ERP et gestion commerciale intelligente",
    description: "Point de vente (POS), gestion des stocks automatisée par IA et facturation multi-devises pour commerçants et franchises.",
    publisher: "OZIOW Official",
    status: "roadmap",
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
    category: "Communautés",
    tagline: "Gestion communautaire et pastorale",
    description: "Solution complète de suivi des membres, gestion d'événements, collecte de dons en ligne et communication ciblée.",
    publisher: "OZIOW Official",
    status: "roadmap",
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
  {
    id: "ngo-ow",
    name: "Ngo-ow",
    category: "ONG",
    tagline: "Suivi de projets et gestion des donateurs",
    description: "Outil de pilotage de projets terrain, reporting d'impact automatisé et gestion des relations bailleurs.",
    publisher: "Third-Party Publisher",
    status: "roadmap",
    icon: "🤝",
    gradient: "from-pink-500 to-rose-600",
    targetAudience: ["ONG Internationales", "Associations caritatives", "Fondations"],
    features: [
      "Suivi de projets terrain en temps réel",
      "Rapports d'impact automatisés par IA",
      "Gestion transparente des donateurs",
      "Conformité bailleurs de fonds",
    ],
  },
  {
    id: "immow",
    name: "Immow",
    category: "Immobilier",
    tagline: "Gestion locative et immobilière",
    description: "Gestion des baux, suivi automatique des loyers, signatures électroniques et portail locataires.",
    publisher: "Third-Party Publisher",
    status: "roadmap",
    icon: "🏢",
    gradient: "from-cyan-500 to-blue-500",
    targetAudience: ["Agences immobilières", "Bailleurs indépendants", "Syndics de copropriété"],
    features: [
      "Gestion centralisée des biens",
      "Quittances et relances automatiques",
      "Contrats de bail numériques",
      "Portail locataire & demandes d'intervention",
    ],
  },
];

export const MODULES_REGISTRY: ModuleItem[] = [
  { id: "ai-concierge", name: "IA Concierge & RAG", category: "Intelligence Artificielle", description: "Assistant conversationnel alimenté par OpenAI et pgvector pour répondre précisément aux utilisateurs à partir de vos documents.", icon: "🤖", status: "live", keyBenefits: ["Support 24/7", "Embeddings PDF", "Réponses contextuelles"] },
  { id: "multi-tenant-rls", name: "Multi-Tenant RLS", category: "Sécurité & Auth", description: "Isolation hermétique des données au niveau de la base PostgreSQL pour une sécurité maximale.", icon: "🔒", status: "live", keyBenefits: ["Zero Data Leak", "Conformité RGPD", "Performance native"] },
  { id: "billing-engine", name: "Paiements & Billing", category: "Facturation & Paiement", description: "Moteur d'abonnements compatible Stripe (cartes) et Paystack (Mobile Money : Orange Money, Wave, MTN).", icon: "💳", status: "live", keyBenefits: ["Multi-devises", "Mobile Money", "Factures auto"] },
  { id: "notifications-hub", name: "Notifications Multi-canal", category: "Communication", description: "Envoi automatisé de notifications par Email (Resend), SMS (Twilio) et Push.", icon: "🔔", status: "live", keyBenefits: ["Multi-canal", "Templates personnalisés", "Logs de délivrabilité"] },
  { id: "referral-affiliate", name: "Parrainage & Affiliation", category: "Croissance", description: "Système de recommandation avec liens uniques et attribution de commissions automatiques.", icon: "📈", status: "roadmap", keyBenefits: ["Croissance virale", "Tracking temps réel", "Récompenses automatiques"] },
  { id: "api-gateway", name: "API Gateway & Webhooks", category: "Infrastructure", description: "Passerelle d'API RESTful versionnée avec documentation Swagger interactive et webhooks.", icon: "🔌", status: "live", keyBenefits: ["Rate limiting", "Clés API", "Webhooks temps réel"] },
];
