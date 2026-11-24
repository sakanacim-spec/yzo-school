// Tests pour la restriction du pilote et le parcours de révocation P26-B
// Couvre les 16 exigences de sécurité et de suspension

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_1234567890123456';
process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 32 chars
process.env.AI_QUOTA_HASH_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.PASSWORD_RESET_OTP_SECRET = 'cccccccccccccccccccccccccccccccc';

const pilotScope = require('../../backend/utils/pilotScope');
const app = require('../../backend/server.js');
const { supabase } = require('../../backend/utils/supabase');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

function generateToken(payload) {
  return jwt.sign({ token_type: 'access', ...payload }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

function makeRequest(method, path) {
  const headers = {};
  let payload = undefined;

  const reqObj = {
    set(keyOrObj, value) {
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        Object.assign(headers, keyOrObj);
      } else if (typeof keyOrObj === 'string') {
        headers[keyOrObj] = value;
      }
      return reqObj;
    },
    send(body) {
      payload = body;
      return reqObj;
    },
    async then(resolve, reject) {
      try {
        const fetchHeaders = { ...headers };
        let bodyStr = undefined;
        if (payload !== undefined) {
          if (!fetchHeaders['Content-Type'] && !fetchHeaders['content-type']) {
            fetchHeaders['Content-Type'] = 'application/json';
          }
          bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        }

        const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
        const res = await fetch(url, {
          method,
          headers: fetchHeaders,
          body: bodyStr
        });

        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }

        resolve({
          statusCode: res.status,
          status: res.status,
          body,
          headers: Object.fromEntries(res.headers.entries())
        });
      } catch (err) {
        reject(err);
      }
    }
  };

  return reqObj;
}

const request = {
  get: (path) => makeRequest('GET', path),
  post: (path) => makeRequest('POST', path),
};

// Supabase mock recorder
let rpcCalls = [];
let mockRpcHandler = null;
let mockSingleData = null;
let mockSingleError = null;
let mockListData = [];
let mockListCount = 0;
let mockListError = null;

const originalRpc = supabase.rpc;
const originalFrom = supabase.from;

test.beforeEach(() => {
  rpcCalls = [];
  mockRpcHandler = null;
  mockSingleData = null;
  mockSingleError = null;
  mockListData = [];
  mockListCount = 0;
  mockListError = null;

  supabase.rpc = async (name, params) => {
    rpcCalls.push({ name, params });
    if (mockRpcHandler) return mockRpcHandler(name, params);
    return { data: { success: true }, error: null };
  };

  supabase.from = (table) => {
    const builder = {
      _table: table,
      _ops: [],
      select(cols, opts) {
        builder._selectCols = cols;
        builder._selectOpts = opts;
        return builder;
      },
      eq(col, val) {
        builder._ops.push(['eq', col, val]);
        return builder;
      },
      in(col, vals) {
        builder._ops.push(['in', col, vals]);
        return builder;
      },
      order(col, opts) {
        builder._ops.push(['order', col, opts]);
        return builder;
      },
      range(from, to) {
        builder._ops.push(['range', from, to]);
        return builder;
      },
      async single() {
        if (mockSingleError) return { data: null, error: mockSingleError };
        return { data: mockSingleData, error: null };
      },
      async maybeSingle() {
        if (mockSingleError) return { data: null, error: mockSingleError };
        return { data: mockSingleData, error: null };
      },
      then(resolve) {
        if (mockListError) {
          resolve({ data: null, count: null, error: mockListError });
        } else {
          resolve({ data: mockListData, count: mockListCount, error: null });
        }
      }
    };
    return builder;
  };
});

test.afterEach(() => {
  supabase.rpc = originalRpc;
  supabase.from = originalFrom;
  delete process.env.PARENT_LINK_PILOT_SCHOOLS;
  delete process.env.PARENT_LINK_ALLOW_NEW_REQUESTS;
  delete process.env.PARENT_LINK_ALLOW_DECISIONS;
  delete process.env.PARENT_LINK_ALLOW_REVOCATIONS;
});

const PILOT_SLUG = 'school_pilot_test';
const NON_PILOT_SLUG = 'school_other';
const REQUEST_ID = '333e4567-e89b-42d3-a456-426614174333';

const directorUser = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  role: 'directeur',
  schoolSlug: PILOT_SLUG,
  name: 'Directeur Pilote'
};

const parentUser = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  role: 'parent',
  schoolSlug: PILOT_SLUG,
  name: 'Parent Pilote'
};

const comptableUser = {
  id: '123e4567-e89b-12d3-a456-426614174003',
  role: 'comptable',
  schoolSlug: PILOT_SLUG,
  name: 'Comptable'
};

// ============================================================================
// 1. Tests unitaires du module pilotScope (Exigences 1, 2, 3, 4, 13, 14, 15)
// ============================================================================
test('pilotScope: défaut désactivé si variable absente ou vide (Exigences 2, 3)', () => {
  delete process.env.PARENT_LINK_PILOT_SCHOOLS;
  assert.equal(pilotScope.isSchoolInPilotScope(PILOT_SLUG), false);
  assert.equal(pilotScope.getPilotSchools().size, 0);

  process.env.PARENT_LINK_PILOT_SCHOOLS = '   ';
  assert.equal(pilotScope.isSchoolInPilotScope(PILOT_SLUG), false);
  assert.equal(pilotScope.getPilotSchools().size, 0);
});

test('pilotScope: configuration malformée gérée sans crash et fail-closed (Exigence 4)', () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = ';;;invalid--slug!!, ,123?';
  assert.equal(pilotScope.isSchoolInPilotScope(PILOT_SLUG), false);
  assert.equal(pilotScope.isSchoolInPilotScope('invalid--slug!!'), false);
  assert.equal(pilotScope.isSchoolInPilotScope(null), false);
  assert.equal(pilotScope.isSchoolInPilotScope(''), false);
});

test('pilotScope: établissement pilote autorisé et établissement hors pilote refusé (Exigences 1, 2)', () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = `${PILOT_SLUG}, another_pilot_slug`;
  assert.equal(pilotScope.isSchoolInPilotScope(PILOT_SLUG), true);
  assert.equal(pilotScope.isSchoolInPilotScope('another_pilot_slug'), true);
  assert.equal(pilotScope.isSchoolInPilotScope(NON_PILOT_SLUG), false);
});

test('pilotScope: suspension granulaire (Exigences 13, 14, 15)', () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;

  // Création suspendue
  process.env.PARENT_LINK_ALLOW_NEW_REQUESTS = 'false';
  const createCheck = pilotScope.checkPilotAccess(PILOT_SLUG, 'create');
  assert.equal(createCheck.allowed, false);
  assert.equal(createCheck.httpStatus, 503);
  assert.equal(createCheck.errorCode, 'OPERATION_SUSPENDED');

  // Décision suspendue
  process.env.PARENT_LINK_ALLOW_DECISIONS = 'false';
  const decideCheck = pilotScope.checkPilotAccess(PILOT_SLUG, 'decide');
  assert.equal(decideCheck.allowed, false);
  assert.equal(decideCheck.httpStatus, 503);

  // Révocation administrative toujours autorisée pendant la suspension partielle
  const revokeCheck = pilotScope.checkPilotAccess(PILOT_SLUG, 'revoke');
  assert.equal(revokeCheck.allowed, true);

  // Suspension explicite de la révocation
  process.env.PARENT_LINK_ALLOW_REVOCATIONS = 'false';
  const revokeSuspendedCheck = pilotScope.checkPilotAccess(PILOT_SLUG, 'revoke');
  assert.equal(revokeSuspendedCheck.allowed, false);
  assert.equal(revokeSuspendedCheck.httpStatus, 503);
});

// ============================================================================
// 2. Tests d'intégration API: Garde pilote et suspension sur les routes (Exigences 1, 2, 5, 6, 7)
// ============================================================================
test('API: École hors pilote rejetée 403 sur création, consultation, approbation, révocation (Exigence 2)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG; // NON_PILOT_SLUG n'est pas autorisé

  const nonPilotDirector = { ...directorUser, schoolSlug: NON_PILOT_SLUG };
  const token = generateToken(nonPilotDirector);

  // Consultation
  const listRes = await request.get('/api/director/requests').set('Authorization', `Bearer ${token}`);
  assert.equal(listRes.statusCode, 403);
  assert.equal(listRes.body.error, 'PILOT_RESTRICTED');

  // Consultation approuvés
  const approvedRes = await request.get('/api/director/requests/approved').set('Authorization', `Bearer ${token}`);
  assert.equal(approvedRes.statusCode, 403);
  assert.equal(approvedRes.body.error, 'PILOT_RESTRICTED');

  // Approbation
  const approveRes = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set('Authorization', `Bearer ${token}`);
  assert.equal(approveRes.statusCode, 403);
  assert.equal(approveRes.body.error, 'PILOT_RESTRICTED');

  // Rejet
  const rejectRes = await request.post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .send({ rejection_reason: 'Motif' });
  assert.equal(rejectRes.statusCode, 403);
  assert.equal(rejectRes.body.error, 'PILOT_RESTRICTED');

  // Révocation
  const revokeRes = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Motif de révocation' });
  assert.equal(revokeRes.statusCode, 403);
  assert.equal(revokeRes.body.error, 'PILOT_RESTRICTED');

  // Création par parent
  const nonPilotParent = { ...parentUser, schoolSlug: NON_PILOT_SLUG };
  const parentToken = generateToken(nonPilotParent);
  const linkRes = await request.post('/api/students/link')
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ studentId: '11111111-1111-1111-1111-111111111111' });
  assert.equal(linkRes.statusCode, 403);
  assert.equal(linkRes.body.error, 'PILOT_RESTRICTED');
});

test('API: Rôle parent non autorisé à accéder aux routes directeur (Exigence 5)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(parentUser);

  const listRes = await request.get('/api/director/requests').set('Authorization', `Bearer ${token}`);
  assert.equal(listRes.statusCode, 403);

  const revokeRes = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Révocation parent interdite' });
  assert.equal(revokeRes.statusCode, 403);
});

test('API: Rôle non autorisé (comptable) rejeté 403 (Exigence 6)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(comptableUser);

  const listRes = await request.get('/api/director/requests').set('Authorization', `Bearer ${token}`);
  assert.equal(listRes.statusCode, 403);

  const revokeRes = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Motif' });
  assert.equal(revokeRes.statusCode, 403);
});

test('API: Tentative inter-établissements (demande d une autre école) rejetée 404 (Exigence 7)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = `${PILOT_SLUG}, ${NON_PILOT_SLUG}`;
  const token = generateToken(directorUser); // schoolSlug = PILOT_SLUG

  // Simule une demande appartenant à une autre école
  mockSingleData = {
    school_slug: 'different_school',
    status: 'approved'
  };

  const revokeRes = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Motif de révocation' });

  assert.equal(revokeRes.statusCode, 404);
  assert.equal(revokeRes.body.error, 'Demande introuvable.');
  assert.equal(rpcCalls.length, 0, 'La RPC ne doit jamais être appelée pour une demande d une autre école');
});

// ============================================================================
// 3. Tests de révocation backend (Exigences 9, 10, 11, 12)
// ============================================================================
test('API: Révocation sans motif ou avec motif vide rejetée 400 (Exigence 10)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(directorUser);

  // Sans payload
  const res1 = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res1.statusCode, 400);
  assert.match(res1.body.error, /revocation_reason est requis/);

  // Motif espaces vides
  const res2 = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: '    ' });
  assert.equal(res2.statusCode, 400);
  assert.match(res2.body.error, /revocation_reason est requis/);

  assert.equal(rpcCalls.length, 0);
});

test('API: Révocation avec motif nominale appelle la RPC avec paramètres stricts (Exigence 9)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(directorUser);

  mockSingleData = {
    school_slug: PILOT_SLUG,
    status: 'approved'
  };

  mockRpcHandler = (name, params) => {
    assert.equal(name, 'revoke_parent_student_link');
    assert.equal(params.p_request_id, REQUEST_ID);
    assert.equal(params.p_school_slug, PILOT_SLUG);
    assert.equal(params.p_revoked_by, directorUser.id);
    assert.equal(params.p_revocation_reason, 'Erreur administrative de rattachement');
    return {
      data: { success: true, status: 'revoked', request_id: REQUEST_ID },
      error: null
    };
  };

  const res = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: '  Erreur administrative de rattachement  ' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'revoked');
  assert.equal(res.body.request_id, REQUEST_ID);
  assert.equal(rpcCalls.length, 1);
});

test('API: Double révocation idempotente retourne 200 already_revoked (Exigence 11)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(directorUser);

  mockSingleData = {
    school_slug: PILOT_SLUG,
    status: 'revoked'
  };

  mockRpcHandler = () => {
    return {
      data: { success: true, status: 'already_revoked', request_id: REQUEST_ID },
      error: null
    };
  };

  const res = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Confirmation de révocation' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'already_revoked');
});

test('API: Révocation sur demande non approuvée retourne 409 INVALID_STATUS_TRANSITION', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(directorUser);

  mockSingleData = {
    school_slug: PILOT_SLUG,
    status: 'pending'
  };

  mockRpcHandler = () => {
    return {
      data: { success: false, error: 'INVALID_STATUS_TRANSITION', current_status: 'pending' },
      error: null
    };
  };

  const res = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Tentative de révocation sur demande en attente' });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'INVALID_STATUS_TRANSITION');
  assert.equal(res.body.current_status, 'pending');
});

test('API: Consultation des demandes approuvées (GET /requests/approved)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  const token = generateToken(directorUser);

  mockListData = [
    { id: REQUEST_ID, school_slug: PILOT_SLUG, status: 'approved', student_name: 'Élève A', parent_name: 'Parent A' }
  ];
  mockListCount = 1;

  const res = await request.get('/api/director/requests/approved').set('Authorization', `Bearer ${token}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.requests.length, 1);
  assert.equal(res.body.requests[0].status, 'approved');
});

// ============================================================================
// 4. Tests de suspension sécurisée en production (Exigences 13, 14, 15)
// ============================================================================
test('API: Suspension des nouvelles demandes bloque linkStudentToParent avec 503 (Exigence 13)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  process.env.PARENT_LINK_ALLOW_NEW_REQUESTS = 'false';

  const token = generateToken(parentUser);
  const res = await request.post('/api/students/link')
    .set('Authorization', `Bearer ${token}`)
    .send({ studentId: '11111111-1111-1111-1111-111111111111' });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'OPERATION_SUSPENDED');
  assert.match(res.body.message, /création de nouvelles demandes/i);
});

test('API: Suspension des décisions bloque approve et reject avec 503 mais maintient revoke (Exigences 14, 15)', async () => {
  process.env.PARENT_LINK_PILOT_SCHOOLS = PILOT_SLUG;
  process.env.PARENT_LINK_ALLOW_NEW_REQUESTS = 'false';
  process.env.PARENT_LINK_ALLOW_DECISIONS = 'false';
  // Note : PARENT_LINK_ALLOW_REVOCATIONS reste actif par défaut

  const token = generateToken(directorUser);

  // Approve bloqué 503
  const approveRes = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set('Authorization', `Bearer ${token}`);
  assert.equal(approveRes.statusCode, 503);
  assert.equal(approveRes.body.error, 'OPERATION_SUSPENDED');

  // Reject bloqué 503
  const rejectRes = await request.post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .send({ rejection_reason: 'Motif' });
  assert.equal(rejectRes.statusCode, 503);
  assert.equal(rejectRes.body.error, 'OPERATION_SUSPENDED');

  // Révocation administrative MAINTENUE (200)
  mockSingleData = { school_slug: PILOT_SLUG, status: 'approved' };
  mockRpcHandler = () => ({ data: { success: true, status: 'revoked', request_id: REQUEST_ID }, error: null });

  const revokeRes = await request.post(`/api/director/requests/${REQUEST_ID}/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ revocation_reason: 'Révocation d urgence autorisée' });

  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.body.status, 'revoked');
});
