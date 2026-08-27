import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_I18N, getPublicTranslations } from '../i18n/publicI18n.ts';
import {
  createInitialNavigationState,
  handlePublicNavigate,
  handleRegisterSchool,
  handleLoginNavigate,
  handleBackToLanding
} from '../utils/publicNavigation.ts';

// ── Résolution portable du répertoire racine (indépendante du système et du chemin absolu) ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

const landingPath = path.join(workspaceRoot, 'src/components/LandingPage.tsx');
const legalPath = path.join(workspaceRoot, 'src/pages/public/LegalPage.tsx');
const appPath = path.join(workspaceRoot, 'src/App.tsx');
const guidePath = path.join(workspaceRoot, 'src/pages/public/UserGuide.tsx');
const contactPath = path.join(workspaceRoot, 'src/pages/public/Contact.tsx');

const landingContent = fs.readFileSync(landingPath, 'utf8');
const legalContent = fs.readFileSync(legalPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');
const guideContent = fs.readFileSync(guidePath, 'utf8');
const contactContent = fs.readFileSync(contactPath, 'utf8');

console.log('=== SUITE DE TESTS DU LOT 1 (CONTRÔLES STATIQUES, I18N 9 LANGUES ET FONCTIONS DE NAVIGATION) ===\n');

// ─────────────────────────────────────────────────────────────
// SECTION 1 : CONTRÔLE STATIQUE DU CODE SOURCE
// (Nature : Inspection statique des fichiers sources)
// ─────────────────────────────────────────────────────────────

// Test 1.1 : Absence des 9 partenaires fictifs
const fakePartners = [
  'EduFinance Group',
  'ConnectEdu Africa',
  'SchoolPay Alliance',
  'AfriLearn Partners',
  'Académie d’Excellence',
  "Académie d'Excellence",
  'Librairie Savoir Plus',
  'Transport Scolaire Express',
  'IT Solutions SARL',
  'Fournitures Académiques'
];

for (const partner of fakePartners) {
  assert.ok(
    !landingContent.includes(partner),
    `[Contrôle statique 1.1] Le faux partenaire "${partner}" a été détecté dans LandingPage.tsx`
  );
}
console.log('✅ [Contrôle statique 1.1] Absence confirmée des 9 faux partenaires dans LandingPage.tsx');

// Test 1.2 : Absence absolue des allégations non prouvées et des certifications indues
const unprovenClaims = [
  '500+',
  '2M+',
  '100% Sécurisé',
  '100 % Sécurisé',
  '100% Secure',
  '100% Seguro',
  'Paiements certifiés',
  'chiffrées de bout en bout',
  'chiffrement de bout en bout',
  'hébergement souverain',
  'souveraineté des données',
  'ISO 27001',
  'SOC 2',
  'PCI-DSS',
  'passerelle agréée',
  'passerelles de paiement partenaires sécurisées et agréées',
  'reçus certifiés',
  'cartes scolaires sécurisées',
  'notifier immédiatement la vie scolaire et les parents',
  'retrouver tous vos enfants inscrits',
  'bulletins scolaires officiels',
  'Enregistrez votre école en quelques minutes'
];

for (const claim of unprovenClaims) {
  assert.ok(
    !landingContent.toLowerCase().includes(claim.toLowerCase()),
    `[Contrôle statique 1.2] L'allégation non prouvée "${claim}" est présente dans LandingPage.tsx`
  );
  assert.ok(
    !legalContent.toLowerCase().includes(claim.toLowerCase()),
    `[Contrôle statique 1.2] L'allégation non prouvée "${claim}" est présente dans LegalPage.tsx`
  );
  assert.ok(
    !guideContent.toLowerCase().includes(claim.toLowerCase()),
    `[Contrôle statique 1.2] L'allégation non prouvée "${claim}" est présente dans UserGuide.tsx`
  );
}
console.log('✅ [Contrôle statique 1.2] Absence confirmée des certifications et allégations absolues dans LandingPage, LegalPage et UserGuide');

// Test 1.3 : Zéro lien fictif href="#"
assert.ok(
  !landingContent.includes('href="#"'),
  '[Contrôle statique 1.3] Des liens non fonctionnels href="#" ont été trouvés dans LandingPage.tsx'
);
console.log('✅ [Contrôle statique 1.3] Zéro lien fictif href="#" dans LandingPage.tsx');

// Test 1.4 : Aucune présence de chemin utilisateur machine en dur (portabilité)
const forbiddenPathTokens = ['C:\\Users\\', 'C:/Users/', 'Downloads/D', 'Downloads\\D'];
for (const token of forbiddenPathTokens) {
  assert.ok(
    !landingContent.includes(token),
    `[Contrôle statique 1.4] Chemin machine "${token}" trouvé dans LandingPage.tsx`
  );
  assert.ok(
    !guideContent.includes(token),
    `[Contrôle statique 1.4] Chemin machine "${token}" trouvé dans UserGuide.tsx`
  );
}
console.log('✅ [Contrôle statique 1.4] Aucun chemin machine en dur dans les fichiers du lot');

// ─────────────────────────────────────────────────────────────
// SECTION 2 : TEST UNITAIRE I18N (9 LANGUES PRISES EN CHARGE)
// (Nature : Test unitaire de dictionnaire et de fonction pure)
// ─────────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'] as const;

function validateNonEmptyObject(obj: any, currentPath: string, lang: string) {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    if (typeof value === 'string') {
      assert.ok(
        value.trim().length > 0,
        `[Test i18n 2.1] La clé "${fullPath}" dans la langue "${lang}" est vide ou manquante.`
      );
    } else if (typeof value === 'object' && value !== null) {
      validateNonEmptyObject(value, fullPath, lang);
    } else {
      assert.fail(`[Test i18n 2.1] Valeur invalide pour la clé "${fullPath}" dans la langue "${lang}".`);
    }
  }
}

for (const lang of SUPPORTED_LANGUAGES) {
  const dict = PUBLIC_I18N[lang];
  assert.ok(dict, `[Test i18n 2.1] Le dictionnaire i18n pour la langue "${lang}" doit être défini.`);
  validateNonEmptyObject(dict, '', lang);

  // Test fonctionnel du getter getPublicTranslations
  const resolved = getPublicTranslations(lang);
  assert.ok(resolved.nav.features.length > 0);
  assert.ok(resolved.hero.ctaRegister.length > 0);
  assert.ok(resolved.hero.ctaFeatures.length > 0);
  assert.ok(resolved.sponsors.c1_title.length > 0);
  assert.ok(resolved.guide.title.length > 0);
  assert.ok(resolved.guide.sec1_s2_desc.length > 0);
  assert.ok(resolved.contact.partnershipSubject.length > 0);
}
console.log('✅ [Test unitaire i18n 2.1] 100% des clés i18n du Lot 1 sont présentes et non vides pour les 9 langues (fr, en, es, ar, it, de, pt, zh, ru)');

// ─────────────────────────────────────────────────────────────
// SECTION 3 : TESTS UNITAIRES DU MODULE DE NAVIGATION PUBLIQUE
// (Nature : Test unitaire de fonctions pures utilisées par App.tsx)
// ─────────────────────────────────────────────────────────────

// 3.1 Initialisation
const initialState = createInitialNavigationState();
assert.equal(initialState.publicPage, 'landing');
assert.equal(initialState.contactExtra, null);
console.log('✅ [Test unitaire navigation 3.1] createInitialNavigationState() initialise sur "landing" sans extra');

// 3.2 Inscription établissement
const regState = handleRegisterSchool();
assert.equal(regState.publicPage, 'register');
assert.equal(regState.contactExtra, null);
console.log('✅ [Test unitaire navigation 3.2] handleRegisterSchool() bascule vers la page "register"');

// 3.3 Guide de prise en main
const guideState = handlePublicNavigate('guide');
assert.equal(guideState.publicPage, 'guide');
assert.notEqual(guideState.publicPage, 'login');
console.log('✅ [Test unitaire navigation 3.3] handlePublicNavigate("guide") bascule vers "guide" (non login)');

// 3.4 Contact Partenariat avec préremplissage
const frI18n = getPublicTranslations('fr');
const partnerContactState = handlePublicNavigate('contact', {
  subject: frI18n.contact.partnershipSubject,
  message: frI18n.contact.partnershipMessage
});
assert.equal(partnerContactState.publicPage, 'contact');
assert.equal(partnerContactState.contactExtra?.subject, 'Demande de partenariat');
assert.ok(partnerContactState.contactExtra?.message?.includes("Demande de partenariat"));
console.log('✅ [Test unitaire navigation 3.4] handlePublicNavigate("contact", extra) transmet le sujet et message de partenariat');

// 3.5 Connexion
const loginState = handleLoginNavigate();
assert.equal(loginState.publicPage, 'login');
console.log('✅ [Test unitaire navigation 3.5] handleLoginNavigate() bascule vers "login"');

// 3.6 Retour Accueil
const backState = handleBackToLanding();
assert.equal(backState.publicPage, 'landing');
assert.equal(backState.contactExtra, null);
console.log('✅ [Test unitaire navigation 3.6] handleBackToLanding() réinitialise sur "landing"');

console.log('\n--- TOUS LES CONTRÔLES STATIQUES, TESTS UNITAIRES I18N ET TESTS DE NAVIGATION DU LOT 1 ONT RÉUSSI AVEC SUCCÈS ! ---');
