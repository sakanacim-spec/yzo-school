// ============================================================
// PARTNER APPLICATION UTILS & VALIDATIONS (PURE LOGIC)
// Partagé entre Partners.tsx et les suites de tests
// ============================================================

export type PartnerSector =
  | 'finance'
  | 'telecom'
  | 'equipment'
  | 'mobility_services'
  | 'after_school_services'
  | 'insurance'
  | 'transport'
  | 'ngo_institutions'
  | 'otherRegulated'
  | 'other'
  | '';

export type MobilitySubSector =
  | 'transport'
  | 'insurance'
  | 'afterSchool'
  | 'otherRegulated'
  | '';

export type RegulationDeclaration = 'yes' | 'no' | '';

export type PartnerApplicationIntent =
  | 'commercial_partnership'
  | 'institutional_partnership'
  | 'donation_sponsorship';

export type OrganizationType =
  | 'ngo'
  | 'foundation'
  | 'association'
  | 'international_institution'
  | 'cooperation_agency'
  | 'public_body'
  | 'sponsor_company'
  | 'other'
  | '';

export type SupportType =
  | 'future_financial_donation'
  | 'equipment_donation'
  | 'school_sponsorship'
  | 'educational_project_funding'
  | 'skills_sponsorship'
  | 'other_proposal'
  | '';

export type PartnerFormulaType = 'presence' | 'visibility' | 'strategic' | '';

export interface PartnerApplicationData {
  fullName: string;
  role: string;
  companyName: string;
  sector: PartnerSector;
  subSector?: MobilitySubSector;
  regulationDeclaration?: RegulationDeclaration;
  otherSectorDetails?: string;
  organizationType?: OrganizationType;
  intent?: PartnerApplicationIntent;
  supportType?: SupportType;
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
  errorField?:
    | 'required'
    | 'subSector'
    | 'otherSectorDetails'
    | 'regulationDeclaration'
    | 'organizationType'
    | 'supportType'
    | 'formula'
    | 'email'
    | 'phone'
    | 'website'
    | 'license'
    | 'payloadTooLong';
}

/**
 * Détermine si un secteur d'activité (ou une sous-catégorie ou déclaration) requiert un agrément ou une licence réglementaire.
 * - Secteurs obligatoirement réglementés : Finance, Assurance, Autre activité réglementée.
 * - Groupe Mobilité & Services scolaires : réglementé si sous-secteur Assurance ou Autre réglementé.
 * - Autre secteur d'activité ('other') : réglementé UNIQUEMENT si regulationDeclaration === 'yes'.
 * - Secteurs exemptés : Télécoms, Fournitures, Transport scolaire ordinaire, Services et activités périscolaires, ONG/Fondations/Institutions internationales, et Autre secteur si 'no' ou non déclaré 'yes'.
 */
export function isRegulatedSector(
  sector: string,
  subSector?: string,
  regulationDeclaration?: RegulationDeclaration
): boolean {
  if (
    sector === 'after_school_services' ||
    sector === 'transport' ||
    sector === 'telecom' ||
    sector === 'equipment' ||
    sector === 'ngo_institutions'
  ) {
    return false;
  }
  if (sector === 'finance' || sector === 'insurance' || sector === 'otherRegulated') {
    return true;
  }
  if (sector === 'mobility_services') {
    return subSector === 'insurance' || subSector === 'otherRegulated';
  }
  if (sector === 'other') {
    return regulationDeclaration === 'yes';
  }
  return false;
}

/**
 * Associe une carte de catégorie partenaire à sa valeur de secteur correspondante.
 * - cat1 -> finance
 * - cat2 -> telecom
 * - cat3 -> equipment
 * - cat4 -> mobility_services
 * - cat5 -> ngo_institutions
 */
export function mapCategoryToSector(
  categoryKey: 'cat1' | 'cat2' | 'cat3' | 'cat4' | 'cat5'
): PartnerSector {
  switch (categoryKey) {
    case 'cat1':
      return 'finance';
    case 'cat2':
      return 'telecom';
    case 'cat3':
      return 'equipment';
    case 'cat4':
      return 'mobility_services';
    case 'cat5':
      return 'ngo_institutions';
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
    !trimmedDesc ||
    !data.consent
  ) {
    return { valid: false, errorField: 'required' };
  }

  // 2. Si intent !== 'donation_sponsorship', la formule est obligatoire
  const isDonation = data.intent === 'donation_sponsorship';
  if (!isDonation && !data.selectedFormula) {
    return { valid: false, errorField: 'formula' };
  }

  // 3. Si intent === 'donation_sponsorship', supportType est obligatoire
  if (isDonation && !data.supportType) {
    return { valid: false, errorField: 'supportType' };
  }

  // 4. Si groupe Mobilité & Services scolaires, la sous-catégorie est obligatoire
  if (data.sector === 'mobility_services' && !data.subSector) {
    return { valid: false, errorField: 'subSector' };
  }

  // 5. Si Autre secteur d'activité :
  if (data.sector === 'other') {
    if (!data.otherSectorDetails?.trim()) {
      return { valid: false, errorField: 'otherSectorDetails' };
    }
    if (!data.regulationDeclaration || (data.regulationDeclaration !== 'yes' && data.regulationDeclaration !== 'no')) {
      return { valid: false, errorField: 'regulationDeclaration' };
    }
  }

  // 6. Si ONG, Fondations & Institutions internationales, type d'organisation obligatoire
  if (data.sector === 'ngo_institutions' && !data.organizationType) {
    return { valid: false, errorField: 'organizationType' };
  }

  // 7. Format Email
  if (!isValidEmail(trimmedEmail)) {
    return { valid: false, errorField: 'email' };
  }

  // 8. Format Téléphone international
  if (!isValidPhone(trimmedPhone)) {
    return { valid: false, errorField: 'phone' };
  }

  // 9. Format Site Web facultatif (doit être http/https si renseigné)
  if (!isValidWebsite(data.website)) {
    return { valid: false, errorField: 'website' };
  }

  // 10. Agrément conditionnel obligatoire si secteur ou déclaration réglementé(e)
  if (isRegulatedSector(data.sector, data.subSector, data.regulationDeclaration) && !trimmedLicense) {
    return { valid: false, errorField: 'license' };
  }

  return { valid: true };
}

/**
 * Construit le message structuré standardisé pour POST /api/public/contact
 */
export function buildPartnerStructuredMessage(
  data: PartnerApplicationData,
  labels: {
    formulaName?: string;
    sectorLabel: string;
    subSectorLabel?: string;
    organizationTypeLabel?: string;
    intentLabel?: string;
    supportTypeLabel?: string;
    regulationDeclarationLabel?: string;
  }
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
  const trimmedOther = data.otherSectorDetails?.trim();

  const isDonation = data.intent === 'donation_sponsorship';

  const lines = [
    isDonation ? '[PROPOSITION DE DON & MÉCÉNAT YZIOW]' : '[DEMANDE DE PARTENARIAT YZIOW]',
    labels.intentLabel ? `Intention : ${labels.intentLabel}` : null,
    `Représentant : ${trimmedName} (${trimmedRole})`,
    `Entreprise / Organisation : ${trimmedCompany}`,
    labels.organizationTypeLabel ? `Type d’organisation : ${labels.organizationTypeLabel}` : null,
    trimmedOther
      ? `Secteur : ${labels.sectorLabel} (Précision : ${trimmedOther})`
      : `Secteur : ${labels.sectorLabel}`,
    data.sector === 'mobility_services' && labels.subSectorLabel
      ? `Sous-catégorie : ${labels.subSectorLabel}`
      : null,
    data.sector === 'other' && labels.regulationDeclarationLabel
      ? `Activité réglementée : ${labels.regulationDeclarationLabel}`
      : null,
    isRegulatedSector(data.sector, data.subSector, data.regulationDeclaration) && trimmedLicense
      ? `Agrément / Régulation : ${trimmedLicense}`
      : null,
    labels.supportTypeLabel ? `Type de soutien : ${labels.supportTypeLabel}` : null,
    labels.formulaName
      ? `Formule souhaitée : ${labels.formulaName} (Sur devis)`
      : isDonation
      ? 'Formule commerciale : Aucune (Mécénat / Don sans contrepartie commerciale standard)'
      : null,
    `Pays d'implantation : ${trimmedCountry}`,
    `Marchés ciblés : ${trimmedMarkets}`,
    `Téléphone : ${trimmedPhone}`,
    trimmedWebsite ? `Site web : ${trimmedWebsite}` : null,
    '',
    isDonation ? 'Description de la proposition de mécénat / don :' : 'Description du projet :',
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
