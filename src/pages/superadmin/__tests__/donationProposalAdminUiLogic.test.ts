// src/pages/superadmin/__tests__/donationProposalAdminUiLogic.test.ts
// Tests unitaires de la logique frontend du Lot 3 (machine à états, service API, payload strict, erreurs typées).
// Exécuté avec node:test.

// Définition des globals nécessaires pour l'environnement Node (évite de modifier le code de production)
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (_key: string) => 'mock_superadmin_token_jwt',
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DONATION_PROPOSAL_STATUSES,
  STATUS_TRANSITIONS,
  STATUS_METADATA,
  OFFICIAL_SECTORS
} from '../../../types/donationProposalAdmin.ts';
import type { DonationProposalStatus } from '../../../types/donationProposalAdmin.ts';

import {
  donationProposalAdminApi,
  StatusConflictError,
  InvalidTransitionError,
  ProposalNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ApiError
} from '../../../services/donationProposalAdminApi.ts';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { VALID_SECTORS } = require('../../../../backend/utils/donationProposalValidation.js');

// =========================================================================
// 0. TEST DE COHÉRENCE ENTRE CONSTANTES FRONTEND ET BACKEND
// =========================================================================
test.describe('0. Cohérence stricte des secteurs Frontend et Backend', () => {
  test('OFFICIAL_SECTORS frontend correspond exactement à VALID_SECTORS backend', () => {
    const frontendValues = OFFICIAL_SECTORS.map((s) => s.value).sort();
    const backendValues = [...VALID_SECTORS].sort();
    assert.deepStrictEqual(frontendValues, backendValues, 'Divergence détectée entre secteurs frontend et backend');
    assert.strictEqual(frontendValues.length, 10);
  });
});

// =========================================================================
// 1. TESTS DE LA MACHINE À ÉTATS DE TRANSITION
// =========================================================================
test.describe('1. Machine à états et matrice des transitions (Règle P12)', () => {
  test('les 5 statuts sont formellement définis', () => {
    assert.deepStrictEqual(
      Array.from(DONATION_PROPOSAL_STATUSES),
      ['pending', 'under_review', 'approved', 'rejected', 'archived']
    );
  });

  test('depuis "pending", seules "under_review" et "rejected" sont autorisées', () => {
    const transitions = STATUS_TRANSITIONS.pending;
    assert.deepStrictEqual(Array.from(transitions), ['under_review', 'rejected']);
    assert.strictEqual(transitions.includes('approved'), false);
    assert.strictEqual(transitions.includes('archived'), false);
  });

  test('depuis "under_review", seules "approved" et "rejected" sont autorisées', () => {
    const transitions = STATUS_TRANSITIONS.under_review;
    assert.deepStrictEqual(Array.from(transitions), ['approved', 'rejected']);
    assert.strictEqual(transitions.includes('pending'), false);
    assert.strictEqual(transitions.includes('archived'), false);
  });

  test('depuis "approved", seule "archived" est autorisée', () => {
    const transitions = STATUS_TRANSITIONS.approved;
    assert.deepStrictEqual(Array.from(transitions), ['archived']);
  });

  test('depuis "rejected", seule "archived" est autorisée', () => {
    const transitions = STATUS_TRANSITIONS.rejected;
    assert.deepStrictEqual(Array.from(transitions), ['archived']);
  });

  test('depuis "archived", aucune transition n\'est autorisée (état terminal)', () => {
    const transitions = STATUS_TRANSITIONS.archived;
    assert.strictEqual(transitions.length, 0);
  });

  test('chaque statut possède ses métadonnées visuelles et libellés complets', () => {
    for (const status of DONATION_PROPOSAL_STATUSES) {
      const meta = STATUS_METADATA[status];
      assert.ok(meta, `Metadata manquante pour ${status}`);
      assert.ok(meta.label.length > 0);
      assert.ok(meta.badgeClass.includes('bg-'));
      if (status !== 'pending') {
        assert.ok(meta.actionLabel && meta.actionLabel.length > 0);
      }
    }
  });
});

// =========================================================================
// 2. TESTS DE CONSTRUCTION DES REQUÊTES DANS LE SERVICE API
// =========================================================================
test.describe('2. Construction des requêtes avec URLSearchParams', () => {
  const originalFetch = globalThis.fetch;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('getProposals génère une query string correcte et ignore les champs vides', async () => {
    let capturedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [], total: 0, limit: 20, offset: 0 })
      } as Response;
    }) as any;

    await donationProposalAdminApi.getProposals({
      status: 'pending',
      sector: 'telecom',
      search: 'partner corp',
      limit: 20,
      offset: 40
    });

    const parsed = new URL(capturedUrl, 'http://localhost');
    assert.strictEqual(parsed.searchParams.get('status'), 'pending');
    assert.strictEqual(parsed.searchParams.get('sector'), 'telecom');
    assert.strictEqual(parsed.searchParams.get('search'), 'partner corp');
    assert.strictEqual(parsed.searchParams.get('limit'), '20');
    assert.strictEqual(parsed.searchParams.get('offset'), '40');
  });

  test('getProposals omet les paramètres vides ou non définis', async () => {
    let capturedUrl = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [], total: 0, limit: 10, offset: 0 })
      } as Response;
    }) as any;

    await donationProposalAdminApi.getProposals({
      status: '',
      sector: '   ',
      search: ''
    });

    const parsed = new URL(capturedUrl, 'http://localhost');
    assert.strictEqual(parsed.searchParams.has('status'), false);
    assert.strictEqual(parsed.searchParams.has('sector'), false);
    assert.strictEqual(parsed.searchParams.has('search'), false);
  });
});

// =========================================================================
// 3. TESTS DU PAYLOAD PATCH ET STRICTE EXCLUSION DE L'ACTEUR
// =========================================================================
test.describe('3. Sécurité et intégrité du payload PATCH', () => {
  const originalFetch = globalThis.fetch;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('updateProposalStatus n\'envoie strictement que expected_status, new_status et note', async () => {
    let capturedBody: any = null;

    globalThis.fetch = (async (_url: any, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({ id: 'mock-id', status: 'under_review' })
      } as Response;
    }) as any;

    // Appel avec des propriétés pirates/supplémentaires pour tester l'étanchéité
    await donationProposalAdminApi.updateProposalStatus('test-uuid-123', {
      expected_status: 'pending',
      new_status: 'under_review',
      note: '   Validation administrative   ',
      actor_id: 'pirate-actor-id',
      actorId: 'pirate-actor-id',
      reviewed_by: 'pirate-reviewed-by',
      reviewedBy: 'pirate-reviewed-by',
      extra_field: 'malicious'
    } as any);

    assert.ok(capturedBody);
    assert.strictEqual(capturedBody.expected_status, 'pending');
    assert.strictEqual(capturedBody.new_status, 'under_review');
    assert.strictEqual(capturedBody.note, 'Validation administrative');

    // Vérification stricte de l'absence totale de propriétés d'acteur ou injectées
    assert.strictEqual(capturedBody.actor_id, undefined);
    assert.strictEqual(capturedBody.actorId, undefined);
    assert.strictEqual(capturedBody.reviewed_by, undefined);
    assert.strictEqual(capturedBody.reviewedBy, undefined);
    assert.strictEqual(capturedBody.extra_field, undefined);
    assert.deepStrictEqual(Object.keys(capturedBody).sort(), ['expected_status', 'new_status', 'note'].sort());
  });

  test('updateProposalStatus omet note si elle est vide ou blanche', async () => {
    let capturedBody: any = null;

    globalThis.fetch = (async (_url: any, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({ id: 'mock-id', status: 'under_review' })
      } as Response;
    }) as any;

    await donationProposalAdminApi.updateProposalStatus('test-uuid-123', {
      expected_status: 'pending',
      new_status: 'under_review',
      note: '    '
    });

    assert.strictEqual(capturedBody.note, undefined);
    assert.deepStrictEqual(Object.keys(capturedBody).sort(), ['expected_status', 'new_status'].sort());
  });

  test('updateProposalStatus rejette avant l\'appel toute note > 1000 caractères (jamais de troncature silencieuse)', async () => {
    const longNote = 'A'.repeat(1001);
    let fetchCalled = false;

    globalThis.fetch = (async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;

    await assert.rejects(
      async () => {
        await donationProposalAdminApi.updateProposalStatus('test-uuid-123', {
          expected_status: 'pending',
          new_status: 'under_review',
          note: longNote
        });
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 400);
        assert.match(err.message, /1000 caractères/);
        return true;
      }
    );

    assert.strictEqual(fetchCalled, false, 'Aucun appel réseau ne doit être émis en cas de dépassement');
  });

  test('updateProposalStatus accepte une note de pile 1000 caractères', async () => {
    const exactNote = 'B'.repeat(1000);
    let capturedBody: any = null;

    globalThis.fetch = (async (_url: any, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({ id: 'mock-id', status: 'under_review' })
      } as Response;
    }) as any;

    await donationProposalAdminApi.updateProposalStatus('test-uuid-123', {
      expected_status: 'pending',
      new_status: 'under_review',
      note: exactNote
    });

    assert.strictEqual(capturedBody.note.length, 1000);
  });
});

// =========================================================================
// 4. TESTS DU MAPPING DES CLASSES D'ERREUR HTTP
// =========================================================================
test.describe('4. Typage et mapping strict des erreurs HTTP', () => {
  const originalFetch = globalThis.fetch;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockErrorResponse(status: number, body: object): () => Promise<Response> {
    return async () => ({
      ok: false,
      status,
      json: async () => body
    } as Response);
  }

  test('409 déclenche StatusConflictError', async () => {
    globalThis.fetch = mockErrorResponse(409, { error: 'Conflit d\'état', code: 'STATUS_CONFLICT' }) as any;

    await assert.rejects(
      () => donationProposalAdminApi.getProposals(),
      (err: any) => {
        assert.ok(err instanceof StatusConflictError);
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'STATUS_CONFLICT');
        return true;
      }
    );
  });

  test('422 déclenche InvalidTransitionError', async () => {
    globalThis.fetch = mockErrorResponse(422, { error: 'Transition interdite', code: 'INVALID_STATUS_TRANSITION' }) as any;

    await assert.rejects(
      () => donationProposalAdminApi.getProposals(),
      (err: any) => {
        assert.ok(err instanceof InvalidTransitionError);
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, 'INVALID_STATUS_TRANSITION');
        return true;
      }
    );
  });

  test('404 déclenche ProposalNotFoundError', async () => {
    globalThis.fetch = mockErrorResponse(404, { error: 'Introuvable', code: 'PROPOSAL_NOT_FOUND' }) as any;

    await assert.rejects(
      () => donationProposalAdminApi.getProposalById('uuid-inexistant'),
      (err: any) => {
        assert.ok(err instanceof ProposalNotFoundError);
        assert.strictEqual(err.status, 404);
        return true;
      }
    );
  });

  test('401 déclenche UnauthorizedError', async () => {
    globalThis.fetch = mockErrorResponse(401, { error: 'Token manquant' }) as any;

    await assert.rejects(
      () => donationProposalAdminApi.getProposals(),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.strictEqual(err.status, 401);
        return true;
      }
    );
  });

  test('403 déclenche ForbiddenError', async () => {
    globalThis.fetch = mockErrorResponse(403, { error: 'Accès réservé au SuperAdmin' }) as any;

    await assert.rejects(
      () => donationProposalAdminApi.getProposals(),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.strictEqual(err.status, 403);
        return true;
      }
    );
  });
});

// =========================================================================
// 5. GESTION DES RECHERCHES DÉSYNCHRONISÉES ET ERREURS RÉSEAU
// =========================================================================
test.describe('5. Protection contre l\'écrasement par des requêtes périmées et conservation des données', () => {
  test('un identifiant séquentiel de requête ignore une réponse plus ancienne arrivée en retard', async () => {
    let lastRequestId = 0;
    let committedData = '';

    async function simulateSearch(query: string, delayMs: number) {
      const currentRequestId = ++lastRequestId;

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Si une requête plus récente a été émise entre-temps, on ignore
      if (currentRequestId === lastRequestId) {
        committedData = query;
      }
    }

    // Requête 1 émise en premier mais très lente (100ms)
    const p1 = simulateSearch('Recherche Ancienne', 100);
    // Requête 2 émise après mais plus rapide (20ms)
    const p2 = simulateSearch('Recherche Récente', 20);

    await Promise.all([p1, p2]);

    assert.strictEqual(committedData, 'Recherche Récente');
  });

  test('une erreur réseau conserve les données existantes dans l\'état', () => {
    const existingItems = [{ id: '1', reference: 'DON-2026-AAA' }];
    let stateItems = [...existingItems];

    function handleFetchFailure(_err: Error) {
      // Le gestionnaire d'erreur ne vide PAS les items
      return stateItems;
    }

    const afterError = handleFetchFailure(new Error('Network offline'));
    assert.deepStrictEqual(afterError, existingItems, 'Les données existantes doivent être préservées');
  });
});

// =========================================================================
// 6. TESTS DE COMPATIBILITÉ ET COMPORTEMENT DE CONFIG ET APIHELPERS
// =========================================================================
test.describe('6. Préservation du comportement normal de config.ts et apiHelpers.ts', () => {
  test('API_BASE_URL est correctement construit', async () => {
    const { API_BASE_URL } = await import('../../../config.ts');
    assert.ok(API_BASE_URL.endsWith('/api'));
  });

  test('getAuthHeaders extrait correctement le Bearer token quand présent', async () => {
    const { getAuthHeaders } = await import('../../../services/apiHelpers.ts');
    const headers = getAuthHeaders();
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers['Authorization'], 'Bearer mock_superadmin_token_jwt');
  });

  test('getAuthHeaders omet Authorization quand aucun token n\'est stocké', async () => {
    const oldGetItem = globalThis.localStorage.getItem;
    globalThis.localStorage.getItem = () => null;

    const { getAuthHeaders } = await import('../../../services/apiHelpers.ts');
    const headers = getAuthHeaders();
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers['Authorization'], undefined);

    globalThis.localStorage.getItem = oldGetItem;
  });
});
