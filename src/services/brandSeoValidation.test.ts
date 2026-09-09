// ============================================================
// TESTS SEO & IDENTITÉ DE MARQUE YZIOW (node:test)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_I18N } from '../i18n/publicI18n.ts';
import { PRODUCTION_CANONICAL_ORIGIN, BRAND_NAME, formatDocumentTitle } from '../hooks/usePageSeo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

const indexHtmlPath = path.join(workspaceRoot, 'index.html');
const robotsPath = path.join(workspaceRoot, 'public/robots.txt');
const sitemapPath = path.join(workspaceRoot, 'public/sitemap.xml');
const landingPath = path.join(workspaceRoot, 'src/components/LandingPage.tsx');
const legalPath = path.join(workspaceRoot, 'src/pages/public/LegalPage.tsx');
const usePageSeoPath = path.join(workspaceRoot, 'src/hooks/usePageSeo.ts');

const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const robotsContent = fs.readFileSync(robotsPath, 'utf8');
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const landingContent = fs.readFileSync(landingPath, 'utf8');
const legalContent = fs.readFileSync(legalPath, 'utf8');
const usePageSeoContent = fs.readFileSync(usePageSeoPath, 'utf8');

function extractJsonLd(): any {
  const match = indexHtmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'Le bloc application/ld+json doit être présent dans index.html');
  return JSON.parse(match[1]);
}

test('1. JSON-LD dans index.html est analysable et contient le graphe Schema.org', () => {
  const jsonLd = extractJsonLd();
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.ok(Array.isArray(jsonLd['@graph']), '@graph doit être un tableau');
});

test('2. WebSite dans JSON-LD est conforme aux exigences de marque', () => {
  const jsonLd = extractJsonLd();
  const website = jsonLd['@graph'].find((item: any) => item['@type'] === 'WebSite');
  assert.ok(website, 'WebSite doit être présent dans @graph');
  assert.equal(website['@id'], 'https://www.yziow.com/#website');
  assert.equal(website.url, 'https://www.yziow.com/');
  assert.equal(website.name, 'Yziow');
  assert.deepEqual(website.alternateName, ['YZIOW', 'yziow.com']);
  assert.deepEqual(website.publisher, { '@id': 'https://www.yziow.com/#organization' });
});

test('3. Organization dans JSON-LD est conforme aux exigences de marque et légales', () => {
  const jsonLd = extractJsonLd();
  const org = jsonLd['@graph'].find((item: any) => item['@type'] === 'Organization');
  assert.ok(org, 'Organization doit être présente dans @graph');
  assert.equal(org['@id'], 'https://www.yziow.com/#organization');
  assert.equal(org.name, 'Yziow');
  assert.deepEqual(org.alternateName, ['YZIOW', 'yziow.com']);
  assert.equal(org.legalName, 'Global Marketing and Technology');
  assert.equal(org.url, 'https://www.yziow.com/');
  assert.equal(org.logo, 'https://www.yziow.com/images/yziow-logo.png');
  assert.equal(org.sameAs, undefined, 'Ne doit pas inclure de propriété sameAs sans URL officielle');
});

test('4. SoftwareApplication et toutes URLs structurées utilisent le domaine canonique www', () => {
  const jsonLd = extractJsonLd();
  const app = jsonLd['@graph'].find((item: any) => item['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication doit être présente dans @graph');
  assert.equal(app['@id'], 'https://www.yziow.com/#software');
  assert.deepEqual(app.publisher, { '@id': 'https://www.yziow.com/#organization' });

  const graphStr = JSON.stringify(jsonLd);
  assert.ok(!graphStr.includes('https://yziow.com/'), 'Aucune URL non-www dans le JSON-LD');
  assert.ok(!graphStr.includes('http://'), 'Aucune URL http dans le JSON-LD');
});

test('5. Métadonnées index.html : og:site_name, www et logo officiel', () => {
  assert.ok(
    indexHtmlContent.includes('<meta property="og:site_name" content="Yziow" />'),
    'og:site_name doit être présent avec la valeur Yziow'
  );
  assert.ok(
    indexHtmlContent.includes('<meta property="og:url" content="https://www.yziow.com/" />'),
    'og:url doit pointer vers https://www.yziow.com/'
  );
  assert.ok(
    indexHtmlContent.includes('<meta name="twitter:url" content="https://www.yziow.com/" />'),
    'twitter:url doit pointer vers https://www.yziow.com/'
  );
  assert.ok(
    indexHtmlContent.includes('<meta property="og:image" content="https://www.yziow.com/images/yziow-logo.png" />'),
    'og:image doit pointer vers https://www.yziow.com/images/yziow-logo.png'
  );
  assert.ok(
    indexHtmlContent.includes('<meta name="twitter:image" content="https://www.yziow.com/images/yziow-logo.png" />'),
    'twitter:image doit pointer vers https://www.yziow.com/images/yziow-logo.png'
  );
  assert.ok(
    !indexHtmlContent.includes('og-image.jpg'),
    'Aucune référence à og-image.jpg ne doit demeurer'
  );
  assert.ok(
    !indexHtmlContent.includes('<link rel="canonical"'),
    'Pas de canonical statique dans index.html brut'
  );
});

test('6. robots.txt pointe exactement vers le sitemap www canonique', () => {
  assert.ok(
    robotsContent.includes('Sitemap: https://www.yziow.com/sitemap.xml'),
    'robots.txt doit pointer vers https://www.yziow.com/sitemap.xml'
  );
  assert.ok(!robotsContent.includes('https://yziow.com/'), 'robots.txt ne doit pas contenir d URL non-www');
});

test('7. sitemap.xml ne contient que des URLs canoniques www valides et syntaxe XML correcte', () => {
  assert.ok(sitemapContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Doit avoir en-tête XML');
  assert.ok(sitemapContent.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  
  const locMatches = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.ok(locMatches.length > 0, 'Le sitemap doit contenir au moins une URL');
  
  const uniqueLocs = new Set(locMatches);
  assert.equal(uniqueLocs.size, locMatches.length, 'Le sitemap ne doit pas contenir de doublons');

  for (const loc of locMatches) {
    assert.ok(loc.startsWith('https://www.yziow.com/'), `L'URL ${loc} doit commencer par https://www.yziow.com/`);
    assert.ok(!loc.includes('http://'), `L'URL ${loc} ne doit pas être en http`);
    assert.ok(!loc.includes('//yziow.com/'), `L'URL ${loc} ne doit pas être sans www`);
    assert.ok(!loc.includes('/login'), `L'URL ${loc} ne doit pas être une page de login / privée`);
  }
});

test('8. H1 de la LandingPage intègre visiblement la marque Yziow', () => {
  assert.ok(
    landingContent.includes('Yziow, {t.hero.title1}'),
    'LandingPage.tsx doit inclure la marque Yziow directement dans la balise h1'
  );
  const frHero = PUBLIC_I18N.fr.hero;
  assert.equal(frHero.title1, 'l’excellence');
  assert.equal(frHero.title2, 'au cœur de l’école.');
  const renderedH1Fr = `Yziow, ${frHero.title1} ${frHero.title2}`;
  assert.equal(renderedH1Fr, 'Yziow, l’excellence au cœur de l’école.');
});

test('9. usePageSeo gère les canonicals route-spécifiques et og:site_name', () => {
  assert.equal(PRODUCTION_CANONICAL_ORIGIN, 'https://www.yziow.com');
  assert.equal(BRAND_NAME, 'Yziow');
  assert.ok(usePageSeoContent.includes("setMetaTag('property', 'og:site_name', BRAND_NAME)"));
  assert.ok(usePageSeoContent.includes('PRODUCTION_CANONICAL_ORIGIN'));
});

test('10. Page légale utilise Global Marketing and Technology comme éditeur', () => {
  assert.ok(
    legalContent.includes('La plateforme Yziow est éditée par Global Marketing and Technology, une entreprise de technologies éducatives (EdTech).'),
    'LegalPage.tsx doit mentionner Global Marketing and Technology comme éditeur officiel'
  );
  assert.ok(
    !legalContent.includes('YZIOW CORP'),
    'LegalPage.tsx ne doit plus mentionner YZIOW CORP'
  );
});

test('11. Aucune occurrence de Yazio n’a été introduite dans le code ou les métadonnées', () => {
  const filesToCheck = [
    indexHtmlContent,
    robotsContent,
    sitemapContent,
    landingContent,
    legalContent,
    usePageSeoContent
  ];
  for (const content of filesToCheck) {
    assert.ok(!/yazio/i.test(content), 'Le terme Yazio ne doit jamais apparaître');
  }
});

test('12. formatDocumentTitle est idempotent et ne duplique jamais la marque Yziow', () => {
  const homeTitle = 'Yziow - La plateforme moderne de gestion scolaire';
  assert.equal(
    formatDocumentTitle(homeTitle),
    'Yziow - La plateforme moderne de gestion scolaire',
    'Titre accueil inchangé sans duplication'
  );

  assert.equal(
    formatDocumentTitle('Blog YZIOW'),
    'Blog YZIOW',
    'Ne doit pas ajouter | YZIOW si le titre contient déjà YZIOW'
  );

  assert.equal(
    formatDocumentTitle('Blog YZIOW | YZIOW'),
    'Blog YZIOW',
    'Doit nettoyer le suffixe dupliqué'
  );

  assert.equal(
    formatDocumentTitle('Nos Partenaires'),
    'Nos Partenaires | YZIOW',
    'Doit ajouter | YZIOW pour les sous-pages sans marque'
  );

  assert.equal(
    formatDocumentTitle(undefined),
    'Yziow - La plateforme moderne de gestion scolaire',
    'Titre par défaut pour undefined'
  );
});
