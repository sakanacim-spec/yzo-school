// ============================================================
// TESTS SEO & CONTENU /ABOUT YZIOW (node:test)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CANONICAL_ORIGIN, formatDocumentTitle } from '../hooks/usePageSeo.ts';
import { parsePublicLocation } from '../utils/publicNavigation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

const aboutPath = path.join(workspaceRoot, 'src/pages/public/About.tsx');
const sitemapPath = path.join(workspaceRoot, 'public/sitemap.xml');
const appPath = path.join(workspaceRoot, 'src/App.tsx');
const landingPath = path.join(workspaceRoot, 'src/components/LandingPage.tsx');

const aboutContent = fs.readFileSync(aboutPath, 'utf8');
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');
const landingContent = fs.readFileSync(landingPath, 'utf8');

test('1. H1 français de la page About contient la marque Yziow et la formulation exacte', () => {
  assert.ok(
    aboutContent.includes('Yziow, la plateforme de gestion scolaire au service des établissements et des familles'),
    'Le H1 français doit être exact'
  );
  assert.ok(
    aboutContent.includes('Yziow, the school management platform serving schools and families'),
    'Le H1 anglais doit être exact'
  );
});

test('2. Présentation factuelle de l éditeur Global Marketing and Technology sans allégations inventées', () => {
  assert.ok(
    aboutContent.includes('La plateforme Yziow est éditée par Global Marketing and Technology, entreprise technologique créée en 2017 et implantée au Bénin. Global Marketing and Technology développe des solutions numériques destinées à des utilisateurs au Bénin et à l’international.'),
    'La présentation française de l éditeur doit être conforme au texte validé'
  );
  assert.ok(
    aboutContent.includes('The Yziow platform is published by Global Marketing and Technology, a technology company created in 2017 and based in Benin. Global Marketing and Technology develops digital solutions for users in Benin and internationally.'),
    'La présentation anglaise de l éditeur doit être conforme au texte validé'
  );
  assert.ok(!/espagne|spain/i.test(aboutContent), 'Aucune mention de l Espagne ne doit figurer dans About.tsx');
  assert.ok(!/souverainet/i.test(aboutContent), 'Aucune allégation de souveraineté non démontrée');
  assert.ok(!/gestion transparente/i.test(aboutContent), 'Aucune formulation de gestion transparente non vérifiée');
  assert.ok(!/yazio/i.test(aboutContent), 'Aucune mention de la marque tierce proscrite');
});

test('3. Titre SEO formaté sans répétition de Yziow', () => {
  const frFormatted = formatDocumentTitle('À propos');
  assert.equal(frFormatted, 'À propos | YZIOW', 'Le titre français formaté doit être exactement "À propos | YZIOW"');
  assert.equal((frFormatted.match(/yziow/gi) || []).length, 1, 'Le titre ne doit contenir la marque qu une seule fois');

  const enFormatted = formatDocumentTitle('About');
  assert.equal(enFormatted, 'About | YZIOW', 'Le titre anglais formaté doit être exactement "About | YZIOW"');
  assert.equal((enFormatted.match(/yziow/gi) || []).length, 1, 'Le titre anglais ne doit contenir la marque qu une seule fois');
});

test('4. Balise canonique unique et JSON-LD AboutPage bilingue', () => {
  assert.ok(aboutContent.includes("${PRODUCTION_CANONICAL_ORIGIN}/about"), "Canonical doit être /about");
  assert.ok(aboutContent.includes("'@type': 'AboutPage'"), "Type Schema.org doit être AboutPage");
  assert.ok(aboutContent.includes("${PRODUCTION_CANONICAL_ORIGIN}/about#webpage"), "@id doit pointer vers #webpage");
  assert.ok(aboutContent.includes("${PRODUCTION_CANONICAL_ORIGIN}/#website"), "isPartOf doit pointer vers #website");
  assert.ok(aboutContent.includes("${PRODUCTION_CANONICAL_ORIGIN}/#organization"), "about doit pointer vers #organization");
  assert.ok(aboutContent.includes("isEn ? 'About Yziow' : 'À propos de Yziow'"), "name JSON-LD bilingue conforme");
  assert.ok(aboutContent.includes("isEn ? 'en' : 'fr'"), "inLanguage dynamique conforme");
});

test('5. Sitemap contient exactement 5 URLs canoniques sans doublon', () => {
  const locMatches = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.equal(locMatches.length, 5, 'Le sitemap doit contenir exactement 5 URLs');

  const expectedUrls = [
    'https://www.yziow.com/',
    'https://www.yziow.com/blog',
    'https://www.yziow.com/blog/comment-preparer-la-gestion-numerique-de-son-etablissement',
    'https://www.yziow.com/partenaires',
    'https://www.yziow.com/about'
  ];

  for (const url of expectedUrls) {
    assert.ok(locMatches.includes(url), `Le sitemap doit inclure ${url}`);
  }

  const uniqueLocs = new Set(locMatches);
  assert.equal(uniqueLocs.size, 5, 'Le sitemap ne doit pas avoir de doublons');
});

test('6. Navigation centralisée : URL parsing et lien interne vers /about', () => {
  const parsedDirect = parsePublicLocation('/about');
  assert.equal(parsedDirect.publicPage, 'about', 'parsePublicLocation doit décoder /about');

  const parsedTrailing = parsePublicLocation('/about/');
  assert.equal(parsedTrailing.publicPage, 'about', 'parsePublicLocation doit décoder /about/');

  assert.ok(landingContent.includes("onNavigate('about')"), 'LandingPage doit avoir un lien vers about');
  assert.ok(appContent.includes("window.history.pushState({}, '', '/about')"), 'App.tsx doit mettre à jour l URL pour about');
  assert.ok(appContent.includes("window.history.pushState({}, '', '/')"), 'App.tsx doit remettre / lors du retour');
});
