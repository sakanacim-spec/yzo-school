// ============================================================
// PARTNER APPLICATION UTILS & VALIDATIONS (PURE LOGIC)
// Partagé entre Partners.tsx et les suites de tests
// ============================================================

export type PartnerSector =
  | 'finance'
  | 'insurance'
  | 'telecom'
  | 'equipment'
  | 'transport'
  | 'otherRegulated'
  | 'other'
  | '';

export type PartnerFormulaType = 'presence' | 'visibility' | 'strategic' | '';

export interface PartnerApplicationData {
  fullName: string;
  role: string;
  companyName: string;
  sector: PartnerSector;
  license: string;
  country: string;
  targetMarkets: string;
  email: string;
  phone: string;
  website: string;
  selectedFormula: PartnerFormulaType;
  projectDescription: string;
  consent: boolean;
}

export interface PartnerValidationResult {
  valid: boolean;
  errorField?: 'required' | 'email' | 'phone' | 'website' | 'license' | 'payloadTooLong';
}

/**
 * Détermine si un secteur d'activité requiert un agrément ou une licence réglementaire.
 * Les secteurs bancaires/financiers, assurantiels et autres activités régulées sont strictement contrôlés.
 * Le transport ordinaire et les fournitures générales ne sont pas régulés.
 */
export function isRegulatedSector(sector: string): boolean {
  return sector === 'finance' || sector === 'insurance' || sector === 'otherRegulated';
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[\d\s().-]{7,25}$/;
export const WEBSITE_REGEX = /^https?:\/\/.+/i;
export const MAX_STRUCTURED_MESSAGE_LENGTH = 5000;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

export function isValidWebsite(website: string): boolean {
  const trimmed = website.trim();
  if (!trimmed) return true; // Facultatif
  return WEBSITE_REGEX.test(trimmed);
}

/**
 * Valide l'ensemble des champs du formulaire de candidature partenaire.
 */
export function validatePartnerForm(data: PartnerApplicationData): PartnerValidationResult {
  const trimmedName = data.fullName.trim();
  const trimmedRole = data.role.trim();
  const trimmedCompany = data.companyName.trim();
  const trimmedCountry = data.country.trim();
  const trimmedMarkets = data.targetMarkets.trim();
  const trimmedEmail = data.email.trim();
  const trimmedPhone = data.phone.trim();
  const trimmedDesc = data.projectDescription.trim();
  const trimmedLicense = data.license.trim();

  // 1. Validation des champs obligatoires
  if (
    !trimmedName ||
    !trimmedRole ||
    !trimmedCompany ||
    !data.sector ||
    !trimmedCountry ||
    !trimmedMarkets ||
    !trimmedEmail ||
    !trimmedPhone ||
    !data.selectedFormula ||
    !trimmedDesc ||
    !data.consent
  ) {
    return { valid: false, errorField: 'required' };
  }

  // 2. Format Email
  if (!isValidEmail(trimmedEmail)) {
    return { valid: false, errorField: 'email' };
  }

  // 3. Format Téléphone international
  if (!isValidPhone(trimmedPhone)) {
    return { valid: false, errorField: 'phone' };
  }

  // 4. Format Site Web facultatif (doit être http/https si renseigné)
  if (!isValidWebsite(data.website)) {
    return { valid: false, errorField: 'website' };
  }

  // 5. Agrément conditionnel obligatoire si secteur réglementé
  if (isRegulatedSector(data.sector) && !trimmedLicense) {
    return { valid: false, errorField: 'license' };
  }

  return { valid: true };
}

/**
 * Construit le message structuré standardisé pour POST /api/public/contact
 */
export function buildPartnerStructuredMessage(
  data: PartnerApplicationData,
  labels: { formulaName: string; sectorLabel: string }
): string {
  const trimmedName = data.fullName.trim();
  const trimmedRole = data.role.trim();
  const trimmedCompany = data.companyName.trim();
  const trimmedLicense = data.license.trim();
  const trimmedCountry = data.country.trim();
  const trimmedMarkets = data.targetMarkets.trim();
  const trimmedPhone = data.phone.trim();
  const trimmedWebsite = data.website.trim();
  const trimmedDesc = data.projectDescription.trim();

  const lines = [
    '[DEMANDE DE PARTENARIAT YZIOW]',
    `Représentant : ${trimmedName} (${trimmedRole})`,
    `Entreprise / Organisation : ${trimmedCompany}`,
    `Secteur : ${labels.sectorLabel}`,
    trimmedLicense ? `Agrément / Régulation : ${trimmedLicense}` : null,
    `Formule souhaitée : ${labels.formulaName} (Sur devis)`,
    `Pays d'implantation : ${trimmedCountry}`,
    `Marchés ciblés : ${trimmedMarkets}`,
    `Téléphone : ${trimmedPhone}`,
    trimmedWebsite ? `Site web : ${trimmedWebsite}` : null,
    '',
    'Description du projet :',
    trimmedDesc
  ];

  return lines.filter((line) => line !== null).join('\n');
}

/**
 * Vérifie que la longueur du message respecte la limite de 5 000 caractères backend.
 */
export function isPayloadWithinLimit(message: string, maxLimit = MAX_STRUCTURED_MESSAGE_LENGTH): boolean {
  return message.length <= maxLimit;
}

/**
 * Détermine le statut d'interface selon le code de statut HTTP renvoyé.
 */
export function resolvePartnerHttpStatus(status: number): 'success' | 'rate_limit' | 'error' {
  if (status === 200) return 'success';
  if (status === 429) return 'rate_limit';
  return 'error';
}
