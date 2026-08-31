'use strict';
// donationProposalValidation.js
// CommonJS – validation backend des propositions de dons.
// Aucune dépendance externe hormis ./helpers (normalizePhone).

const { normalizePhone } = require('./helpers');

// ---------------------------------------------------------------------------
// Constantes d'énumération (source : src/utils/partnerApplication.ts)
// ---------------------------------------------------------------------------

const VALID_SECTORS = new Set([
  'finance', 'telecom', 'equipment', 'mobility_services',
  'after_school_services', 'insurance', 'transport',
  'ngo_institutions', 'otherRegulated', 'other',
]);

const VALID_SUB_SECTORS = new Set([
  'transport', 'insurance', 'afterSchool', 'otherRegulated',
]);

const VALID_ORGANIZATION_TYPES = new Set([
  'ngo', 'foundation', 'association', 'international_institution',
  'cooperation_agency', 'public_body', 'sponsor_company', 'other',
]);

const VALID_REGULATION_DECLARATIONS = new Set(['yes', 'no']);

const SUPPORTED_LANGUAGES = new Set(['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru']);

const SUPPORTED_SUPPORT_TYPES = new Set([
  'future_financial_donation', 'equipment_donation', 'school_sponsorship',
  'educational_project_funding', 'skills_sponsorship', 'other_proposal',
]);

// ---------------------------------------------------------------------------
// Limites de longueur des champs textuels
// ---------------------------------------------------------------------------

const LIMITS = {
  fullName: 100,
  role: 100,
  companyName: 200,
  license: 200,
  country: 100,
  targetMarkets: 300,
  email: 254,
  phone: 30,
  website: 2048,
  otherSectorDetails: 500,
  projectDescription: 5000,
};

// ---------------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valide une URL avec new URL() en vérifiant le protocole et le hostname.
 * - Retourne true si absent (undefined) ou chaîne vide après trim.
 * - Retourne false pour null et tout type non-chaîne.
 * - Applique la limite LIMITS.website après trim.
 * @param {any} val
 * @returns {boolean}
 */
function isValidWebsite(val) {
  if (val === undefined) return true;
  if (val === null || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  if (trimmed.length > LIMITS.website) return false;
  try {
    const u = new URL(trimmed);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Valide qu'une valeur est une chaîne non vide après trim,
 * dans les limites [1, maxLen].
 * @param {any} val
 * @param {number} maxLen
 * @returns {{ ok: boolean, trimmed: string }}
 */
function checkStr(val, maxLen) {
  if (typeof val !== 'string') return { ok: false, trimmed: '' };
  const trimmed = val.trim();
  if (trimmed.length < 1 || trimmed.length > maxLen) return { ok: false, trimmed };
  return { ok: true, trimmed };
}

/**
 * Valide une chaîne optionnelle (peut être absente/undefined/vide).
 * Si présente, doit être une chaîne et ne pas dépasser maxLen après trim.
 * @param {any} val
 * @param {number} maxLen
 * @returns {{ ok: boolean, trimmed: string | undefined }}
 */
function checkOptStr(val, maxLen) {
  if (val === undefined) return { ok: true, trimmed: undefined };
  if (typeof val !== 'string') return { ok: false, trimmed: undefined };
  const trimmed = val.trim();
  if (trimmed.length > maxLen) return { ok: false, trimmed };
  return { ok: true, trimmed: trimmed || undefined };
}

// ---------------------------------------------------------------------------
// Determination secteur réglementé (logique src/utils/partnerApplication.ts)
// ---------------------------------------------------------------------------

function isRegulatedSector(sector, subSector, regulationDeclaration) {
  if (
    sector === 'after_school_services' ||
    sector === 'transport' ||
    sector === 'telecom' ||
    sector === 'equipment' ||
    sector === 'ngo_institutions'
  ) return false;
  if (sector === 'finance' || sector === 'insurance' || sector === 'otherRegulated') return true;
  if (sector === 'mobility_services') return subSector === 'insurance' || subSector === 'otherRegulated';
  if (sector === 'other') return regulationDeclaration === 'yes';
  return false;
}

// ---------------------------------------------------------------------------
// Validation principale
// ---------------------------------------------------------------------------

/**
 * Valide un payload de proposition de don.
 * @param {any} data
 * @returns {{ valid: true, value: object } | { valid: false, errorField: string }}
 */
function validateDonationProposal(data) {
  // 1. Type racine
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errorField: 'required' };
  }

  // 2. Champs autorisés (aucun champ inconnu)
  const ALLOWED = new Set([
    'fullName', 'role', 'companyName', 'sector', 'subSector',
    'regulationDeclaration', 'otherSectorDetails', 'organizationType',
    'supportType', 'license', 'country', 'targetMarkets',
    'email', 'phone', 'website', 'projectDescription', 'consent', 'language',
  ]);
  for (const key of Object.keys(data)) {
    if (!ALLOWED.has(key)) return { valid: false, errorField: 'required' };
  }

  // 3. Champs textuels obligatoires – type string ET non vide
  const fn = checkStr(data.fullName, LIMITS.fullName);
  if (!fn.ok) return { valid: false, errorField: 'required' };

  const rl = checkStr(data.role, LIMITS.role);
  if (!rl.ok) return { valid: false, errorField: 'required' };

  const cn = checkStr(data.companyName, LIMITS.companyName);
  if (!cn.ok) return { valid: false, errorField: 'required' };

  const ct = checkStr(data.country, LIMITS.country);
  if (!ct.ok) return { valid: false, errorField: 'required' };

  const tm = checkStr(data.targetMarkets, LIMITS.targetMarkets);
  if (!tm.ok) return { valid: false, errorField: 'required' };

  const em = checkStr(data.email, LIMITS.email);
  if (!em.ok) return { valid: false, errorField: 'required' };

  const ph = checkStr(data.phone, LIMITS.phone);
  if (!ph.ok) return { valid: false, errorField: 'required' };

  const pd = checkStr(data.projectDescription, LIMITS.projectDescription);
  if (!pd.ok) return { valid: false, errorField: pd.trimmed.length > LIMITS.projectDescription ? 'payloadTooLong' : 'required' };

  // 4. consent === true strict
  if (data.consent !== true) return { valid: false, errorField: 'required' };

  // 5. sector : obligatoire, type string, valeur d'enum connue
  if (typeof data.sector !== 'string' || !VALID_SECTORS.has(data.sector)) {
    return { valid: false, errorField: 'required' };
  }
  const sector = data.sector;

  // 6. Règles spécifiques par secteur
  let subSector;
  let regulationDeclaration;
  let otherSectorDetails;
  let organizationType;

  if (sector === 'mobility_services') {
    // subSector obligatoire, doit être une valeur valide (pas la chaîne vide)
    if (typeof data.subSector !== 'string' || !VALID_SUB_SECTORS.has(data.subSector)) {
      return { valid: false, errorField: 'subSector' };
    }
    subSector = data.subSector;
  } else if (data.subSector !== undefined) {
    // subSector fourni pour un autre secteur : type chaîne requis
    if (typeof data.subSector !== 'string') {
      return { valid: false, errorField: 'subSector' };
    }
    const subSectorTrimmed = data.subSector.trim();
    // Chaîne vide = absence (non incluse dans value)
    if (subSectorTrimmed !== '' && !VALID_SUB_SECTORS.has(subSectorTrimmed)) {
      return { valid: false, errorField: 'subSector' };
    }
    if (subSectorTrimmed !== '') subSector = subSectorTrimmed;
  }

  if (sector === 'other') {
    // regulationDeclaration obligatoire
    if (typeof data.regulationDeclaration !== 'string' || !VALID_REGULATION_DECLARATIONS.has(data.regulationDeclaration)) {
      return { valid: false, errorField: 'regulationDeclaration' };
    }
    regulationDeclaration = data.regulationDeclaration;
    // otherSectorDetails obligatoire pour secteur 'other'
    const osd = checkStr(data.otherSectorDetails, LIMITS.otherSectorDetails);
    if (!osd.ok) return { valid: false, errorField: 'otherSectorDetails' };
    otherSectorDetails = osd.trimmed;
  } else {
    // regulationDeclaration optionnel pour les autres secteurs
    if (data.regulationDeclaration !== undefined) {
      if (typeof data.regulationDeclaration !== 'string') {
        return { valid: false, errorField: 'regulationDeclaration' };
      }
      const rdTrimmed = data.regulationDeclaration.trim();
      // Chaîne vide = absence (non incluse dans value)
      if (rdTrimmed !== '' && !VALID_REGULATION_DECLARATIONS.has(rdTrimmed)) {
        return { valid: false, errorField: 'regulationDeclaration' };
      }
      if (rdTrimmed !== '') regulationDeclaration = rdTrimmed;
    }
    // otherSectorDetails optionnel
    const osd = checkOptStr(data.otherSectorDetails, LIMITS.otherSectorDetails);
    if (!osd.ok) return { valid: false, errorField: 'otherSectorDetails' };
    otherSectorDetails = osd.trimmed;
  }

  if (sector === 'ngo_institutions') {
    // organizationType obligatoire
    if (typeof data.organizationType !== 'string' || !VALID_ORGANIZATION_TYPES.has(data.organizationType)) {
      return { valid: false, errorField: 'organizationType' };
    }
    organizationType = data.organizationType;
  } else if (data.organizationType !== undefined) {
    if (typeof data.organizationType !== 'string') {
      return { valid: false, errorField: 'organizationType' };
    }
    const otTrimmed = data.organizationType.trim();
    // Chaîne vide = absence (non incluse dans value)
    if (otTrimmed !== '' && !VALID_ORGANIZATION_TYPES.has(otTrimmed)) {
      return { valid: false, errorField: 'organizationType' };
    }
    if (otTrimmed !== '') organizationType = otTrimmed;
  }

  // 7. Language
  if (!SUPPORTED_LANGUAGES.has(data.language)) {
    return { valid: false, errorField: 'language' };
  }
  const language = data.language;

  // 8. supportType
  if (!SUPPORTED_SUPPORT_TYPES.has(data.supportType)) {
    return { valid: false, errorField: 'supportType' };
  }
  const supportType = data.supportType;

  // 9. License selon secteur réglementé
  const licResult = checkOptStr(data.license, LIMITS.license);
  if (!licResult.ok) return { valid: false, errorField: 'license' };
  const license = licResult.trimmed;
  const needsLicense = isRegulatedSector(sector, subSector, regulationDeclaration);
  if (needsLicense && !license) return { valid: false, errorField: 'license' };

  // 10. Email
  if (!EMAIL_REGEX.test(em.trimmed)) return { valid: false, errorField: 'email' };

  // 11. Téléphone – appel sans second argument (le numéro doit être au format + ou 00...)
  let phoneNormalized;
  try {
    phoneNormalized = normalizePhone(ph.trimmed);
  } catch (_) {
    return { valid: false, errorField: 'phone' };
  }

  // 12. Website (optionnel, new URL())
  const websiteVal = data.website;
  if (!isValidWebsite(websiteVal)) return { valid: false, errorField: 'website' };
  const websiteTrimmed = (typeof websiteVal === 'string') ? websiteVal.trim() : undefined;

  // 13. projectDescription longueur (vérification explicite dépassement)
  if (pd.trimmed.length > LIMITS.projectDescription) {
    return { valid: false, errorField: 'payloadTooLong' };
  }

  // 14. Construction de la valeur normalisée (sans muter l'objet reçu)
  const value = {
    fullName: fn.trimmed,
    role: rl.trimmed,
    companyName: cn.trimmed,
    sector,
    language,
    supportType,
    country: ct.trimmed,
    targetMarkets: tm.trimmed,
    email: em.trimmed,
    phone: phoneNormalized,
    projectDescription: pd.trimmed,
    consent: true,
  };
  if (license) value.license = license;
  if (subSector !== undefined) value.subSector = subSector;
  if (regulationDeclaration !== undefined) value.regulationDeclaration = regulationDeclaration;
  if (otherSectorDetails !== undefined) value.otherSectorDetails = otherSectorDetails;
  if (organizationType !== undefined) value.organizationType = organizationType;
  if (websiteTrimmed) value.website = websiteTrimmed;

  return { valid: true, value };
}

module.exports = { validateDonationProposal };
