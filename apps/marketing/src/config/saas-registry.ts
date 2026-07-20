import { SHARED_SAAS_REGISTRY, SaaSDefinition } from "@saas/types";

export type SaaSProduct = SaaSDefinition;

export const SAAS_REGISTRY = SHARED_SAAS_REGISTRY;

export interface ModuleItem {
  id: string;
  name: string;
  category: "Intelligence Artificielle" | "Sécurité & Auth" | "Facturation & Paiement" | "Infrastructure" | "Communication" | "Croissance";
  description: string;
  icon: string;
  status: "live" | "beta" | "roadmap";
  keyBenefits: string[];
}

export const MODULES_REGISTRY: ModuleItem[] = [
  { id: "ai-concierge", name: "IA Concierge & RAG", category: "Intelligence Artificielle", description: "Assistant conversationnel alimenté par OpenAI et pgvector pour répondre précisément aux utilisateurs à partir de vos documents.", icon: "🤖", status: "live", keyBenefits: ["Support 24/7", "Embeddings PDF", "Réponses contextuelles"] },
  { id: "multi-tenant-rls", name: "Multi-Tenant RLS", category: "Sécurité & Auth", description: "Isolation hermétique des données au niveau de la base PostgreSQL pour une sécurité maximale.", icon: "🔒", status: "live", keyBenefits: ["Zero Data Leak", "Conformité RGPD", "Performance native"] },
  { id: "billing-engine", name: "Paiements & Billing", category: "Facturation & Paiement", description: "Moteur d'abonnements compatible Stripe (cartes) et Paystack (Mobile Money : Orange Money, Wave, MTN).", icon: "💳", status: "live", keyBenefits: ["Multi-devises", "Mobile Money", "Factures auto"] },
  { id: "notifications-hub", name: "Notifications Multi-canal", category: "Communication", description: "Envoi automatisé de notifications par Email (Resend), SMS (Twilio) et Push.", icon: "🔔", status: "live", keyBenefits: ["Multi-canal", "Templates personnalisés", "Logs de délivrabilité"] },
  { id: "referral-affiliate", name: "Parrainage & Affiliation", category: "Croissance", description: "Système de recommandation avec liens uniques et attribution de commissions automatiques.", icon: "📈", status: "roadmap", keyBenefits: ["Croissance virale", "Tracking temps réel", "Récompenses automatiques"] },
  { id: "api-gateway", name: "API Gateway & Webhooks", category: "Infrastructure", description: "Passerelle d'API RESTful versionnée avec documentation Swagger interactive et webhooks.", icon: "🔌", status: "live", keyBenefits: ["Rate limiting", "Clés API", "Webhooks temps réel"] },
];
