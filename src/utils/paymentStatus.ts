// src/utils/paymentStatus.ts
/**
 * RÈGLE FINANCIÈRE OFFICIELLE DU PROPRIÉTAIRE YZIOW :
 * - Montant payé égal à 0 (pour écolage positif) => 'Non payé'
 * - Montant payé strictement supérieur à 0 et inférieur à l'écolage => 'Partiel'
 * - Montant payé supérieur ou égal à l'écolage => 'Soldé'
 * - Écolage valablement nul (0 FCFA = exonération/bourse complète) => 'Soldé'
 * - Le seuil de 70% ne détermine plus le statut de paiement scolaire.
 */

export type CanonicalPaymentStatus = 'Non payé' | 'Partiel' | 'Soldé';
export type PaymentStatus = CanonicalPaymentStatus | 'Non soldé';

/**
 * Calcule le statut de paiement canonique selon les montants réels.
 */
export function computePaymentStatus(
  dejaPaye: number | undefined | null,
  ecolage: number | undefined | null
): CanonicalPaymentStatus {
  const safeEcolage = typeof ecolage === 'number' && !isNaN(ecolage) ? Math.max(0, ecolage) : 0;
  const safePaye = typeof dejaPaye === 'number' && !isNaN(dejaPaye) ? Math.max(0, dejaPaye) : 0;

  // Écolage nul = exonération / cas particulier => Soldé
  if (safeEcolage === 0) {
    return 'Soldé';
  }

  // Payé supérieur ou égal à l'écolage => Soldé
  if (safePaye >= safeEcolage) {
    return 'Soldé';
  }

  // Strictement supérieur à 0 et inférieur à l'écolage => Partiel
  if (safePaye > 0) {
    return 'Partiel';
  }

  // 0 payé => Non payé
  return 'Non payé';
}

/**
 * Calcule le statut de paiement à partir du restant dû et de l'écolage.
 */
export function computeStatusFromRestant(
  restant: number | undefined | null,
  ecolage: number | undefined | null
): CanonicalPaymentStatus {
  const safeEcolage = typeof ecolage === 'number' && !isNaN(ecolage) ? Math.max(0, ecolage) : 0;
  if (safeEcolage === 0) return 'Soldé';
  const safeRestant = typeof restant === 'number' && !isNaN(restant) ? Math.max(0, restant) : safeEcolage;
  const paye = Math.max(0, safeEcolage - safeRestant);
  return computePaymentStatus(paye, safeEcolage);
}

/**
 * Normalise un statut existant (rétrocompatibilité avec 'Non soldé').
 */
export function normalizePaymentStatus(
  rawStatus: string | undefined | null,
  dejaPaye?: number | null,
  ecolage?: number | null
): CanonicalPaymentStatus {
  if (dejaPaye !== undefined && ecolage !== undefined && dejaPaye !== null && ecolage !== null) {
    return computePaymentStatus(dejaPaye, ecolage);
  }
  if (!rawStatus) return 'Non payé';
  const trimmed = rawStatus.trim();
  if (trimmed === 'Soldé') return 'Soldé';
  if (trimmed === 'Partiel') return 'Partiel';
  if (trimmed === 'Non payé' || trimmed === 'Non soldé') return 'Non payé';
  return 'Non payé';
}

/**
 * Indicateur complémentaire séparé pour le suivi du seuil de 70% (ne remplace pas le statut).
 */
export function isSeuil70Atteint(dejaPaye: number, ecolage: number): boolean {
  if (ecolage <= 0) return true;
  return (dejaPaye / ecolage) >= 0.7;
}
