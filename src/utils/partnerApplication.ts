// ============================================================
// PARTNER APPLICATION UTILS & VALIDATIONS (PURE LOGIC)
// Partagé entre Partners.tsx et les suites de tests
// ============================================================

export type PartnerSector =
  | 'finance'
  | 'telecom'
  | 'equipment'
  | 'mobility_services'
  | 'insurance'
  | 'transport'
  | 'otherRegulated'
  | 'other'
  | '';

export type MobilitySubSector =
  | 'transport'
  | 'insurance'
  | 'afterSchool'
  | 'otherRegulated'
  | '';

export interface PartnerApplicationData {
  fullName: string;
  role: string;
  companyName: string;
  sector: PartnerSector;
  subSector?: MobilitySubSector;
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

export type PartnerFormulaType = 'presence' | 'visibility' | 'strategic' | '';

export interface PartnerValidationResult {
  valid: boolean;
  errorField?: 'required' | 'subSector' | 'email' | 'phone' | 'website' | 'license' | 'payloadTooLong';
}

/**
 * Détermine si un secteur d'activité (ou une sous-catégorie) requiert un agrément ou une licence réglementaire.
 * - Secteurs réglementés : Finance, Assurance, Autre activité réglementée.
 * - Secteurs exemptés : Télécoms, Fournitures, Transport scolaire ordinaire, Services périscolaires.
 */
export function isRegulatedSector(sector: string, subSector?: string): boolean {
  if (sector === 'finance' || sector === 'insurance' || sector === 'otherRegulated') {
    return true;
  }
  if (sector === 'mobility_services') {
    return subSector === 'insurance' || subSector === 'otherRegulated';
  }
  return false;
}

/**
 * Associe une carte de catégorie partenaire à sa valeur de secteur correspondante.
 * La catégorie 4 correspond au groupe 'mobility_services' (Mobilité, Assurance & Services scolaires).
 */
export function mapCategoryToSector(categoryKey: 'cat1' | 'cat2' | 'cat3' | 'cat4'): PartnerSector {
  switch (categoryKey) {
    case 'cat1':
      return 'finance';
    case 'cat2':
      return 'telecom';
    case 'cat3':
      return 'equipment';
    case 'cat4':
      return 'mobility_services';
    default:
      return 'other';
  }
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

  // 1. Validation des champs obligatoires généraux
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

  // 2. Si groupe Mobilité & Services scolaires, la sous-catégorie est obligatoire
  if (data.sector === 'mobility_services' && !data.subSector) {
    return { valid: false, errorField: 'subSector' };
  }

  // 3. Format Email
  if (!isValidEmail(trimmedEmail)) {
    return { valid: false, errorField: 'email' };
  }

  // 4. Format Téléphone international
  if (!isValidPhone(trimmedPhone)) {
    return { valid: false, errorField: 'phone' };
  }

  // 5. Format Site Web facultatif (doit être http/https si renseigné)
  if (!isValidWebsite(data.website)) {
    return { valid: false, errorField: 'website' };
  }

  // 6. Agrément conditionnel obligatoire si secteur ou sous-catégorie réglementé(e)
  if (isRegulatedSector(data.sector, data.subSector) && !trimmedLicense) {
    return { valid: false, errorField: 'license' };
  }

  return { valid: true };
}

/**
 * Construit le message structuré standardisé pour POST /api/public/contact
 */
export function buildPartnerStructuredMessage(
  data: PartnerApplicationData,
  labels: { formulaName: string; sectorLabel: string; subSectorLabel?: string }
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
    data.sector === 'mobility_services' && labels.subSectorLabel
      ? `Sous-catégorie : ${labels.subSectorLabel}`
      : null,
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
