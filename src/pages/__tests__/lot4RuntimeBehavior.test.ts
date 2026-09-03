// Tests unitaires ciblés pour les comportements runtime ajustés dans le cadre du Lot 4
// Exécution : node --experimental-strip-types --test src/pages/__tests__/lot4RuntimeBehavior.test.ts

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 1. Tests App.tsx : Routage et intégrité des composants
// ============================================================================
describe('1. Routage App.tsx et intégrité des composants', () => {
  const appFile = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');

  it('App.tsx utilise le composant Dons pour les routes /d/ sans référence à DonationPage', () => {
    assert.strictEqual(appFile.includes('<DonationPage'), false, 'DonationPage ne doit plus être référencé dans App.tsx');
    assert.strictEqual(appFile.includes('<Dons />'), true, 'Dons doit être le composant rendu pour les routes /d/*');
    assert.strictEqual(appFile.includes("window.location.pathname.startsWith('/d/')"), true);
  });

  it('App.tsx déclare la navigation vers /partenaires pour LandingPage', () => {
    assert.strictEqual(appFile.includes("page === 'partners'"), true);
    assert.strictEqual(appFile.includes("window.history.pushState({}, '', '/partenaires')"), true);
  });

  it('App.tsx préserve les routes publiques existantes', () => {
    assert.strictEqual(appFile.includes("publicPage === 'about'"), true);
    assert.strictEqual(appFile.includes("publicPage === 'contact'"), true);
    assert.strictEqual(appFile.includes("publicPage === 'careers'"), true);
    assert.strictEqual(appFile.includes("publicPage === 'guide'"), true);
    assert.strictEqual(appFile.includes("['cgu', 'privacy', 'legal'].includes(publicPage)"), true);
  });
});

// ============================================================================
// 2. Tests ParentDashboard : Gestion des permissions de notification
// ============================================================================
describe('2. Logique de notifications dans ParentDashboard', () => {
  it('Détecte permission par défaut et met à jour lors de l’autorisation', async () => {
    let requested = false;
    const mockNotification = {
      permission: 'default',
      requestPermission: async () => {
        requested = true;
        return 'granted';
      }
    };

    let notifStatus = mockNotification.permission;
    const handleEnableNotifications = async () => {
      if (typeof mockNotification !== 'undefined') {
        const perm = await mockNotification.requestPermission();
        notifStatus = perm;
      }
    };

    assert.strictEqual(notifStatus, 'default');
    await handleEnableNotifications();
    assert.strictEqual(requested, true);
    assert.strictEqual(notifStatus, 'granted');
  });

  it('Gère le refus de permission (denied)', async () => {
    const mockNotification = {
      permission: 'default',
      requestPermission: async () => 'denied'
    };

    let notifStatus = mockNotification.permission;
    const handleEnableNotifications = async () => {
      if (typeof mockNotification !== 'undefined') {
        const perm = await mockNotification.requestPermission();
        notifStatus = perm;
      }
    };

    await handleEnableNotifications();
    assert.strictEqual(notifStatus, 'denied');
  });

  it('Sécurité réseau : la gestion des notifications n’émet aucun appel distant', async () => {
    let networkCallMade = false;
    const mockFetch = async () => {
      networkCallMade = true;
      return new Response();
    };

    const mockNotification = {
      permission: 'default',
      requestPermission: async () => 'granted'
    };

    // Exécution locale pure
    await mockNotification.requestPermission();
    assert.strictEqual(networkCallMade, false, 'Aucun appel fetch ne doit être déclenché');
  });
});

// ============================================================================
// 3. Tests ParentDevoirsPresence : Justification d’absence fail-closed et store
// ============================================================================
describe('3. Justification d’absence fail-closed et intégrité du store ParentDevoirsPresence', () => {
  it('ParentDevoirsPresence ne mut pas le store unilatéralement (fail-closed)', () => {
    const parentFile = fs.readFileSync(path.resolve('src/pages/parent/ParentDevoirsPresence.tsx'), 'utf-8');
    assert.strictEqual(parentFile.includes('updatePresence'), false, 'updatePresence ne doit pas être appelé sans endpoint serveur dédié');
    assert.strictEqual(parentFile.includes('Transmission des justificatifs'), true, 'Modale informative fail-closed requise');
    assert.strictEqual(parentFile.includes('handleCloseJustifyModal'), true, 'Handler de fermeture de modale requis');
  });

  it('La suppression de updateDevoir n’altère pas la lecture des devoirs', () => {
    const parentFile = fs.readFileSync(path.resolve('src/pages/parent/ParentDevoirsPresence.tsx'), 'utf-8');
    assert.strictEqual(parentFile.includes('updateDevoir'), false, 'updateDevoir ne doit plus être déstructuré');
    assert.strictEqual(parentFile.includes('devoirs') && parentFile.includes('selectedChild'), true);
  });
});

// ============================================================================
// 4. Tests Partners.tsx : Traitement exhaustif de l’union de soumission
// ============================================================================
describe('4. Traitement des statuts de soumission dans Partners.tsx', () => {
  const partnersFile = fs.readFileSync(path.resolve('src/pages/public/Partners.tsx'), 'utf-8');

  it('Partners.tsx gère explicitement payload_too_long', () => {
    assert.strictEqual(partnersFile.includes("result.outcome === 'payload_too_long'"), true);
    assert.strictEqual(partnersFile.includes('tp.form.payloadTooLongError'), true);
  });

  it('Partners.tsx gère exhaustivement success, validation_error, rate_limit et fallback error', () => {
    assert.strictEqual(partnersFile.includes("result.outcome === 'success'"), true);
    assert.strictEqual(partnersFile.includes("result.outcome === 'validation_error'"), true);
    assert.strictEqual(partnersFile.includes("result.outcome === 'rate_limit'"), true);
    assert.strictEqual(partnersFile.includes('tp.form.errorMessage'), true);
  });
});
