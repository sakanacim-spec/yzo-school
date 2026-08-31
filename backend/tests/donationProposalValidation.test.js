'use strict';

// Tests pour donationProposalValidation.js
// Exécution : node --test backend/tests/donationProposalValidation.test.js
// Dépendances : node:test, node:assert/strict uniquement.

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateDonationProposal } = require('../utils/donationProposalValidation');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Payload de base minimal valide. */
function base() {
  return {
    fullName: '  Jane Doe  ',
    role: 'Directrice',
    companyName: 'ONG Exemple',
    sector: 'telecom',          // non réglementé – pas de license requise
    country: 'FR',
    targetMarkets: 'Afrique de l\'Ouest',
    email: 'jane@example.com',
    phone: '+33612345678',      // E.164 → accepté sans second argument
    website: 'https://example.com',
    projectDescription: 'Description courte du projet.',
    consent: true,
    language: 'fr',
    supportType: 'future_financial_donation',
  };
}

// ---------------------------------------------------------------------------
// 1. Payload valide – retour { valid, value } et trimming
// ---------------------------------------------------------------------------

test('payload valide → { valid: true, value: {...} }', () => {
  const p = base();
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.ok(res.value, 'value doit être présent');
});

test('fullName trimmé dans value', () => {
  const p = base();
  p.fullName = '  Jane Doe  ';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.equal(res.value.fullName, 'Jane Doe');
});

test('phone normalisé E.164 dans value', () => {
  const p = base();
  p.phone = '+33612345678';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  // normalizePhone doit renvoyer le format E.164 standard
  assert.match(res.value.phone, /^\+\d{7,15}$/);
});

test('absence de mutation de l\'objet reçu', () => {
  const p = base();
  const phoneBefore = p.phone;
  validateDonationProposal(p);
  assert.equal(p.phone, phoneBefore, 'L\'objet original ne doit pas être muté');
  assert.equal(p.fullName, '  Jane Doe  ', 'fullName original ne doit pas être muté');
});

test('value ne contient que les champs autorisés (pas de fuite)', () => {
  const p = base();
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  const forbiddenInValue = ['unknownField'];
  for (const k of forbiddenInValue) {
    assert.equal(k in res.value, false, `"${k}" ne doit pas apparaître dans value`);
  }
});

// ---------------------------------------------------------------------------
// 2. Type racine
// ---------------------------------------------------------------------------

test('null → required', () => {
  assert.deepStrictEqual(validateDonationProposal(null), { valid: false, errorField: 'required' });
});

test('tableau vide → required', () => {
  assert.deepStrictEqual(validateDonationProposal([]), { valid: false, errorField: 'required' });
});

test('tableau d\'objets → required', () => {
  assert.deepStrictEqual(validateDonationProposal([base()]), { valid: false, errorField: 'required' });
});

test('chaîne → required', () => {
  assert.deepStrictEqual(validateDonationProposal('hello'), { valid: false, errorField: 'required' });
});

test('nombre → required', () => {
  assert.deepStrictEqual(validateDonationProposal(42), { valid: false, errorField: 'required' });
});

test('booléen true → required', () => {
  assert.deepStrictEqual(validateDonationProposal(true), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 3. Champs inconnus
// ---------------------------------------------------------------------------

test('champ inconnu → required', () => {
  const p = base();
  p.hackerField = 'oops';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 4. Champs obligatoires manquants
// ---------------------------------------------------------------------------

test('fullName absent → required', () => {
  const p = base(); delete p.fullName;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('fullName chaîne vide → required', () => {
  const p = base(); p.fullName = '   ';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('fullName nombre → required (type strict)', () => {
  const p = base(); p.fullName = 42;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('role absent → required', () => {
  const p = base(); delete p.role;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('role tableau → required (type strict)', () => {
  const p = base(); p.role = ['Directrice'];
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('companyName absent → required', () => {
  const p = base(); delete p.companyName;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('country absent → required', () => {
  const p = base(); delete p.country;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('targetMarkets absent → required', () => {
  const p = base(); delete p.targetMarkets;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('email absent → required', () => {
  const p = base(); delete p.email;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('phone absent → required', () => {
  const p = base(); delete p.phone;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('projectDescription absent → required', () => {
  const p = base(); delete p.projectDescription;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 5. Consentement strict
// ---------------------------------------------------------------------------

test('consent false → required', () => {
  const p = base(); p.consent = false;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('consent absent → required', () => {
  const p = base(); delete p.consent;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('consent "true" (chaîne) → required', () => {
  const p = base(); p.consent = 'true';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('consent 1 (nombre) → required', () => {
  const p = base(); p.consent = 1;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 6. Langue – 9 langues exactes : fr en es ar it de pt zh ru
// ---------------------------------------------------------------------------

test('langue zh acceptée', () => {
  const p = base(); p.language = 'zh';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true, 'zh doit être acceptée');
});

test('langue ru acceptée', () => {
  const p = base(); p.language = 'ru';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true, 'ru doit être acceptée');
});

test('langue nl refusée', () => {
  const p = base(); p.language = 'nl';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'language' });
});

test('langue sv refusée', () => {
  const p = base(); p.language = 'sv';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'language' });
});

test('language absente → language', () => {
  const p = base(); delete p.language;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'language' });
});

test('language non reconnue → language', () => {
  const p = base(); p.language = 'xx';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'language' });
});

test('toutes les 9 langues supportées sont valides', () => {
  const langs = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
  for (const lang of langs) {
    const p = base(); p.language = lang;
    const res = validateDonationProposal(p);
    assert.equal(res.valid, true, `La langue "${lang}" devrait être valide`);
  }
});

// ---------------------------------------------------------------------------
// 7. supportType
// ---------------------------------------------------------------------------

test('supportType non supporté → supportType', () => {
  const p = base(); p.supportType = 'unknown_type';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'supportType' });
});

test('supportType absent → supportType', () => {
  const p = base(); delete p.supportType;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'supportType' });
});

test('supportType vide → supportType', () => {
  const p = base(); p.supportType = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'supportType' });
});

test('tous les 6 supportTypes valides sont acceptés', () => {
  const types = [
    'future_financial_donation', 'equipment_donation', 'school_sponsorship',
    'educational_project_funding', 'skills_sponsorship', 'other_proposal',
  ];
  for (const t of types) {
    const p = base(); p.supportType = t;
    const res = validateDonationProposal(p);
    assert.equal(res.valid, true, `supportType "${t}" devrait être valide`);
  }
});

// ---------------------------------------------------------------------------
// 8. Secteur – enum et règles conditionnelles
// ---------------------------------------------------------------------------

test('sector inconnu → required', () => {
  const p = base(); p.sector = 'unknown_sector';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('sector nombre → required (type strict)', () => {
  const p = base(); p.sector = 42;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// Secteurs réglementés – license obligatoire
test('sector finance sans license → license', () => {
  const p = base(); p.sector = 'finance'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

test('sector insurance sans license → license', () => {
  const p = base(); p.sector = 'insurance'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

test('sector otherRegulated sans license → license', () => {
  const p = base(); p.sector = 'otherRegulated'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

// Secteurs non réglementés – license facultative
test('sector telecom sans license → valide', () => {
  const p = base(); p.sector = 'telecom'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

test('sector transport sans license → valide', () => {
  const p = base(); p.sector = 'transport'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

test('sector after_school_services sans license → valide', () => {
  const p = base(); p.sector = 'after_school_services'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

// mobility_services – subSector obligatoire
test('mobility_services sans subSector → subSector', () => {
  const p = base(); p.sector = 'mobility_services';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'subSector' });
});

test('mobility_services subSector inconnu → subSector', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = 'unknown';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'subSector' });
});

test('mobility_services + subSector insurance sans license → license', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = 'insurance'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

test('mobility_services + subSector transport sans license → valide', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = 'transport'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

test('mobility_services + subSector afterSchool → valide', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = 'afterSchool'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

test('mobility_services + subSector otherRegulated sans license → license', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = 'otherRegulated'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

// sector other – otherSectorDetails + regulationDeclaration obligatoires
test('sector other sans regulationDeclaration → regulationDeclaration', () => {
  const p = base(); p.sector = 'other'; p.otherSectorDetails = 'Détails';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'regulationDeclaration' });
});

test('sector other + regulationDeclaration invalide → regulationDeclaration', () => {
  const p = base(); p.sector = 'other'; p.otherSectorDetails = 'Détails'; p.regulationDeclaration = 'maybe';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'regulationDeclaration' });
});

test('sector other + regulationDeclaration yes sans otherSectorDetails → otherSectorDetails', () => {
  const p = base(); p.sector = 'other'; p.regulationDeclaration = 'yes';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'otherSectorDetails' });
});

test('sector other + regulationDeclaration yes + otherSectorDetails vide → otherSectorDetails', () => {
  const p = base(); p.sector = 'other'; p.regulationDeclaration = 'yes'; p.otherSectorDetails = '   ';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'otherSectorDetails' });
});

test('sector other + regulationDeclaration yes + otherSectorDetails + license → license', () => {
  const p = base();
  p.sector = 'other'; p.regulationDeclaration = 'yes'; p.otherSectorDetails = 'Activité réglementée'; p.license = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'license' });
});

test('sector other + regulationDeclaration yes + otherSectorDetails + license → valide', () => {
  const p = base();
  p.sector = 'other'; p.regulationDeclaration = 'yes';
  p.otherSectorDetails = 'Activité réglementée'; p.license = 'LIC-001';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('sector other + regulationDeclaration no + otherSectorDetails → valide sans license', () => {
  const p = base();
  p.sector = 'other'; p.regulationDeclaration = 'no'; p.otherSectorDetails = 'Autre activité'; delete p.license;
  assert.equal(validateDonationProposal(p).valid, true);
});

// ngo_institutions – organizationType obligatoire
test('ngo_institutions sans organizationType → organizationType', () => {
  const p = base(); p.sector = 'ngo_institutions';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'organizationType' });
});

test('ngo_institutions + organizationType inconnu → organizationType', () => {
  const p = base(); p.sector = 'ngo_institutions'; p.organizationType = 'unknown_org';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'organizationType' });
});

test('ngo_institutions + organizationType ngo → valide', () => {
  const p = base(); p.sector = 'ngo_institutions'; p.organizationType = 'ngo';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('ngo_institutions + organizationType foundation → valide', () => {
  const p = base(); p.sector = 'ngo_institutions'; p.organizationType = 'foundation';
  assert.equal(validateDonationProposal(p).valid, true);
});

// ---------------------------------------------------------------------------
// 9. Email
// ---------------------------------------------------------------------------

test('email invalide → email', () => {
  const p = base(); p.email = 'pas-un-email';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'email' });
});

test('email sans domaine → email', () => {
  const p = base(); p.email = 'user@';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'email' });
});

test('email nombre → required (type strict)', () => {
  const p = base(); p.email = 123;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 10. Téléphone – normalizePhone sans second argument
// ---------------------------------------------------------------------------

test('numéro national (sans +/00) refusé même si country = FR', () => {
  // normalizePhone appelé sans 2e argument → COUNTRY_REQUIRED ou INVALID_PHONE
  const p = base(); p.phone = '0612345678'; // national FR sans préfixe international
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'phone' });
});

test('numéro trop court → phone', () => {
  const p = base(); p.phone = '+331';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'phone' });
});

test('numéro E.164 valide FR → valide', () => {
  const p = base(); p.phone = '+33612345678';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('numéro 00... (équivalent +) → valide', () => {
  // helpers.js convertit 00... en + avant parsing
  const p = base(); p.phone = '0033612345678';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('phone booléen → required (type strict)', () => {
  const p = base(); p.phone = true;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 11. Website – new URL(), protocole http/https, hostname
// ---------------------------------------------------------------------------

test('website invalide (pas d\'URL) → website', () => {
  const p = base(); p.website = 'pas-une-url';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website sans protocole → website', () => {
  const p = base(); p.website = 'example.com';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website ftp:// → website (protocole non http/https)', () => {
  const p = base(); p.website = 'ftp://example.com';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website booléen → website (type strict)', () => {
  const p = base(); p.website = true;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website nombre → website (type strict)', () => {
  const p = base(); p.website = 42;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website tableau → website (type strict)', () => {
  const p = base(); p.website = [];
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website objet → website (type strict)', () => {
  const p = base(); p.website = {};
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website vide (optionnel) → valide', () => {
  const p = base(); p.website = '';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('website absent (optionnel) → valide', () => {
  const p = base(); delete p.website;
  assert.equal(validateDonationProposal(p).valid, true);
});

test('website https valide → valide', () => {
  const p = base(); p.website = 'https://example.com';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('website http valide → valide', () => {
  const p = base(); p.website = 'http://example.org/page';
  assert.equal(validateDonationProposal(p).valid, true);
});

// ---------------------------------------------------------------------------
// 12. Description du projet – limite 5000 caractères
// ---------------------------------------------------------------------------

test('projectDescription = 5000 caractères → valide', () => {
  const p = base(); p.projectDescription = 'a'.repeat(5000);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('projectDescription = 5001 caractères → payloadTooLong', () => {
  const p = base(); p.projectDescription = 'a'.repeat(5001);
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'payloadTooLong' });
});

test('projectDescription nombre → required (type strict)', () => {
  const p = base(); p.projectDescription = 9999;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 13. Champs optionnels – vides acceptés hors secteurs concernés
// ---------------------------------------------------------------------------

test('subSector vide hors mobility_services → valide (traité comme absent)', () => {
  const p = base(); p.subSector = '';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('subSector vide hors mobility_services absent de value', () => {
  const p = base(); p.subSector = '';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.equal('subSector' in res.value, false, 'subSector vide ne doit pas figurer dans value');
});

test('regulationDeclaration vide hors secteur other → valide (traité comme absent)', () => {
  const p = base(); p.regulationDeclaration = '';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('regulationDeclaration vide hors secteur other absent de value', () => {
  const p = base(); p.regulationDeclaration = '';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.equal('regulationDeclaration' in res.value, false, 'regulationDeclaration vide ne doit pas figurer dans value');
});

test('organizationType vide hors ngo_institutions → valide (traité comme absent)', () => {
  const p = base(); p.organizationType = '';
  assert.equal(validateDonationProposal(p).valid, true);
});

test('organizationType vide hors ngo_institutions absent de value', () => {
  const p = base(); p.organizationType = '';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.equal('organizationType' in res.value, false, 'organizationType vide ne doit pas figurer dans value');
});

// ---------------------------------------------------------------------------
// 14. Champs obligatoires vides dans les secteurs concernés – refus
// ---------------------------------------------------------------------------

test('mobility_services + subSector vide → subSector refusé', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'subSector' });
});

test('mobility_services + subSector espaces → subSector refusé', () => {
  const p = base(); p.sector = 'mobility_services'; p.subSector = '   ';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'subSector' });
});

test('sector other + regulationDeclaration vide → regulationDeclaration refusé', () => {
  const p = base();
  p.sector = 'other'; p.otherSectorDetails = 'Détails'; p.regulationDeclaration = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'regulationDeclaration' });
});

test('ngo_institutions + organizationType vide → organizationType refusé', () => {
  const p = base(); p.sector = 'ngo_institutions'; p.organizationType = '';
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'organizationType' });
});

// ---------------------------------------------------------------------------
// 15. Website – null refusé, limite 2048 caractères
// ---------------------------------------------------------------------------

test('website null → website refusé', () => {
  const p = base(); p.website = null;
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'website' });
});

test('website URL valide de 2048 caractères → valide', () => {
  const p = base();
  const prefix = 'https://a.com/';
  p.website = prefix + 'a'.repeat(2048 - prefix.length);

  assert.equal(p.website.length, 2048);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('website URL de 2049 caractères → website refusé', () => {
  const p = base();
  const prefix = 'https://a.com/';
  p.website = prefix + 'a'.repeat(2049 - prefix.length);

  assert.equal(p.website.length, 2049);
  assert.deepStrictEqual(validateDonationProposal(p), {
    valid: false,
    errorField: 'website',
  });
});

// ---------------------------------------------------------------------------
// 16. Limites textuelles exactes et dépassements
// ---------------------------------------------------------------------------

test('fullName = 100 caractères → valide', () => {
  const p = base(); p.fullName = 'a'.repeat(100);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('fullName = 101 caractères → required (dépassement)', () => {
  const p = base(); p.fullName = 'a'.repeat(101);
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('role = 100 caractères → valide', () => {
  const p = base(); p.role = 'a'.repeat(100);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('role = 101 caractères → required (dépassement)', () => {
  const p = base(); p.role = 'a'.repeat(101);
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('companyName = 200 caractères → valide', () => {
  const p = base(); p.companyName = 'a'.repeat(200);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('companyName = 201 caractères → required (dépassement)', () => {
  const p = base(); p.companyName = 'a'.repeat(201);
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

test('targetMarkets = 300 caractères → valide', () => {
  const p = base(); p.targetMarkets = 'a'.repeat(300);
  assert.equal(validateDonationProposal(p).valid, true);
});

test('targetMarkets = 301 caractères → required (dépassement)', () => {
  const p = base(); p.targetMarkets = 'a'.repeat(301);
  assert.deepStrictEqual(validateDonationProposal(p), { valid: false, errorField: 'required' });
});

// ---------------------------------------------------------------------------
// 17. Téléphone normalisé – 0033... retourné comme +33...
// ---------------------------------------------------------------------------

test('numéro 0033612345678 retourné comme +33612345678 dans value', () => {
  const p = base(); p.phone = '0033612345678';
  const res = validateDonationProposal(p);
  assert.equal(res.valid, true);
  assert.equal(res.value.phone, '+33612345678');
});

// ---------------------------------------------------------------------------
// 18. Absence de mutation – vérification sur l'objet complet
// ---------------------------------------------------------------------------

test('absence de mutation sur l\'objet complet', () => {
  const p = base();
  p.sector = 'other';
  p.regulationDeclaration = 'no';
  p.otherSectorDetails = '  Détails  ';
  const snapshot = JSON.stringify(p);
  validateDonationProposal(p);
  assert.equal(JSON.stringify(p), snapshot, "L'objet d'entrée ne doit pas être muté");
});

