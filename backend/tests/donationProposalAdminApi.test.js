'use strict';
// backend/tests/donationProposalAdminApi.test.js
// Tests automatisés exhaustifs du Lot 2 (API SuperAdmin pour donation_proposals)
// Utilise des RPC mockées sans modifier la production. Exécuté avec node:test.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'mock_jwt_secret_32_characters_long_!';
process.env.JWT_SECRET = JWT_SECRET;

const VALID_SUPERADMIN_ID = '11111111-1111-4111-8111-111111111111'; // UUID v4 valide
const VALID_PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';   // UUID v4 valide
const NON_V4_UUID = '22222222-2222-1222-8222-222222222222';         // UUID v1

let lastRpcCall = null;
let mockRpcResponse = { data: null, error: null };
let mockRpcReject = false;
let mockSuperAdminExists = true;

const supabaseMock = {
  from: (table) => ({
    select: () => ({
      eq: (col, val) => ({
        maybeSingle: async () => {
          if (table === 'superadmins' && mockSuperAdminExists && val === VALID_SUPERADMIN_ID) {
            return { data: { id: val }, error: null };
          }
          return { data: null, error: null };
        }
      })
    })
  }),
  rpc: async (fnName, params) => {
    lastRpcCall = { fnName, params };
    if (mockRpcReject) {
      throw new Error('Connection timeout or network failure');
    }
    return mockRpcResponse;
  }
};

// Injection du mock avant require des routes et contrôleurs
const supabasePath = require.resolve('../utils/supabase');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { supabase: supabaseMock }
};

const superAdminRoutes = require('../routes/superAdmin');
const { VALID_SECTORS } = require('../utils/donationProposalValidation');

let app;
let server;
let baseUrl;
const openServers = new Set();
let capturedLogs = [];
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function createToken(payload) {
  return jwt.sign(
    {
      id: VALID_SUPERADMIN_ID,
      role: 'superadmin',
      token_type: 'access',
      ...payload
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

function getValidProposalRaw(overrides = {}) {
  return {
    id: VALID_PROPOSAL_ID,
    reference: 'DON-2026-W9P8W9GX',
    full_name: 'Directeur Général',
    role: 'DG',
    company_name: 'Telecom SA',
    sector: 'telecom',
    sub_sector: null,
    regulation_declaration: null,
    other_sector_details: null,
    organization_type: null,
    support_type: 'future_financial_donation',
    license: null,
    country: 'France',
    target_markets: 'Europe',
    email: 'partenaire@telecom.test',
    phone: '+33612345678',
    website: 'https://telecom.test',
    language: 'fr',
    consent: true,
    status: 'pending',
    internal_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...overrides
  };
}

test.before(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/superadmin', superAdminRoutes);

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      openServers.add(server);
      resolve();
    });
  });
});

test.beforeEach(() => {
  lastRpcCall = null;
  mockRpcResponse = { data: null, error: null };
  mockRpcReject = false;
  mockSuperAdminExists = true;
  capturedLogs = [];

  console.log = (...args) => capturedLogs.push({ level: 'log', text: args.join(' ') });
  console.warn = (...args) => capturedLogs.push({ level: 'warn', text: args.join(' ') });
  console.error = (...args) => capturedLogs.push({ level: 'error', text: args.join(' ') });
});

test.afterEach(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

test.after(async () => {
  for (const s of openServers) {
    await new Promise((res) => s.close(res));
  }
});

// =========================================================================
// 1. CONTRÔLE D'ACCÈS ET EN-TÊTES CACHE-CONTROL SUR TOUS LES STATUTS HTTP
// =========================================================================
test.describe('1. Contrôle d\'accès et en-tête Cache-Control sur tous les codes HTTP', () => {
  test('401 si requête sans token avec Cache-Control: no-store, private', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('403 si token rôle non-superadmin avec Cache-Control: no-store, private', async () => {
    const token = createToken({ role: 'admin' });
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('403 si SuperAdmin supprimé/inconnu en base (GET liste, GET détail, PATCH status)', async () => {
    mockSuperAdminExists = false;
    const token = createToken();

    const r1 = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r1.status, 403);
    assert.strictEqual(r1.headers.get('cache-control'), 'no-store, private');

    const r2 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r2.status, 403);
    assert.strictEqual(r2.headers.get('cache-control'), 'no-store, private');

    const r3 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(r3.status, 403);
    assert.strictEqual(r3.headers.get('cache-control'), 'no-store, private');
  });

  test('400 avec Cache-Control: no-store, private', async () => {
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?invalid=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('404 avec Cache-Control: no-store, private', async () => {
    mockRpcResponse = { data: null, error: null };
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('409 avec Cache-Control: no-store, private', async () => {
    mockRpcResponse = { data: null, error: { message: 'STATUS_CONFLICT: current is under_review' } };
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('422 avec Cache-Control: no-store, private', async () => {
    mockRpcResponse = { data: null, error: { message: 'INVALID_STATUS_TRANSITION: cannot transition' } };
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'archived' })
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('500 avec Cache-Control: no-store, private', async () => {
    mockRpcReject = true;
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });

  test('200 avec Cache-Control: no-store, private', async () => {
    mockRpcResponse = { data: { items: [], total: 0, limit: 20, offset: 0 }, error: null };
    const token = createToken();
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store, private');
  });
});

// =========================================================================
// 2. CONFORMITÉ ET RECONNAISSANCE DES SECTEURS P11
// =========================================================================
test.describe('2. Conformité des secteurs avec P11 et donationProposalValidation', () => {
  const token = createToken();
  const P11_SECTORS = [
    'finance', 'telecom', 'equipment', 'mobility_services',
    'after_school_services', 'insurance', 'transport',
    'ngo_institutions', 'otherRegulated', 'other'
  ];

  test('tous les 10 secteurs de P11 sont acceptés par le filtre administratif', async () => {
    mockRpcResponse = { data: { items: [], total: 0, limit: 20, offset: 0 }, error: null };
    for (const sec of P11_SECTORS) {
      assert.ok(VALID_SECTORS.includes(sec), `VALID_SECTORS doit contenir ${sec}`);
      const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?sector=${sec}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.strictEqual(res.status, 200, `Le secteur ${sec} doit retourner 200`);
      assert.strictEqual(lastRpcCall.params.p_sector, sec);
    }
  });

  test('les sous-secteurs comme afterSchool ne sont PAS acceptés comme secteur principal', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?sector=afterSchool`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Secteur de filtre invalide.');
  });
});

// =========================================================================
// 3. VALIDATION STRICTE DES ENTRÉES
// =========================================================================
test.describe('3. Validation stricte des entrées (formats, enums, bornes)', () => {
  const token = createToken();

  test('GET liste : 400 si paramètre query non autorisé', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?unknown_param=123`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Paramètre de requête non autorisé.');
  });

  test('GET liste : 400 si paramètre query sous forme de tableau (duplication)', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?status=pending&status=approved`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Format de paramètre invalide.');
  });

  test('GET liste : 400 si statut de filtre inconnu', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?status=inconnu`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Statut de filtre invalide.');
  });

  test('GET liste : 400 si limit < 1 ou > 100 ou non entier', async () => {
    const r1 = await fetch(`${baseUrl}/api/superadmin/donation-proposals?limit=0`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/superadmin/donation-proposals?limit=101`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r2.status, 400);

    const r3 = await fetch(`${baseUrl}/api/superadmin/donation-proposals?limit=abc`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r3.status, 400);
  });

  test('GET liste : 400 si offset non entier ou négatif', async () => {
    const r1 = await fetch(`${baseUrl}/api/superadmin/donation-proposals?offset=-5`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/superadmin/donation-proposals?offset=xyz`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(r2.status, 400);
  });

  test('GET liste : 400 si search dépasse 100 caractères', async () => {
    const longSearch = 'A'.repeat(101);
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?search=${longSearch}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 400);
  });

  test('GET détail : 400 si ID malformaté ou UUID non-v4', async () => {
    const r1 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/not-a-uuid`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${NON_V4_UUID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(r2.status, 400);
  });

  test('PATCH statut : 400 si body contient des propriétés non autorisées', async () => {
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'pending',
        new_status: 'under_review',
        actor_id: 'tentative_usurpation',
        reviewed_by: 'autre_id'
      })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Propriété non autorisée dans le corps de requête.');
  });

  test('PATCH statut : 400 si expected_status ou new_status invalide', async () => {
    const r1 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'invalide', new_status: 'under_review' })
    });
    assert.strictEqual(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'invalide' })
    });
    assert.strictEqual(r2.status, 400);
  });

  test('PATCH statut : 400 si note dépasse 1000 caractères', async () => {
    const longNote = 'X'.repeat(1001);
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review', note: longNote })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'La note ne peut pas dépasser 1000 caractères.');
  });

  test('PATCH statut : note avec espaces seuls convertie en null pour la RPC', async () => {
    mockRpcResponse = {
      data: getValidProposalRaw({ status: 'under_review' }),
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review', note: '   ' })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRpcCall.params.p_note, null);
    assert.strictEqual(lastRpcCall.params.p_actor_id, VALID_SUPERADMIN_ID);
  });
});

// =========================================================================
// 4. RENFORCEMENT ET ASSAINISSEMENT DES SORTIES RPC
// =========================================================================
test.describe('4. Validation stricte et assainissement des sorties RPC', () => {
  const token = createToken();

  test('GET liste : rejet 500 si une référence viole le format DON-YYYY-XXXXXXXX', async () => {
    mockRpcResponse = {
      data: {
        items: [getValidProposalRaw({ reference: 'DON-2026-INVALID!' })],
        total: 1, limit: 20, offset: 0
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 500);
  });

  test('GET liste : rejet 500 si une date est invalide', async () => {
    mockRpcResponse = {
      data: {
        items: [getValidProposalRaw({ created_at: 'not-a-date' })],
        total: 1, limit: 20, offset: 0
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 500);
  });

  test('GET liste : rejet 500 si items.length > limit', async () => {
    mockRpcResponse = {
      data: {
        items: [getValidProposalRaw(), getValidProposalRaw({ id: '33333333-3333-4333-8333-333333333333' })],
        total: 2, limit: 1, offset: 0
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 500);
  });

  test('GET liste : rejet 500 si limit ou offset retourné diffère de la requête', async () => {
    mockRpcResponse = {
      data: {
        items: [],
        total: 0, limit: 50, offset: 10
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?limit=20&offset=0`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 500);
  });

  test('GET liste : les propriétés sensibles/inconnues de la base sont éliminées de la réponse', async () => {
    mockRpcResponse = {
      data: {
        items: [getValidProposalRaw({ internal_db_secret: 'confidential_token', unapproved_flag: true })],
        total: 1, limit: 20, offset: 0
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.items[0].internal_db_secret, undefined);
    assert.strictEqual(body.items[0].unapproved_flag, undefined);
    assert.strictEqual(body.items[0].reference, 'DON-2026-W9P8W9GX');
  });

  test('GET détail : 404 si la RPC renvoie null', async () => {
    mockRpcResponse = { data: null, error: null };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error, 'Proposition introuvable.');
  });

  test('GET détail : 500 si l\'ID retourné ne correspond pas à l\'ID demandé', async () => {
    mockRpcResponse = {
      data: {
        ...getValidProposalRaw({ id: '33333333-3333-4333-8333-333333333333' }),
        audit_trail: []
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
  });

  test('GET détail : rejet 500 si audit_trail contient une entrée avec date invalide', async () => {
    mockRpcResponse = {
      data: {
        ...getValidProposalRaw(),
        audit_trail: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            proposal_id: VALID_PROPOSAL_ID,
            actor_id: VALID_SUPERADMIN_ID,
            actor_name: 'admin',
            old_status: 'pending',
            new_status: 'under_review',
            created_at: 'date-invalide'
          }
        ]
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
  });

  test('GET détail : rejet 500 si audit_trail contient un statut non-enum', async () => {
    mockRpcResponse = {
      data: {
        ...getValidProposalRaw(),
        audit_trail: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            proposal_id: VALID_PROPOSAL_ID,
            actor_id: VALID_SUPERADMIN_ID,
            actor_name: 'admin',
            old_status: 'statut_invalide',
            new_status: 'under_review',
            created_at: '2026-09-02T10:00:00.000Z'
          }
        ]
      },
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
  });

  test('PATCH statut : rejet 500 si status retourné != new_status demandé', async () => {
    mockRpcResponse = {
      data: getValidProposalRaw({ status: 'pending' }), // attendu: under_review
      error: null
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 500);
  });
});

// =========================================================================
// 5. MAPPING D'ERREURS SQL ET CONFIDENTIALITÉ
// =========================================================================
test.describe('5. Correspondance d\'erreurs SQL et confidentialité des réponses', () => {
  const token = createToken();

  test('409 Conflict sur STATUS_CONFLICT (sans leak de message SQL)', async () => {
    mockRpcResponse = {
      data: null,
      error: { message: 'STATUS_CONFLICT: Current status is "under_review", expected "pending"' }
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.code, 'STATUS_CONFLICT');
    assert.strictEqual(body.error, "Conflit d'état : la proposition a été modifiée par un autre administrateur.");
    assert.strictEqual(body.message, undefined, 'Aucun message PostgreSQL ne doit être divulgué');
  });

  test('422 Unprocessable Entity sur INVALID_STATUS_TRANSITION', async () => {
    mockRpcResponse = {
      data: null,
      error: { message: 'INVALID_STATUS_TRANSITION: Cannot transition from "pending" to "archived"' }
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'archived' })
    });
    assert.strictEqual(res.status, 422);
    const body = await res.json();
    assert.strictEqual(body.code, 'INVALID_STATUS_TRANSITION');
  });

  test('404 Not Found sur PROPOSAL_NOT_FOUND', async () => {
    mockRpcResponse = {
      data: null,
      error: { message: 'PROPOSAL_NOT_FOUND: Proposal does not exist' }
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 404);
  });

  test('400 Bad Request sur VALIDATION_FAILED (sans details dans la réponse)', async () => {
    mockRpcResponse = {
      data: null,
      error: { message: 'VALIDATION_FAILED: note exceeds 1000 characters' }
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.details, undefined, 'Le champ details doit être supprimé de la réponse');
  });

  test('500 générique sur erreur SQL inattendue (zéro stack ni détail SQL retourné)', async () => {
    mockRpcResponse = {
      data: null,
      error: { message: 'FATAL: database connection lost at query execution' }
    };
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.error, 'Une erreur technique est survenue lors du traitement.');
  });
});

// =========================================================================
// 6. HYGIÈNE DES LOGS ET ABSENCE DE DONNÉES SENSIBLES
// =========================================================================
test.describe('6. Hygiène des logs et absence de fuite d\'identifiants', () => {
  const token = createToken();

  test('Zéro fuite de données personnelles ou identifiants dans les logs console', async () => {
    mockRpcResponse = {
      data: getValidProposalRaw({ status: 'under_review' }),
      error: null
    };
    await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review', note: 'Secret Note' })
    });

    const combinedLogs = capturedLogs.map(l => l.text).join('\n');
    assert.doesNotMatch(combinedLogs, new RegExp(VALID_PROPOSAL_ID), 'L\'ID de la proposition ne doit pas figurer dans les logs');
    assert.doesNotMatch(combinedLogs, new RegExp(VALID_SUPERADMIN_ID), 'L\'ID de l\'acteur ne doit pas figurer dans les logs');
    assert.doesNotMatch(combinedLogs, /Secret Note/, 'Le contenu de la note ne doit pas figurer dans les logs');
  });
});

// =========================================================================
// 7. TESTS DE REJET / PROMESSE INTERROMPUE SUR LES TROIS RPCS
// =========================================================================
test.describe('7. Tests de promesse interrompue / rejet réseau sur les 3 RPCs', () => {
  const token = createToken();

  test('GET liste : 500 si la promesse RPC get_donation_proposals est rejetée', async () => {
    mockRpcReject = true;
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.error, 'Une erreur technique est survenue lors du traitement.');
  });

  test('GET détail : 500 si la promesse RPC get_donation_proposal_by_id est rejetée', async () => {
    mockRpcReject = true;
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.error, 'Une erreur technique est survenue lors du traitement.');
  });

  test('PATCH statut : 500 si la promesse RPC update_donation_proposal_status est rejetée', async () => {
    mockRpcReject = true;
    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'pending', new_status: 'under_review' })
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.error, 'Une erreur technique est survenue lors du traitement.');
  });
});

// =========================================================================
// 8. SCÉNARIOS NOMINAUX COMPLETS
// =========================================================================
test.describe('8. Scénarios nominaux complets (GET liste, GET détail, PATCH statut)', () => {
  const token = createToken();

  test('GET liste nominal avec filtres validés', async () => {
    mockRpcResponse = {
      data: {
        items: [getValidProposalRaw()],
        total: 1, limit: 10, offset: 0
      },
      error: null
    };

    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals?status=pending&sector=telecom&search=test&limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.total, 1);
    assert.strictEqual(lastRpcCall.params.p_status, 'pending');
    assert.strictEqual(lastRpcCall.params.p_sector, 'telecom');
    assert.strictEqual(lastRpcCall.params.p_search, 'test');
    assert.strictEqual(lastRpcCall.params.p_limit, 10);
    assert.strictEqual(lastRpcCall.params.p_offset, 0);
  });

  test('GET détail nominal avec historique d\'audit', async () => {
    mockRpcResponse = {
      data: {
        ...getValidProposalRaw({ status: 'under_review' }),
        audit_trail: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            proposal_id: VALID_PROPOSAL_ID,
            actor_id: VALID_SUPERADMIN_ID,
            actor_name: 'admin_audit',
            old_status: 'pending',
            new_status: 'under_review',
            created_at: '2026-09-02T10:30:00.000Z'
          }
        ]
      },
      error: null
    };

    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, VALID_PROPOSAL_ID);
    assert.strictEqual(body.audit_trail.length, 1);
  });

  test('PATCH statut nominal avec note nettoyée', async () => {
    mockRpcResponse = {
      data: getValidProposalRaw({ status: 'approved' }),
      error: null
    };

    const res = await fetch(`${baseUrl}/api/superadmin/donation-proposals/${VALID_PROPOSAL_ID}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'under_review',
        new_status: 'approved',
        note: '   Validation convention de partenariat   '
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'approved');
    assert.strictEqual(lastRpcCall.params.p_note, 'Validation convention de partenariat');
    assert.strictEqual(lastRpcCall.params.p_actor_id, VALID_SUPERADMIN_ID);
  });
});
