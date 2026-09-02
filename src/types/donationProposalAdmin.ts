// src/types/donationProposalAdmin.ts
// Définitions de types, machine à états et constantes du module administratif des propositions de mécénat / dons.

export type DonationProposalStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export const DONATION_PROPOSAL_STATUSES: readonly DonationProposalStatus[] = Object.freeze([
  'pending',
  'under_review',
  'approved',
  'rejected',
  'archived'
]);

/**
 * Matrice stricte des transitions autorisées (Règle P12)
 */
export const STATUS_TRANSITIONS: Record<DonationProposalStatus, readonly DonationProposalStatus[]> = Object.freeze({
  pending: Object.freeze<DonationProposalStatus[]>(['under_review', 'rejected']),
  under_review: Object.freeze<DonationProposalStatus[]>(['approved', 'rejected']),
  approved: Object.freeze<DonationProposalStatus[]>(['archived']),
  rejected: Object.freeze<DonationProposalStatus[]>(['archived']),
  archived: Object.freeze<DonationProposalStatus[]>([])
});

/**
 * Métadonnées visuelles et libellés français pour chaque statut
 */
export interface StatusMeta {
  label: string;
  badgeClass: string;
  borderClass: string;
  actionLabel: string;
}

export const STATUS_METADATA: Record<DonationProposalStatus, StatusMeta> = Object.freeze({
  pending: {
    label: 'En attente',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    actionLabel: '' // État initial : aucun retour possible vers pending selon P12
  },
  under_review: {
    label: 'En examen',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    borderClass: 'border-blue-500/40',
    actionLabel: 'Prendre en examen'
  },
  approved: {
    label: 'Approuvé',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    borderClass: 'border-emerald-500/40',
    actionLabel: 'Approuver la proposition'
  },
  rejected: {
    label: 'Rejeté',
    badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    borderClass: 'border-rose-500/40',
    actionLabel: 'Rejeter la proposition'
  },
  archived: {
    label: 'Archivé',
    badgeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    borderClass: 'border-slate-500/40',
    actionLabel: 'Archiver le dossier'
  }
});

/**
 * Fonctions de libellés multilingues conformes au système i18n
 */
export function getStatusLabel(status: DonationProposalStatus, tFn?: (path: string, vars?: any) => string): string {
  if (tFn) {
    const key = `superadmin.donationProposals.status.${status}`;
    const translated = tFn(key);
    if (translated && translated !== key) return translated;
  }
  return STATUS_METADATA[status]?.label || status;
}

export function getActionLabel(status: DonationProposalStatus, tFn?: (path: string, vars?: any) => string): string {
  if (tFn) {
    const actionKeyMap: Partial<Record<DonationProposalStatus, string>> = {
      under_review: 'superadmin.donationProposals.actions.takeUnderReview',
      approved: 'superadmin.donationProposals.actions.approve',
      rejected: 'superadmin.donationProposals.actions.reject',
      archived: 'superadmin.donationProposals.actions.archive'
    };
    const key = actionKeyMap[status];
    if (key) {
      const translated = tFn(key);
      if (translated && translated !== key) return translated;
    }
  }
  return STATUS_METADATA[status]?.actionLabel || status;
}

/**
 * Liste officielle des 10 secteurs P11 et libellés français
 */
export interface SectorOption {
  value: string;
  label: string;
}

export const OFFICIAL_SECTORS: readonly SectorOption[] = Object.freeze([
  { value: 'finance', label: 'Finance & Services bancaires' },
  { value: 'telecom', label: 'Télécommunications & Connectivité' },
  { value: 'equipment', label: 'Équipement & Matériel' },
  { value: 'mobility_services', label: 'Services de mobilité' },
  { value: 'after_school_services', label: 'Services parascolaires' },
  { value: 'insurance', label: 'Assurance' },
  { value: 'transport', label: 'Transport scolaire & Logistique' },
  { value: 'ngo_institutions', label: 'ONG & Institutions internationales' },
  { value: 'otherRegulated', label: 'Autre secteur réglementé' },
  { value: 'other', label: 'Autre secteur' }
]);

/**
 * Types de soutien déclarés
 */
export const SUPPORT_TYPE_LABELS: Record<string, string> = Object.freeze({
  future_financial_donation: 'Don financier futur',
  equipment_donation: 'Don d\'équipements / Matériel',
  school_sponsorship: 'Parrainage d\'écoles',
  educational_project_funding: 'Financement de projets pédagogiques',
  skills_sponsorship: 'Mécénat de compétences',
  other_proposal: 'Autre proposition'
});

/**
 * Entrée d'audit chronologique
 */
export interface DonationProposalAuditLog {
  id: string;
  proposal_id: string;
  actor_id: string;
  actor_name: string;
  old_status: DonationProposalStatus;
  new_status: DonationProposalStatus;
  note: string | null;
  created_at: string;
}

/**
 * Proposition de mécénat (Item de liste)
 */
export interface DonationProposalItem {
  id: string;
  reference: string;
  full_name: string;
  role: string;
  company_name: string;
  sector: string;
  sub_sector: string | null;
  regulation_declaration: string | null;
  other_sector_details: string | null;
  organization_type: string | null;
  support_type: string;
  license: string | null;
  country: string;
  target_markets: string;
  email: string;
  phone: string;
  website: string | null;
  language: string;
  consent: boolean;
  status: DonationProposalStatus;
  internal_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Détail d'une proposition avec historique d'audit
 */
export interface DonationProposalDetail extends DonationProposalItem {
  project_description?: string | null;
  audit_trail: DonationProposalAuditLog[];
}

/**
 * Réponse de l'API de liste paginée
 */
export interface DonationProposalsListResponse {
  items: DonationProposalItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Paramètres de filtrage et pagination
 */
export interface DonationProposalQueryParams {
  status?: DonationProposalStatus | '';
  sector?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Payload envoyé lors du PATCH de statut (stricte interdiction d'actor_id ou reviewed_by)
 */
export interface UpdateStatusPayload {
  expected_status: DonationProposalStatus;
  new_status: DonationProposalStatus;
  note?: string | null;
}
