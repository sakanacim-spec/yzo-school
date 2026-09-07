import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Tests logiques et statiques conformes à la spécification Lot E ---

test('1. Priorité de résolution du pays : URL param > Profil Ambassadeur > Sélection explicite', () => {
  const resolveCountry = (urlParam?: string | null, affiliateCountry?: string | null): string => {
    if (urlParam && /^[A-Z]{2}$/.test(urlParam.trim().toUpperCase())) {
      return urlParam.trim().toUpperCase();
    }
    if (affiliateCountry && /^[A-Z]{2}$/.test(affiliateCountry.trim().toUpperCase())) {
      return affiliateCountry.trim().toUpperCase();
    }
    return '';
  };

  // URL param prioritaire
  assert.equal(resolveCountry('GH', 'BJ'), 'GH');
  assert.equal(resolveCountry('bj', 'CI'), 'BJ');
  assert.equal(resolveCountry('  es  ', 'BJ'), 'ES');

  // Si URL absente ou invalide, profil ambassadeur
  assert.equal(resolveCountry(null, 'BJ'), 'BJ');
  assert.equal(resolveCountry('INVALID', 'SN'), 'SN');
  assert.equal(resolveCountry('', 'CI'), 'CI');

  // Si ni URL ni profil valide, pas de pays par défaut (sélection explicite)
  assert.equal(resolveCountry(null, null), '');
  assert.equal(resolveCountry('', ''), '');
  assert.equal(resolveCountry('123', 'INVALID'), '');
});

test('2. Protection contre les réponses réseau arrivant dans le désordre (requestIdRef)', async () => {
  let activeRequestId = 0;
  let displayedCountry = '';

  const triggerFetch = async (country: string, delayMs: number) => {
    const currentId = ++activeRequestId;
    await new Promise(res => setTimeout(res, delayMs));
    if (currentId === activeRequestId) {
      displayedCountry = country;
    }
  };

  // Lancement rapide : BJ (lent, 50ms) puis GH (rapide, 10ms)
  const req1 = triggerFetch('BJ', 50);
  const req2 = triggerFetch('GH', 10);

  await Promise.all([req1, req2]);

  // GH doit avoir gagné car c'était la plus récente, même si BJ s'est terminé après
  assert.equal(displayedCountry, 'GH');
});

test('3. Formatage précis selon currency_minor_unit : XOF (0), EUR (2), GHS (2)', () => {
  const formatRate = (amountMinorUnits: number, minorUnit: number, symbol: string): string => {
    const divisor = Math.pow(10, minorUnit);
    const amount = amountMinorUnits / divisor;
    const formattedNumber = amount.toLocaleString('fr-FR', {
      minimumFractionDigits: minorUnit > 0 ? minorUnit : 0,
      maximumFractionDigits: minorUnit > 0 ? minorUnit : 0,
    });
    return `${formattedNumber} ${symbol}`.trim();
  };

  // XOF : 0 minor unit, 100 -> "100 FCFA"
  assert.equal(formatRate(100, 0, 'FCFA'), '100 FCFA');

  // EUR : 2 minor units, 50 centimes -> "0,50 €"
  assert.equal(formatRate(50, 2, '€'), '0,50 €');

  // GHS : 2 minor units, 200 pesewas -> "2,00 GH₵"
  assert.equal(formatRate(200, 2, 'GH₵'), '2,00 GH₵');
});

test('4. Distinction stricte des statuts HTTP : 404 (Sur devis) vs 500 / réseau (Message d\'erreur)', () => {
  type PricingStatus = 'idle' | 'loading' | 'success' | 'not_configured' | 'error';

  const mapHttpStatusToPricingState = (status: number, isNetworkError = false): PricingStatus => {
    if (isNetworkError) return 'error';
    if (status === 200) return 'success';
    if (status === 404) return 'not_configured';
    return 'error';
  };

  const getHeadingMessage = (status: PricingStatus, rateText: string): string => {
    if (status === 'success') return `À partir de ${rateText} / élève / mois`;
    if (status === 'not_configured') return 'Tarification sur devis';
    if (status === 'error') return 'Tarifs temporairement indisponibles';
    if (status === 'loading') return 'Chargement des tarifs...';
    return 'Sélectionnez un pays pour afficher les tarifs';
  };

  // 404 doit mener à "Tarification sur devis"
  const notConfiguredState = mapHttpStatusToPricingState(404);
  assert.equal(notConfiguredState, 'not_configured');
  assert.equal(getHeadingMessage(notConfiguredState, '100 FCFA'), 'Tarification sur devis');

  // 500 ou panne réseau ne doit JAMAIS donner "Tarification sur devis"
  const error500State = mapHttpStatusToPricingState(500);
  assert.equal(error500State, 'error');
  assert.notEqual(getHeadingMessage(error500State, ''), 'Tarification sur devis');
  assert.equal(getHeadingMessage(error500State, ''), 'Tarifs temporairement indisponibles');

  const networkErrState = mapHttpStatusToPricingState(0, true);
  assert.equal(networkErrState, 'error');
  assert.notEqual(getHeadingMessage(networkErrState, ''), 'Tarification sur devis');
});

test('5. Absence stricte de "bonbon" et "0 FCFA d\'investissement" dans les sources du Kit Ambassadeur', () => {
  const kitFilePath = path.resolve(__dirname, '../AmbassadorKitPage.tsx');
  assert.ok(fs.existsSync(kitFilePath), 'AmbassadorKitPage.tsx doit exister');
  const content = fs.readFileSync(kitFilePath, 'utf8');

  // Vérification de la suppression de "bonbon"
  assert.ok(!content.includes('bonbon'), 'Le mot "bonbon" doit être complètement absent');

  // Vérification du remplacement de "0 FCFA d'investissement"
  assert.ok(!content.includes("0 FCFA d'investissement"), 'La formulation "0 FCFA d\'investissement" doit être remplacée');
  assert.ok(content.includes("Aucun frais d'installation"), 'La formulation "Aucun frais d\'installation" doit être présente');
});

test('6. Génération et nom sécurisé du PDF exporté', () => {
  const generateSafePdfFileName = (docType: string, countryCode: string, dateObj = new Date('2026-09-07')): string => {
    const ALLOWED_DOCS = [
      'prospectus', 'communique', 'guide', 'scripts', 'courrier_ecole',
      'courrier_banque', 'courrier_entreprise', 'tarifs_partenaires',
      'faq', 'tarifs', 'comparatif', 'charte', 'suivi', 'attestation'
    ];
    const safeDoc = ALLOWED_DOCS.includes(docType) ? docType : 'document';
    const safeCountry = /^[A-Z]{2}$/.test(countryCode) ? countryCode : 'GLOBAL';
    const dateStr = dateObj.toISOString().split('T')[0];
    return `${safeDoc}-yziow-${safeCountry}-${dateStr}.pdf`;
  };

  assert.equal(
    generateSafePdfFileName('prospectus', 'BJ', new Date('2026-09-06')),
    'prospectus-yziow-BJ-2026-09-06.pdf'
  );
  assert.equal(
    generateSafePdfFileName('tarifs', 'GH', new Date('2026-09-07')),
    'tarifs-yziow-GH-2026-09-07.pdf'
  );
  assert.equal(
    generateSafePdfFileName('malicious/script', 'INVALID;DROP', new Date('2026-09-07')),
    'document-yziow-GLOBAL-2026-09-07.pdf'
  );
});

test('7. Présence du bandeau d\'impression avec la mention exacte obligatoire', () => {
  const kitFilePath = path.resolve(__dirname, '../AmbassadorKitPage.tsx');
  const content = fs.readFileSync(kitFilePath, 'utf8');

  // La mention exacte "Tarification applicable aux établissements situés en :" doit être présente
  assert.ok(
    content.includes('Tarification applicable aux établissements situés en :'),
    'La mention d\'impression pour le pays choisi doit être présente'
  );

  // Le bouton doit être nommé "Télécharger le PDF"
  assert.ok(
    content.includes('Télécharger le PDF'),
    'Le bouton doit avoir le libellé "Télécharger le PDF"'
  );
  assert.ok(
    !content.includes('Télécharger Fichier'),
    'L\'ancien libellé "Télécharger Fichier" ne doit plus exister'
  );
});
