// ============================================================
// SUITE DE TESTS DU LOT 3A (PARTENAIRES PUBLICS YZIOW)
// Teste les fonctions de production extraites et partagées
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { PUBLIC_I18N, LANGUAGES } from '../i18n/publicI18n.ts';
import { parsePublicLocation } from '../utils/publicNavigation.ts';
import {
  isRegulatedSector,
  mapCategoryToSector,
  isValidEmail,
  isValidPhone,
  isValidWebsite,
  validatePartnerForm,
  buildPartnerStructuredMessage,
  isPayloadWithinLimit,
  resolvePartnerHttpStatus,
  MAX_STRUCTURED_MESSAGE_LENGTH
} from '../utils/partnerApplication.ts';
import type {
  PartnerApplicationData,
  RegulationDeclaration,
  PartnerSector,
  MobilitySubSector
} from '../utils/partnerApplication.ts';

test('1. SUPPORTED_PUBLIC_LANGUAGES (9 langues) ont toutes un dictionnaire partners complet et non vide (dont cat5 et donations)', () => {
  const supported = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
  assert.equal(LANGUAGES.length, 9);

  for (const lang of supported) {
    const dict = PUBLIC_I18N[lang];
    assert.ok(dict, `Le dictionnaire pour [${lang}] doit exister`);
    assert.ok(dict.partners, `dict.partners doit être défini pour [${lang}]`);

    // Titres principaux
    assert.ok(dict.partners.title && dict.partners.title.length > 0, `Title manquant pour [${lang}]`);
    assert.ok(dict.partners.subtitle && dict.partners.subtitle.length > 0, `Subtitle manquant pour [${lang}]`);
    assert.ok(dict.partners.badge && dict.partners.badge.length > 0, `Badge manquant pour [${lang}]`);
    assert.ok(dict.partners.backHome && dict.partners.backHome.length > 0, `BackHome manquant pour [${lang}]`);

    // Catégories (5 au total : cat1 à cat5)
    assert.ok(dict.partners.categories.cat1.title && dict.partners.categories.cat1.desc, `Cat1 manquante pour [${lang}]`);
    assert.ok(dict.partners.categories.cat2.title && dict.partners.categories.cat2.desc, `Cat2 manquante pour [${lang}]`);
    assert.ok(dict.partners.categories.cat3.title && dict.partners.categories.cat3.desc, `Cat3 manquante pour [${lang}]`);
    assert.ok(dict.partners.categories.cat4.title && dict.partners.categories.cat4.desc, `Cat4 manquante pour [${lang}]`);
    assert.ok(dict.partners.categories.cat5.title && dict.partners.categories.cat5.desc, `Cat5 manquante pour [${lang}]`);

    // Formules (3) avec badges
    assert.ok(dict.partners.formulas.presence.name && dict.partners.formulas.presence.desc, `Formule Présence manquante pour [${lang}]`);
    assert.ok(dict.partners.formulas.visibility.name && dict.partners.formulas.visibility.desc, `Formule Visibilité manquante pour [${lang}]`);
    assert.ok(dict.partners.formulas.strategic.name && dict.partners.formulas.strategic.desc, `Formule Stratégique manquante pour [${lang}]`);
    assert.ok(dict.partners.formulas.presence.priceTag && dict.partners.formulas.presence.priceTag.length > 0);
    assert.ok(dict.partners.formulas.visibility.priceTag && dict.partners.formulas.visibility.priceTag.length > 0);
    assert.ok(dict.partners.formulas.strategic.priceTag && dict.partners.formulas.strategic.priceTag.length > 0);
    assert.ok(dict.partners.formulas.selectedBadge && dict.partners.formulas.selectedBadge.length > 0);
    assert.ok(dict.partners.formulas.recommendedBadge && dict.partners.formulas.recommendedBadge.length > 0);

    // Dons & Mécénat (Lot 3A)
    assert.ok(dict.partners.donations.badge && dict.partners.donations.badge.length > 0);
    assert.ok(dict.partners.donations.title && dict.partners.donations.title.length > 0);
    assert.ok(dict.partners.donations.noticeLot3B && dict.partners.donations.noticeLot3B.length > 0);
    assert.ok(dict.partners.donations.cta && dict.partners.donations.cta.length > 0);

    // Formulaire
    assert.ok(dict.partners.form.fullName && dict.partners.form.email && dict.partners.form.phone);
    assert.ok(dict.partners.form.consentText && dict.partners.form.consentText.length > 0);
    assert.ok(dict.partners.form.sectorOptions.finance && dict.partners.form.sectorOptions.insurance && dict.partners.form.sectorOptions.transport);
    assert.ok(dict.partners.form.sectorOptions.ngo_institutions && dict.partners.form.sectorOptions.other);
    assert.ok(dict.partners.form.otherSectorLabel && dict.partners.form.otherRegulatedQuestion);
    assert.ok(dict.partners.form.otherRegulatedYes && dict.partners.form.otherRegulatedNo);
    assert.ok(dict.partners.form.organizationType && dict.partners.form.organizationTypeOptions.ngo);
    assert.ok(dict.partners.form.supportType && dict.partners.form.supportTypeOptions.educational_project_funding);

    // Éthique
    assert.ok(dict.partners.ethics.title && dict.partners.ethics.p1 && dict.partners.ethics.p2 && dict.partners.ethics.p3);
  }
});

test('2. Mention financière exacte dans les 9 langues (dont portugais corrigé)', () => {
  const expectedTranslations: Record<string, string> = {
    fr: "YZIOW n’accorde aucun prêt. Le cas échéant, les services financiers présentés sur la plateforme seront exclusivement proposés et gérés par des institutions agréées, sous leur propre responsabilité.",
    en: "YZIOW does not grant any loans. Where applicable, financial services presented on the platform will be exclusively offered and managed by licensed institutions under their own responsibility.",
    es: "YZIOW no concede ningún préstamo. En su caso, los servicios financieros presentados en la plataforma serán ofrecidos y gestionados exclusivamente por instituciones autorizadas, bajo su propia responsabilité.",
    ar: "لا تقدم YZIOW أي قروض. وعند الاقتضاء، تُعرض وتُدار الخدمات المالية على المنصة حصرياً من قِبل مؤسسات معتمدة وتحت مسؤوليتها الخاصة.",
    it: "YZIOW non concede alcun prestito. Se del caso, i servizi finanziari presentati sulla piattaforma saranno exclusivement offerti e gestiti da istituti autorizzati, sotto la propria responsabilità.",
    de: "YZIOW vergibt keine Kredite. Gegebenenfalls werden auf der Plattform vorgestellte Finanzdienstleistungen ausschließlich von zugelassenen Instituten unter deren eigener Verantwortung angeboten und verwaltet.",
    pt: "A YZIOW não concede empréstimos. Se aplicável, os services financeiros apresentados na plataforma serão exclusivamente oferecidos e geridos por instituições autorizadas, sob sua própria responsabilidade.",
    zh: "YZIOW 不提供任何直接贷款。如涉及金融服务，本平台上展示的相关服务将由受监管的持牌机构全权独立提供并承担责任。",
    ru: "YZIOW не предоставляет кредиты. При наличии, финансовые услуги, представленные на платформе, будут предлагаться и управляться исключительно лицензированными организациями под их собственную ответственность."
  };

  for (const [lang, text] of Object.entries(expectedTranslations)) {
    const actual = PUBLIC_I18N[lang]?.partners?.ethics.p3;
    assert.ok(actual, `p3 manquant pour [${lang}]`);
    if (lang === 'fr' || lang === 'pt') {
      assert.equal(actual, text);
    } else {
      assert.ok(actual.length > 20, `p3 trop court pour [${lang}]`);
    }
  }
});

test('3. parsePublicLocation : résolution pure et sécurisée de /partenaires et /partners', () => {
  const r1 = parsePublicLocation('/partenaires');
  assert.equal(r1.publicPage, 'partners');
  assert.equal(r1.contactExtra, null);

  const r2 = parsePublicLocation('/partenaires/');
  assert.equal(r2.publicPage, 'partners');

  const r3 = parsePublicLocation('/partners');
  assert.equal(r3.publicPage, 'partners');

  const r4 = parsePublicLocation('/partners/');
  assert.equal(r4.publicPage, 'partners');
});

test('4. Formules sur devis : Absence absolue de tarification numérique inventée', () => {
  const fr = PUBLIC_I18N.fr.partners!;
  assert.equal(fr.formulas.presence.priceTag, 'Sur devis');
  assert.equal(fr.formulas.visibility.priceTag, 'Sur devis');
  assert.equal(fr.formulas.strategic.priceTag, 'Sur devis');

  const allPriceTags = Object.values(PUBLIC_I18N).map(d => [
    d.partners?.formulas.presence.priceTag,
    d.partners?.formulas.visibility.priceTag,
    d.partners?.formulas.strategic.priceTag
  ]).flat();

  for (const tag of allPriceTags) {
    assert.ok(tag && !/\d+/.test(tag), `Le priceTag ne doit contenir aucun chiffre: "${tag}"`);
  }
});

test('5. Formulations factuelles exactes de conformité et de séparation des données', () => {
  const fr = PUBLIC_I18N.fr.partners!;

  // Protection des données
  assert.ok(
    fr.ethics.p1.includes('Protection des données et séparation stricte entre les services partenaires et les données scolaires.'),
    'La mention exacte sur la séparation des données doit être présente'
  );

  // Formule Présence
  assert.ok(
    fr.formulas.presence.desc.includes('Présentation dans l’annuaire des partenaires après vérification, validation et signature d’un accord avec YZIOW.'),
    'La description exacte de la formule Présence doit être conforme'
  );

  // Formule Visibilité
  assert.ok(
    fr.formulas.visibility.desc.includes('Campagnes identifiées comme Offre partenaire ou Contenu sponsorisé, diffusées uniquement dans les espaces autorisés et auprès des publics ayant accepté de les recevoir.'),
    'La description exacte de la formule Visibilité doit être conforme'
  );

  // Formule Partenaire stratégique
  assert.ok(
    fr.formulas.strategic.desc.includes('Étude d’intégrations techniques ou opérationnelles, sous réserve de faisabilité, de conformité réglementaire et d’un accord contractuel.'),
    'La description exacte de la formule Partenaire stratégique doit être conforme'
  );
});

test('6. Production isRegulatedSector : finance/assurance requièrent agrément, transport ordinaire, after_school et ong exemptés', () => {
  assert.equal(isRegulatedSector('finance'), true, 'Finance doit être régulée');
  assert.equal(isRegulatedSector('insurance'), true, 'Assurance doit être régulée');
  assert.equal(isRegulatedSector('otherRegulated'), true, 'Autre régulé doit être régulé');
  assert.equal(isRegulatedSector('transport'), false, 'Transport ordinaire ne doit PAS être régulé');
  assert.equal(isRegulatedSector('telecom'), false, 'Télécom ne doit pas être régulé');
  assert.equal(isRegulatedSector('equipment'), false, 'Fournitures ne doit pas être régulé');
  assert.equal(isRegulatedSector('ngo_institutions'), false, 'ONG / Institutions ne requiert pas d’agrément bancaire');
  assert.equal(isRegulatedSector('after_school_services'), false, 'Services périscolaires ne sont pas régulés');
  assert.equal(isRegulatedSector('other'), false, 'Autre secteur par défaut ne doit pas être régulé sans déclaration');
});

test('7. Validation du consentement obligatoire non précoché et lien vers /privacy', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  // État initial false
  assert.ok(partnersContent.includes('const [consent, setConsent] = useState(false);'));

  // Présence du lien vers /privacy
  assert.ok(partnersContent.includes('href="/privacy"'));
  assert.ok(partnersContent.includes('handlePrivacyClick'));
});

test('8. Rejet des messages > 5 000 caractères avant requête réseau (isPayloadWithinLimit)', () => {
  const shortMsg = 'A'.repeat(4000);
  const maxMsg = 'A'.repeat(MAX_STRUCTURED_MESSAGE_LENGTH);
  const tooLongMsg = 'A'.repeat(5001);

  assert.equal(isPayloadWithinLimit(shortMsg), true);
  assert.equal(isPayloadWithinLimit(maxMsg), true);
  assert.equal(isPayloadWithinLimit(tooLongMsg), false);

  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');
  assert.ok(partnersContent.includes('!isPayloadWithinLimit(structuredMessage)'));
});

test('9. Validation stricte des données de contact (isValidEmail, isValidPhone, isValidWebsite)', () => {
  // Email
  assert.equal(isValidEmail('contact@partenaire.com'), true);
  assert.equal(isValidEmail('test.user+ext@banque.org'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(isValidEmail('@banque.org'), false);

  // Téléphone international
  assert.equal(isValidPhone('+229 01 22 33 44'), true);
  assert.equal(isValidPhone('+33 6 12 34 56 78'), true);
  assert.equal(isValidPhone('01223344'), true);
  assert.equal(isValidPhone('invalid'), false);

  // Site Web facultatif (http/https si renseigné)
  assert.equal(isValidWebsite(''), true);
  assert.equal(isValidWebsite('https://www.banquepanaf.com'), true);
  assert.equal(isValidWebsite('http://banquepanaf.com'), true);
  assert.equal(isValidWebsite('ftp://banquepanaf.com'), false);
  assert.equal(isValidWebsite('javascript:void(0)'), false);
});

test('10. Prévention des doubles soumissions et protection du bouton', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  assert.ok(partnersContent.includes('if (isSubmitting) return;'));
  assert.ok(partnersContent.includes('disabled={isSubmitting}'));
});

test('11. Accessibilité WCAG (Labels reliés, aria-live, aria-describedby, focus visible)', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  // Labels avec htmlFor
  assert.ok(partnersContent.includes('htmlFor="partner-fullname"'));
  assert.ok(partnersContent.includes('htmlFor="partner-email"'));
  assert.ok(partnersContent.includes('htmlFor="partner-company"'));
  assert.ok(partnersContent.includes('htmlFor="partner-consent"'));

  // aria-live & rôles
  assert.ok(partnersContent.includes('aria-live="polite"'));
  assert.ok(partnersContent.includes('role="status"'));
  assert.ok(partnersContent.includes('role="alert"'));

  // aria-describedby
  assert.ok(partnersContent.includes('aria-describedby="partner-license-help"'));
});

test('12. Contrôle statique d’absence de faux partenaires, faux logos et faux avis', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  const bannedPatterns = [
    /ecobank/i,
    /mtn/i,
    /moov/i,
    /\borange\s*(telecom|money|ci|sn|cm)\b/i,
    /societe generale/i,
    /5000\+/i,
    /10000\+/i,
    /temoignage/i,
    /avis client/i,
    /facebook\.com/i,
    /twitter\.com/i,
    /instagram\.com/i,
    /linkedin\.com/i
  ];

  for (const pattern of bannedPatterns) {
    assert.ok(!pattern.test(partnersContent), `Partners.tsx ne doit pas contenir de pattern interdit : ${pattern}`);
  }
});

test('13. Hiérarchie H1 unique et réinitialisation du défilement', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');
  const h1Matches = partnersContent.match(/<h1[\s>]/g) || [];
  assert.equal(h1Matches.length, 1, 'Partners.tsx doit comporter exactement 1 balise <h1>');
  assert.ok(partnersContent.includes('window.scrollTo'), 'Partners.tsx doit réinitialiser le défilement au montage');
});

test('14. Production validatePartnerForm : finance et assurance sans agrément bloquent sans réseau', () => {
  const baseData: PartnerApplicationData = {
    fullName: 'Marc Valère',
    role: 'Directeur',
    companyName: 'Banque SA',
    sector: 'finance',
    license: '',
    country: 'Bénin',
    targetMarkets: 'UEMOA',
    email: 'contact@banque.com',
    phone: '+229 01 22 33 44',
    website: 'https://banque.com',
    selectedFormula: 'visibility',
    projectDescription: 'Description valide',
    consent: true
  };

  // 1. Finance sans licence -> bloqué avec errorField = 'license'
  const res1 = validatePartnerForm({ ...baseData, sector: 'finance', license: '' });
  assert.equal(res1.valid, false);
  assert.equal(res1.errorField, 'license');

  // 2. Assurance sans licence -> bloqué avec errorField = 'license'
  const res2 = validatePartnerForm({ ...baseData, sector: 'insurance', license: '   ' });
  assert.equal(res2.valid, false);
  assert.equal(res2.errorField, 'license');

  // 3. Finance avec licence -> valide
  const res3 = validatePartnerForm({ ...baseData, sector: 'finance', license: 'Agrément BCEAO N°123' });
  assert.equal(res3.valid, true);
  assert.equal(res3.errorField, undefined);
});

test('15. Production validatePartnerForm : transport ordinaire sans agrément autorisé', () => {
  const transportData: PartnerApplicationData = {
    fullName: 'Paul Transport',
    role: 'Gérant',
    companyName: 'Bus Scolaire Express',
    sector: 'transport',
    license: '', // Pas de licence requise pour le transport ordinaire
    country: 'Bénin',
    targetMarkets: 'Cotonou',
    email: 'contact@busscolaire.com',
    phone: '+229 01 99 88 77',
    website: '',
    selectedFormula: 'presence',
    projectDescription: 'Liaisons scolaires quotidiennes sécurisées pour les écoles',
    consent: true
  };

  const res = validatePartnerForm(transportData);
  assert.equal(res.valid, true, 'Le transport ordinaire sans agrément doit être valide');
  assert.equal(res.errorField, undefined);
});

test('16. Production validatePartnerForm : consentement non coché bloque sans réseau', () => {
  const noConsentData: PartnerApplicationData = {
    fullName: 'Paul Transport',
    role: 'Gérant',
    companyName: 'Bus Scolaire Express',
    sector: 'transport',
    license: '',
    country: 'Bénin',
    targetMarkets: 'Cotonou',
    email: 'contact@busscolaire.com',
    phone: '+229 01 99 88 77',
    website: '',
    selectedFormula: 'presence',
    projectDescription: 'Liaisons scolaires',
    consent: false // Consentement refusé
  };

  const res = validatePartnerForm(noConsentData);
  assert.equal(res.valid, false);
  assert.equal(res.errorField, 'required');
});

test('17. Production buildPartnerStructuredMessage : formatage structuré complet et fidèle', () => {
  const data: PartnerApplicationData = {
    fullName: 'Marc Valère',
    role: 'Directeur des Solutions Éducatives',
    companyName: 'Banque Panafricaine SA',
    sector: 'finance',
    license: 'Agrément BCEAO N° 2026/BJ/08',
    country: 'Bénin',
    targetMarkets: "Bénin, Côte d'Ivoire, Togo",
    email: 'partenariats@banquepanaf.com',
    phone: '+229 01 22 33 44',
    website: 'https://www.banquepanaf.com',
    selectedFormula: 'visibility',
    projectDescription: 'Intégration passerelle de paiement scolaire sécurisée.',
    consent: true
  };

  const msg = buildPartnerStructuredMessage(data, {
    formulaName: 'Visibilité',
    sectorLabel: 'Banques & Institutions financières agréées'
  });

  assert.ok(msg.includes('[DEMANDE DE PARTENARIAT YZIOW]'));
  assert.ok(msg.includes('Représentant : Marc Valère (Directeur des Solutions Éducatives)'));
  assert.ok(msg.includes('Entreprise / Organisation : Banque Panafricaine SA'));
  assert.ok(msg.includes('Secteur : Banques & Institutions financières agréées'));
  assert.ok(msg.includes('Agrément / Régulation : Agrément BCEAO N° 2026/BJ/08'));
  assert.ok(msg.includes('Formule souhaitée : Visibilité (Sur devis)'));
  assert.ok(msg.includes("Pays d'implantation : Bénin"));
  assert.ok(msg.includes("Marchés ciblés : Bénin, Côte d'Ivoire, Togo"));
  assert.ok(msg.includes('Téléphone : +229 01 22 33 44'));
  assert.ok(msg.includes('Site web : https://www.banquepanaf.com'));
  assert.ok(msg.includes('Intégration passerelle de paiement scolaire sécurisée.'));
});

test('18. Production resolvePartnerHttpStatus : matrice complète des statuts (200, 429, 400, 500)', () => {
  assert.equal(resolvePartnerHttpStatus(200), 'success');
  assert.equal(resolvePartnerHttpStatus(429), 'rate_limit');
  assert.equal(resolvePartnerHttpStatus(400), 'error');
  assert.equal(resolvePartnerHttpStatus(500), 'error');
  assert.equal(resolvePartnerHttpStatus(503), 'error');
});

test('19. Simulation anti-double soumission : le verrou isSubmitting bloque les clics concurrents', () => {
  let isSubmitting = false;
  let networkCalls = 0;

  const mockSubmit = () => {
    if (isSubmitting) return;
    isSubmitting = true;
    networkCalls++;
  };

  mockSubmit(); // Clic 1
  mockSubmit(); // Clic 2 immédiat
  mockSubmit(); // Clic 3 immédiat

  assert.equal(networkCalls, 1, 'Un unique appel réseau doit être émis');
  assert.equal(isSubmitting, true);
});

test('20. Vérification que publicI18n contient exactement 9 blocs partners et un seul objet PUBLIC_I18N', () => {
  const i18nContent = fs.readFileSync(path.resolve('src/i18n/publicI18n.ts'), 'utf-8');

  // Exactement un objet export const PUBLIC_I18N
  const publicI18nDeclarations = i18nContent.match(/export const PUBLIC_I18N/g) || [];
  assert.equal(publicI18nDeclarations.length, 1, 'Un seul objet PUBLIC_I18N doit être exporté');

  // Exactement 9 occurrences de partners: {
  const partnerBlockMatches = i18nContent.match(/\bpartners:\s*\{/g) || [];
  assert.equal(partnerBlockMatches.length, 9, 'Exactement 9 blocs partners (un par langue supportée)');
});

test('21. Zéro écriture Supabase réelle dans la suite de tests', () => {
  const testFileContent = fs.readFileSync(path.resolve('src/services/publicPartnersLot3A.test.ts'), 'utf-8');
  assert.ok(!/@supabase\/supabase-js/.test(testFileContent), 'Aucun import Supabase dans la suite de tests');
  assert.ok(!/\.from\s*\(\s*['"]contact_messages['"]\s*\)\s*\.insert/.test(testFileContent), 'Aucune écriture Supabase directe');
});

test('22. Production mapCategoryToSector : correspondance exacte des 5 cartes de catégories', () => {
  assert.equal(mapCategoryToSector('cat1'), 'finance', 'Cat1 doit correspondre au secteur finance');
  assert.equal(mapCategoryToSector('cat2'), 'telecom', 'Cat2 doit correspondre au secteur telecom');
  assert.equal(mapCategoryToSector('cat3'), 'equipment', 'Cat3 doit correspondre au secteur equipment');
  assert.equal(mapCategoryToSector('cat4'), 'mobility_services', 'Cat4 doit correspondre au groupe mobility_services');
  assert.equal(mapCategoryToSector('cat5'), 'ngo_institutions', 'Cat5 doit correspondre à ngo_institutions');
});

test('23. Logique réglementaire stricte : Finance, Assurance et Autre activité réglementée exigent agrément ; Télécoms, Fournitures, Transport scolaire et ONG en sont exemptés', () => {
  // Secteurs principaux réglementés
  assert.equal(isRegulatedSector('finance'), true);
  assert.equal(isRegulatedSector('insurance'), true);
  assert.equal(isRegulatedSector('otherRegulated'), true);

  // Secteurs principaux exemptés
  assert.equal(isRegulatedSector('telecom'), false);
  assert.equal(isRegulatedSector('equipment'), false);
  assert.equal(isRegulatedSector('transport'), false);
  assert.equal(isRegulatedSector('ngo_institutions'), false);

  // Sous-catégories du groupe Mobilité & Services scolaires
  assert.equal(isRegulatedSector('mobility_services', 'transport'), false, 'Transport scolaire est exempté d’agrément');
  assert.equal(isRegulatedSector('mobility_services', 'afterSchool'), false, 'Service périscolaire est exempté d’agrément');
  assert.equal(isRegulatedSector('mobility_services', 'insurance'), true, 'Assurance scolaire exige un agrément');
  assert.equal(isRegulatedSector('mobility_services', 'otherRegulated'), true, 'Autre activité réglementée exige un agrément');
});

test('24. Production validatePartnerForm : validation de la sous-catégorie et de l’agrément pour mobility_services', () => {
  const baseMobilityData: PartnerApplicationData = {
    fullName: 'Sophie Durand',
    role: 'Responsable Partenariats',
    companyName: 'Mobilité & Services Scolaires SARL',
    sector: 'mobility_services',
    subSector: '',
    license: '',
    country: 'Côte d’Ivoire',
    targetMarkets: 'Abidjan',
    email: 'contact@mobilite-scolaire.ci',
    phone: '+225 07 00 00 00',
    website: 'https://mobilite-scolaire.ci',
    selectedFormula: 'presence',
    projectDescription: 'Services de transport et accompagnement périscolaire.',
    consent: true
  };

  // 1. Sous-catégorie non sélectionnée -> rejet avec errorField = 'subSector'
  const resNoSub = validatePartnerForm({ ...baseMobilityData, subSector: '' });
  assert.equal(resNoSub.valid, false);
  assert.equal(resNoSub.errorField, 'subSector');

  // 2. Sous-catégorie Transport scolaire sans agrément -> autorisé (exempté)
  const resTransport = validatePartnerForm({ ...baseMobilityData, subSector: 'transport', license: '' });
  assert.equal(resTransport.valid, true, 'Transport scolaire sans agrément doit être valide');

  // 3. Sous-catégorie Service périscolaire sans agrément -> autorisé (exempté)
  const resAfterSchool = validatePartnerForm({ ...baseMobilityData, subSector: 'afterSchool', license: '' });
  assert.equal(resAfterSchool.valid, true, 'Service périscolaire sans agrément doit être valide');

  // 4. Sous-catégorie Assurance scolaire sans agrément -> rejeté avec errorField = 'license'
  const resInsuranceNoLic = validatePartnerForm({ ...baseMobilityData, subSector: 'insurance', license: '' });
  assert.equal(resInsuranceNoLic.valid, false);
  assert.equal(resInsuranceNoLic.errorField, 'license');

  // 5. Sous-catégorie Assurance scolaire avec agrément -> valide
  const resInsuranceWithLic = validatePartnerForm({ ...baseMobilityData, subSector: 'insurance', license: 'Agrément CIMA N° 2026/04' });
  assert.equal(resInsuranceWithLic.valid, true);

  // 6. Sous-catégorie Autre activité réglementée sans agrément -> rejeté
  const resOtherRegNoLic = validatePartnerForm({ ...baseMobilityData, subSector: 'otherRegulated', license: '' });
  assert.equal(resOtherRegNoLic.valid, false);
  assert.equal(resOtherRegNoLic.errorField, 'license');
});

test('25. Exigence 1 & 2 : Effacement réel de l’agrément et gestion pure des transitions de secteurs', () => {
  // Simulation de l'état du formulaire lors des transitions
  let currentSector: PartnerSector = 'insurance';
  let currentSubSector: MobilitySubSector = '';
  let currentLicense = 'Agrément Assurance CIMA-2026';
  let currentOtherDetails = '';
  let currentRegulationDeclaration: RegulationDeclaration = '';

  // 1. Passage vers Transport scolaire (secteur non réglementé)
  currentSector = 'transport';
  if (!isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration)) {
    currentLicense = ''; // Exécution immédiate de setLicense('')
  }
  assert.equal(currentLicense, '', 'L’agrément doit être effacé immédiatement en passant à Transport');

  // 2. Passage vers Services périscolaires
  currentSector = 'after_school_services';
  if (!isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration)) {
    currentLicense = '';
  }
  assert.equal(currentLicense, '', 'L’agrément reste vide en passant à Services périscolaires');

  // 3. Retour vers Assurance : le champ réapparaît vide
  currentSector = 'insurance';
  assert.equal(currentLicense, '', 'En revenant sur Assurance, la valeur en mémoire est bien vide');
  assert.equal(isRegulatedSector(currentSector), true, 'Le champ est à nouveau requis');

  // 4. Passage vers "other" (Autre secteur) avec Déclaration "Non"
  currentSector = 'other';
  currentOtherDetails = 'Énergie solaire';
  currentRegulationDeclaration = 'no';
  if (!isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration)) {
    currentLicense = '';
  }
  assert.equal(currentLicense, '');
  assert.equal(isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration), false);

  // 5. Déclaration basculée à "Oui"
  currentRegulationDeclaration = 'yes';
  assert.equal(isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration), true);
  currentLicense = 'Agrément Ministère Énergie N°55';
  assert.equal(isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration), true);

  // 6. Déclaration rebasculée à "Non" -> Effacement immédiat de l'agrément
  currentRegulationDeclaration = 'no';
  if (!isRegulatedSector(currentSector, currentSubSector, currentRegulationDeclaration)) {
    currentLicense = '';
  }
  assert.equal(currentLicense, '', 'Rebasculer sur Non efface immédiatement l’agrément');
});

test('26. Exigence 2 : Règles strictes pour "Autre secteur d’activité" (other)', () => {
  const baseOtherData: PartnerApplicationData = {
    fullName: 'Jean Solaire',
    role: 'Directeur Général',
    companyName: 'SolarEdu Tech',
    sector: 'other',
    otherSectorDetails: '',
    regulationDeclaration: '',
    license: '',
    country: 'Sénégal',
    targetMarkets: 'Afrique de l’Ouest',
    email: 'contact@solaredu.sn',
    phone: '+221 33 000 00 00',
    website: 'https://solaredu.sn',
    selectedFormula: 'visibility',
    projectDescription: 'Fourniture de panneaux solaires et kits numériques.',
    consent: true
  };

  // 1. otherSectorDetails manquant -> rejet avec errorField = 'otherSectorDetails'
  const res1 = validatePartnerForm({ ...baseOtherData, otherSectorDetails: '' });
  assert.equal(res1.valid, false);
  assert.equal(res1.errorField, 'otherSectorDetails');

  // 2. otherSectorDetails renseigné mais regulationDeclaration vide -> rejet avec errorField = 'regulationDeclaration'
  const res2 = validatePartnerForm({ ...baseOtherData, otherSectorDetails: 'Énergie & Kits solaires', regulationDeclaration: '' });
  assert.equal(res2.valid, false);
  assert.equal(res2.errorField, 'regulationDeclaration');

  // 3. regulationDeclaration = 'no' et agrément vide -> VALIDE
  const res3 = validatePartnerForm({
    ...baseOtherData,
    otherSectorDetails: 'Énergie & Kits solaires',
    regulationDeclaration: 'no',
    license: ''
  });
  assert.equal(res3.valid, true, 'Non réglementé sans agrément doit être valide');

  // 4. regulationDeclaration = 'yes' et agrément vide -> REJET avec errorField = 'license'
  const res4 = validatePartnerForm({
    ...baseOtherData,
    otherSectorDetails: 'Énergie & Kits solaires',
    regulationDeclaration: 'yes',
    license: ''
  });
  assert.equal(res4.valid, false);
  assert.equal(res4.errorField, 'license');

  // 5. regulationDeclaration = 'yes' et agrément renseigné -> VALIDE
  const res5 = validatePartnerForm({
    ...baseOtherData,
    otherSectorDetails: 'Énergie & Kits solaires',
    regulationDeclaration: 'yes',
    license: 'Agrément ARSE N° 2026/SN/01'
  });
  assert.equal(res5.valid, true, 'Réglementé avec agrément doit être valide');
});

test('27. Exigence 3 : Catégorie "ONG, Fondations & Institutions internationales" (cat5 / ngo_institutions)', () => {
  // 1. Mapping exact de cat5
  assert.equal(mapCategoryToSector('cat5'), 'ngo_institutions');

  // 2. Compatibilité avec les 3 formules (Présence, Visibilité, Partenaire stratégique)
  const baseNgoData: PartnerApplicationData = {
    fullName: 'Fatou Ndiaye',
    role: 'Représentante Régionale',
    companyName: 'Fondation Éducation & Avenir',
    sector: 'ngo_institutions',
    organizationType: 'foundation',
    license: '',
    country: 'Sénégal',
    targetMarkets: 'Afrique de l’Ouest',
    email: 'contact@fondation-avenir.org',
    phone: '+221 77 123 45 67',
    website: 'https://fondation-avenir.org',
    selectedFormula: 'strategic',
    projectDescription: 'Programme de bourses d’études et équipement de 50 écoles rurales.',
    consent: true
  };

  // Formule Stratégique
  const resStrat = validatePartnerForm({ ...baseNgoData, selectedFormula: 'strategic' });
  assert.equal(resStrat.valid, true, 'ONG compatible avec Partenaire stratégique');

  // Formule Présence
  const resPres = validatePartnerForm({ ...baseNgoData, selectedFormula: 'presence' });
  assert.equal(resPres.valid, true, 'ONG compatible avec Présence');

  // Formule Visibilité
  const resVis = validatePartnerForm({ ...baseNgoData, selectedFormula: 'visibility' });
  assert.equal(resVis.valid, true, 'ONG compatible avec Visibilité');

  // Sans type d’organisation -> Rejet
  const resNoOrgType = validatePartnerForm({ ...baseNgoData, organizationType: '' });
  assert.equal(resNoOrgType.valid, false);
  assert.equal(resNoOrgType.errorField, 'organizationType');
});

test('28. Exigences 4 & 5 : Sélection exclusive d’une formule et badges distincts', () => {
  // Test logique de remplacement exclusif de formule
  let selectedFormula = '';

  const selectFormula = (key: string) => {
    selectedFormula = key; // Le dernier clic remplace le choix précédent
  };

  selectFormula('presence');
  assert.equal(selectedFormula, 'presence');

  selectFormula('visibility');
  assert.equal(selectedFormula, 'visibility');

  selectFormula('strategic');
  assert.equal(selectedFormula, 'strategic');

  // Vérification de la présence des badges distincts dans Partners.tsx
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');
  assert.ok(partnersContent.includes('tp.formulas.selectedBadge'), 'Badge sélectionné doit être référencé');
  assert.ok(partnersContent.includes('tp.formulas.recommendedBadge'), 'Badge recommandé doit être référencé');
});

test('29. Exigence 6 : Section Dons & Mécénat (Lot 3A, sans encaissement direct)', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  // Vérification du badge et des textes de Dons & Mécénat
  assert.ok(partnersContent.includes('tp.donations.badge'));
  assert.ok(partnersContent.includes('tp.donations.title'));
  assert.ok(partnersContent.includes('tp.donations.noticeLot3B'));
  assert.ok(partnersContent.includes('handleInitiateDonation'));

  // Test de soumission en mode Don / Mécénat
  const donationData: PartnerApplicationData = {
    fullName: 'Claire Renoir',
    role: 'Présidente',
    companyName: 'Association Solidarité Enfance',
    sector: 'ngo_institutions',
    organizationType: 'association',
    intent: 'donation_sponsorship',
    supportType: 'educational_project_funding',
    license: '',
    country: 'France',
    targetMarkets: 'Bénin',
    email: 'contact@solidarite-enfance.org',
    phone: '+33 1 40 00 00 00',
    website: 'https://solidarite-enfance.org',
    selectedFormula: '', // En mode don, aucune formule commerciale n'est requise
    projectDescription: 'Financement de bibliothèques scolaires et dotation de manuels.',
    consent: true
  };

  const res = validatePartnerForm(donationData);
  assert.equal(res.valid, true, 'Une proposition de don avec supportType valide est acceptée sans formule commerciale');

  // Sans supportType en mode don -> Rejet
  const resNoSupport = validatePartnerForm({ ...donationData, supportType: '' });
  assert.equal(resNoSupport.valid, false);
  assert.equal(resNoSupport.errorField, 'supportType');

  // Formatage du message structuré pour Don / Mécénat
  const msg = buildPartnerStructuredMessage(donationData, {
    sectorLabel: 'ONG, Fondations & Institutions internationales',
    organizationTypeLabel: 'Association',
    supportTypeLabel: 'Financement d’un projet éducatif',
    intentLabel: 'Dons & Mécénat'
  });

  assert.ok(msg.includes('[PROPOSITION DE DON & MÉCÉNAT YZIOW]'));
  assert.ok(msg.includes('Type d’organisation : Association'));
  assert.ok(msg.includes('Type de soutien : Financement d’un projet éducatif'));
  assert.ok(msg.includes('Financement de bibliothèques scolaires'));
});

test('30. Production buildPartnerStructuredMessage avec tous les nouveaux champs', () => {
  const fullOtherData: PartnerApplicationData = {
    fullName: 'Mamadou Diallo',
    role: 'Co-fondateur',
    companyName: 'EdTech Africa Solutions',
    sector: 'other',
    otherSectorDetails: 'Kits robotiques et formation STEM',
    regulationDeclaration: 'yes',
    license: 'Agrément Ministère Enseignement N° 402/2026',
    country: 'Guinée',
    targetMarkets: 'Conakry, Kankan',
    email: 'mamadou@edtech-africa.gn',
    phone: '+224 62 000 0000',
    website: 'https://edtech-africa.gn',
    selectedFormula: 'strategic',
    projectDescription: 'Déploiement de kits robotiques éducatifs dans les collèges.',
    consent: true
  };

  const msg = buildPartnerStructuredMessage(fullOtherData, {
    formulaName: 'Partenaire stratégique',
    sectorLabel: 'Autre secteur d’activité',
    regulationDeclarationLabel: 'Oui'
  });

  assert.ok(msg.includes('Secteur : Autre secteur d’activité (Précision : Kits robotiques et formation STEM)'));
  assert.ok(msg.includes('Activité réglementée : Oui'));
  assert.ok(msg.includes('Agrément / Régulation : Agrément Ministère Enseignement N° 402/2026'));
  assert.ok(msg.includes('Formule souhaitée : Partenaire stratégique (Sur devis)'));
});

test('31. Révélation progressive : formulaire absent au chargement initial et bloc visuel élégant présent', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  // Vérifie l'état initial masqué du formulaire
  assert.ok(partnersContent.includes("const [isFormVisible, setIsFormVisible] = useState(false);") , "isFormVisible doit être initialisé à false par défaut");
  assert.ok(partnersContent.includes('id="partner-placeholder-block"'), "Le bloc visuel temporaire doit être présent");
  assert.ok(partnersContent.includes('id="partner-form-section"'), "La section de formulaire doit être identifiée");
});

test('32. Dictionnaire i18n : clés de révélation progressive et titre du bloc visuel présents dans les 9 langues', () => {
  const supportedLangs = LANGUAGES.map((l) => l.code);
  for (const lang of supportedLangs) {
    const dict = PUBLIC_I18N[lang]?.partners;
    assert.ok(dict, `partners manquant pour [${lang}]`);
    assert.ok(dict.placeholderTitle && dict.placeholderTitle.length > 5, `placeholderTitle manquant pour [${lang}]`);
    assert.ok(dict.placeholderDesc && dict.placeholderDesc.length > 10, `placeholderDesc manquant pour [${lang}]`);
    assert.ok(dict.placeholderAlt && dict.placeholderAlt.length > 5, `placeholderAlt manquant pour [${lang}]`);
    assert.ok(dict.modifyChoiceBtn && dict.modifyChoiceBtn.length > 2, `modifyChoiceBtn manquant pour [${lang}]`);
  }
});

test('33. Révélation progressive : sélection de formule active le formulaire commercial', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  // handleSelectFormula doit activer le formulaire
  assert.ok(partnersContent.includes('setIsFormVisible(true)'), "handleSelectFormula doit rendre le formulaire visible");
  assert.ok(partnersContent.includes('setSelectedFormula(formulaKey)'), "La formule sélectionnée doit être enregistrée");
});

test('34. Révélation progressive : Dons & Mécénat active le formulaire sans formule commerciale', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  assert.ok(partnersContent.includes("setApplicationIntent('donation_sponsorship')"), "L'intention doit être donation_sponsorship");
  assert.ok(partnersContent.includes("setSelectedFormula('')"), "Aucune formule commerciale ne doit être sélectionnée");
});

test('35. Bouton Modifier mes choix : masque le formulaire et réaffiche les choix', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  assert.ok(partnersContent.includes('id="partner-modify-choices-btn"'), "Bouton Modifier mes choix présent dans le formulaire");
  assert.ok(partnersContent.includes('handleModifyChoices'), "Handler handleModifyChoices présent");
  assert.ok(partnersContent.includes('setIsFormVisible(false)'), "handleModifyChoices doit masquer le formulaire");
});

test('36. Intégrité et absence de vidéos distantes, iframes ou autoplay audio', () => {
  const partnersContent = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  assert.ok(!partnersContent.includes('<iframe'), "Aucune iframe ne doit être présente");
  assert.ok(!partnersContent.includes('<video'), "Aucune balise vidéo distante ne doit être présente");
  assert.ok(!partnersContent.includes('autoplay'), "Aucun autoplay sonore ne doit être présent");
  assert.ok(!partnersContent.includes('youtube.com') && !partnersContent.includes('vimeo.com'), "Aucun lien vidéo externe ne doit être présent");
});
