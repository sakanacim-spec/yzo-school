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

// ---------------------------------------------------------------------------
// Donation proposal & contact submission – fonctions frontend testables
// ---------------------------------------------------------------------------

/**
 * Construit le payload pour POST /api/public/donation-proposals.
 * Exactement 18 clés — aucun champ `intent`, `selectedFormula` ou `structuredMessage`.
 * Les champs conditionnels non applicables ou optionnels absents sont explicitement null (pas undefined),
 * même si des valeurs résiduelles obsolètes sont présentes dans l'objet source.
 * Aucune mutation de `data`.
 */
export function buildDonationProposalPayload(
  data: PartnerApplicationData,
  language: string
) {
  const trim = (s: string): string => s.trim();
  const optional = (s?: string): string | null => (s && s.trim() ? s.trim() : null);

  const isMobility = data.sector === 'mobility_services';
  const isOtherSector = data.sector === 'other';
  const isNgo = data.sector === 'ngo_institutions';

  const sanitizedSubSector = isMobility ? optional(data.subSector) : null;
  const sanitizedRegDecl = isOtherSector ? optional(data.regulationDeclaration) as RegulationDeclaration | null : null;
  const sanitizedOtherDetails = isOtherSector ? optional(data.otherSectorDetails) : null;
  const sanitizedOrgType = isNgo ? optional(data.organizationType) as OrganizationType | null : null;

  const regulated = isRegulatedSector(data.sector, sanitizedSubSector || undefined, sanitizedRegDecl || undefined);
  const sanitizedLicense = regulated ? optional(data.license) : null;

  return {
    fullName:              trim(data.fullName),                  // 1
    role:                  trim(data.role),                      // 2
    companyName:           trim(data.companyName),               // 3
    sector:                data.sector,                          // 4
    subSector:             sanitizedSubSector,                   // 5
    regulationDeclaration: sanitizedRegDecl,                     // 6
    otherSectorDetails:    sanitizedOtherDetails,                // 7
    organizationType:      sanitizedOrgType,                     // 8
    supportType:           optional(data.supportType) as SupportType | null, // 9
    license:               sanitizedLicense,                     // 10
    country:               trim(data.country),                   // 11
    targetMarkets:         trim(data.targetMarkets),             // 12
    email:                 trim(data.email),                     // 13
    phone:                 trim(data.phone),                     // 14
    website:               optional(data.website),               // 15
    projectDescription:    trim(data.projectDescription),        // 16
    language:              trim(language),                       // 17
    consent:               Boolean(data.consent),                // 18
  };
}

/**
 * Résout l'URL de soumission selon l'intention.
 * donation_sponsorship → /api/public/donation-proposals
 * autre               → /api/public/contact
 */
export function resolvePartnerSubmissionEndpoint(intent: PartnerApplicationIntent): string {
  return intent === 'donation_sponsorship'
    ? '/api/public/donation-proposals'
    : '/api/public/contact';
}

// UUID v4 : 8-4-4-4-12 hex, version 4, variante [89ab]
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Référence : DON-AAAA-XXXXXXXX (AAAA = 4 chiffres, XXXXXXXX = 8 chars base32-like)
const DONATION_REF_REGEX = /^DON-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/**
 * Valide strictement la réponse JSON d'un 201 de /api/public/donation-proposals (Politique A stricte).
 * - body doit être un objet non-null, non-tableau
 * - Object.keys(body) doit contenir exactement 3 clés : 'id', 'reference', 'status'
 * - id doit être un UUID v4 valide
 * - reference doit respecter le pattern DON-AAAA-XXXXXXXX
 * - status doit être exactement "pending"
 */
export function validateDonationProposalSuccessResponse(
  body: unknown
): body is { id: string; reference: string; status: 'pending' } {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return false;
  }
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b);
  if (keys.length !== 3) {
    return false;
  }
  if (!('id' in b && 'reference' in b && 'status' in b)) {
    return false;
  }
  return (
    typeof b.id === 'string' &&
    UUID_REGEX.test(b.id) &&
    typeof b.reference === 'string' &&
    DONATION_REF_REGEX.test(b.reference) &&
    b.status === 'pending'
  );
}

export type DonationSubmissionResult =
  | { outcome: 'success'; data: { id: string; reference: string; status: 'pending' } }
  | { outcome: 'validation_error' }
  | { outcome: 'rate_limit' }
  | { outcome: 'error' };

export interface SubmissionOptions {
  apiUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Exécute la soumission d'une proposition de don via l'endpoint dédié.
 * Reçoit optionnellement une fonction fetch pour les tests.
 */
export async function submitDonationProposal(
  data: PartnerApplicationData,
  language: string,
  options?: SubmissionOptions
): Promise<DonationSubmissionResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const baseUrl = options?.apiUrl ?? (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL ? import.meta.env.VITE_API_URL : '');
  const endpoint = resolvePartnerSubmissionEndpoint('donation_sponsorship');
  const payload = buildDonationProposalPayload(data, language);

  try {
    const response = await fetchFn(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 400) {
      return { outcome: 'validation_error' };
    }

    if (response.status === 429) {
      return { outcome: 'rate_limit' };
    }

    if (response.status !== 201 || !response.ok) {
      return { outcome: 'error' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { outcome: 'error' };
    }

    if (!validateDonationProposalSuccessResponse(body)) {
      return { outcome: 'error' };
    }

    return { outcome: 'success', data: body };
  } catch {
    return { outcome: 'error' };
  }
}

export interface PartnerMessageLabels {
  formulaName?: string;
  sectorLabel: string;
  subSectorLabel?: string;
  organizationTypeLabel?: string;
  intentLabel?: string;
  supportTypeLabel?: string;
  regulationDeclarationLabel?: string;
}

export type ContactSubmissionResult =
  | { outcome: 'success' }
  | { outcome: 'payload_too_long' }
  | { outcome: 'rate_limit' }
  | { outcome: 'error' };

/**
 * Exécute la soumission d'une demande de partenariat commercial via l'endpoint historique /api/public/contact.
 */
export async function submitPartnerContact(
  data: PartnerApplicationData,
  labels: PartnerMessageLabels,
  options?: SubmissionOptions
): Promise<ContactSubmissionResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const baseUrl = options?.apiUrl ?? (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL ? import.meta.env.VITE_API_URL : '');

  const structuredMessage = buildPartnerStructuredMessage(data, labels);
  if (!isPayloadWithinLimit(structuredMessage)) {
    return { outcome: 'payload_too_long' };
  }

  const payloadName = `${data.fullName.trim()} - ${data.companyName.trim()}`.slice(0, 150);
  const payloadCountry = data.country.trim().slice(0, 100);
  const payloadEmail = data.email.trim().slice(0, 200);

  try {
    const response = await fetchFn(`${baseUrl}/api/public/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: payloadName,
        country: payloadCountry,
        email: payloadEmail,
        message: structuredMessage,
      }),
    });

    const statusOutcome = resolvePartnerHttpStatus(response.status);
    if (statusOutcome === 'rate_limit') {
      return { outcome: 'rate_limit' };
    }

    if (statusOutcome !== 'success' || !response.ok) {
      return { outcome: 'error' };
    }

    return { outcome: 'success' };
  } catch {
    return { outcome: 'error' };
  }
}
