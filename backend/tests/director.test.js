// Tests for Director approval endpoints
// Uses the built‑in Node test runner and supertest to hit the Express app.

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const jwt = require('jsonwebtoken');

// Dummy environment variables for the server
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_1234567890123456';
process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 32 chars
process.env.AI_QUOTA_HASH_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.PASSWORD_RESET_OTP_SECRET = 'cccccccccccccccccccccccccccccccc';

// Load the Express app after env vars are defined
const app = require('../../backend/server.js'); // Express app instance

// Base mock user payload (will be encoded into JWT)
const baseMockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  role: 'directeur',
  schoolSlug: 'testschool',
  name: 'Director Test'
};

// A request id distinct from the authenticated user id, to detect any confusion between them
const REQUEST_ID = '223e4567-e89b-42d3-a456-426614174111';
const TABLE = 'parent_student_link_requests';
const PENDING_STATUSES = ['pending', 'pending_verification'];

// Helper to generate a JWT from a payload.
// Ordinary tokens default to token_type 'access'; the payload may override it.
function generateToken(payload) {
  return jwt.sign({ token_type: 'access', ...payload }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

// SuperTest instance (no auth header attached here)
const request = supertest(app);

// --- Supabase deterministic, recording mock ------------------------------------
const { supabase } = require('../../backend/utils/supabase');
let rpcResult;
let mockRequestData;
let mockListData;
let mockCountError;
let mockListError;
let mockMetaError;
let supabaseCalls;
let rpcCalls;

// Records every RPC invocation with its exact name and parameters
const defaultRpc = async (name, params) => {
  rpcCalls.push({ name, params });
  return { ...rpcResult };
};

// Self-chaining query builder: every filter returns the same builder so calls such as
// eq().eq(), eq().in(), eq().single() all work. Every call and its arguments is recorded,
// and results come from per-test state.
function defaultFrom(table) {
  return {
    select: (cols, opts) => {
      const call = { table, cols, opts, ops: [] };
      supabaseCalls.push(call);
      const filters = {};
      const record = (method, ...args) => call.ops.push({ method, args });
      const q = {
        eq: (column, value) => { record('eq', column, value); filters[column] = value; return q; },
        in: (column, values) => { record('in', column, values); return q; },
        order: (column, options) => { record('order', column, options); return q; },
        range: (from, to) => {
          record('range', from, to);
          if (mockListError) return Promise.resolve({ data: null, error: mockListError, count: null });
          return Promise.resolve({ data: mockListData, error: null, count: mockListData.length });
        },
        single: () => {
          record('single');
          if (mockMetaError) return Promise.resolve({ data: null, error: mockMetaError });
          // Emulate PostgREST: no row matches when a filter differs from the stored row
          const matches = mockRequestData
            && Object.entries(filters).every(([column, value]) => mockRequestData[column] === value);
          if (!matches) {
            return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows found' } });
          }
          return Promise.resolve({ data: mockRequestData, error: null });
        }
      };
      // Count queries are awaited directly after eq()/in(), so expose a thenable only for them
      if (opts && opts.count === 'exact') {
        q.then = (resolve, reject) => Promise.resolve(
          mockCountError
            ? { count: null, error: mockCountError }
            : { count: mockListData.length, error: null }
        ).then(resolve, reject);
      }
      return q;
    }
  };
}

function resetMocks() {
  rpcResult = { data: { success: true, status: 'approved', request_id: baseMockUser.id }, error: null };
  mockRequestData = { id: baseMockUser.id, school_slug: baseMockUser.schoolSlug, status: 'pending' };
  mockListData = [];
  mockCountError = null;
  mockListError = null;
  mockMetaError = null;
  supabaseCalls = [];
  rpcCalls = [];
  // Restore defaults so per-test overrides of supabase.from / supabase.rpc never leak
  supabase.from = defaultFrom;
  supabase.rpc = defaultRpc;
}

resetMocks();

test.beforeEach(() => {
  resetMocks();
});

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// Operations of a recorded Supabase call as [method, ...args] tuples
function opsOf(call) {
  return call.ops.map(({ method, args }) => [method, ...args]);
}

// Seed a pending request of the authenticated school with the dedicated REQUEST_ID
function seedRequest(overrides = {}) {
  mockRequestData = { id: REQUEST_ID, school_slug: baseMockUser.schoolSlug, status: 'pending', ...overrides };
}

// Hostile payload attempting to override information that must come from the JWT
const HOSTILE_BODY = {
  id: '00000000-0000-4000-8000-000000000000',
  school_slug: 'otherschool',
  schoolSlug: 'otherschool',
  p_school_slug: 'otherschool',
  p_request_id: '00000000-0000-4000-8000-000000000000',
  p_decided_by: '00000000-0000-4000-8000-000000000001',
  decided_by: '00000000-0000-4000-8000-000000000001',
  name: 'Hacker',
  nom: 'Hacker',
  role: 'superadmin'
};

// -------------------------------------------------------------------------------
// 1. Successful happy‑path scenarios (already passing)
// -------------------------------------------------------------------------------

test('GET /api/director/requests returns array', async () => {
  const token = generateToken(baseMockUser);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.requests), 'requests should be an array');
});

test('GET /api/director/requests/:id validates UUID', async () => {
  const token = generateToken(baseMockUser);
  const res = await request.get('/api/director/requests/invalid-id').set(authHeader(token));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Identifiant de demande invalide (UUID attendu).');
});

test('POST /api/director/requests/:id/approve idempotent handling', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/approve`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'approved');
});

test('POST /api/director/requests/:id/reject requires reason', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/reject`)
    .set(authHeader(token))
    .send({});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Le champ rejection_reason est requis et ne doit pas être vide.');
});

// -------------------------------------------------------------------------------
// 2. Authentication & Authorization failures
// -------------------------------------------------------------------------------

test('Missing JWT → 401', async () => {
  const res = await request.get('/api/director/requests');
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Accès refusé. Token manquant.');
  assert.equal(supabaseCalls.length, 0);
});

test('Invalid JWT → 401', async () => {
  const badToken = 'invalid.token.here';
  const res = await request.get('/api/director/requests').set(authHeader(badToken));
  assert.equal(res.statusCode, 401);
  assert.equal(supabaseCalls.length, 0);
});

test('JWT without token_type → 401', async () => {
  // Signed directly (bypassing generateToken) so no token_type property exists
  const token = jwt.sign({ ...baseMockUser }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 401);
  assert.equal(supabaseCalls.length, 0);
});

test('JWT with incorrect token_type (refresh) → 401', async () => {
  const payload = { ...baseMockUser, token_type: 'refresh' };
  const token = generateToken(payload);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 401);
  assert.equal(supabaseCalls.length, 0);
});

test('Forbidden role superadmin → 403', async () => {
  const payload = { ...baseMockUser, role: 'superadmin' };
  const token = generateToken(payload);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 403);
  assert.equal(supabaseCalls.length, 0);
});

test('Forbidden role comptable → 403', async () => {
  const payload = { ...baseMockUser, role: 'comptable' };
  const token = generateToken(payload);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 403);
  assert.equal(supabaseCalls.length, 0);
});

test('Forbidden role cannot approve or reject (no Supabase, no RPC)', async () => {
  const token = generateToken({ ...baseMockUser, role: 'comptable' });
  const approve = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(token));
  const reject = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(approve.statusCode, 403);
  assert.equal(reject.statusCode, 403);
  assert.equal(supabaseCalls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

test('Missing schoolSlug in JWT → 403', async () => {
  const { schoolSlug, ...rest } = baseMockUser;
  const token = generateToken(rest);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 403);
  assert.equal(supabaseCalls.length, 0);
});

// -------------------------------------------------------------------------------
// 3. Pagination validation
// -------------------------------------------------------------------------------

test('Invalid pagination parameters → 400', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .get('/api/director/requests?page=0&limit=200')
    .set(authHeader(token));
  assert.equal(res.statusCode, 400);
});

const INVALID_PAGINATION_QUERIES = [
  'page=0',
  'limit=0',
  'page=abc',
  'limit=abc',
  'page=-1',
  'limit=-5',
  'limit=101',
  'page=1.5',
  'limit=2abc',
  'page=01',
  'limit=010',
  'page=',
  'limit=',
  'page=%2B1',
  'page=1e2',
  'page=1&page=2',
  'page=9007199254740993', // not a safe integer
  'page=99999999999999999999',
  'page=90071992547410&limit=100' // offset computation overflows the safe integer range
];

for (const query of INVALID_PAGINATION_QUERIES) {
  test(`Invalid pagination "${query}" → 400 without any Supabase call`, async () => {
    const token = generateToken(baseMockUser);
    const res = await request.get(`/api/director/requests?${query}`).set(authHeader(token));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Paramètres de pagination invalides.');
    assert.equal(supabaseCalls.length, 0);
  });
}

const VALID_PAGINATION_CASES = [
  { query: '', page: 1, limit: 20, range: [0, 19] },
  { query: '?page=2&limit=10', page: 2, limit: 10, range: [10, 19] },
  { query: '?limit=100', page: 1, limit: 100, range: [0, 99] },
  { query: '?page=3', page: 3, limit: 20, range: [40, 59] },
  { query: '?page=1&limit=1', page: 1, limit: 1, range: [0, 0] }
];

for (const { query, page, limit, range } of VALID_PAGINATION_CASES) {
  test(`Valid pagination "${query}" → range ${range[0]}-${range[1]}`, async () => {
    mockListData = [{ id: REQUEST_ID, school_slug: baseMockUser.schoolSlug, status: 'pending' }];
    const token = generateToken(baseMockUser);
    const res = await request.get(`/api/director/requests${query}`).set(authHeader(token));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.page, page);
    assert.equal(res.body.limit, limit);
    assert.equal(res.body.total, 1);
    assert.deepEqual(res.body.requests, mockListData);
    const dataCall = supabaseCalls.find(call => call.ops.some(op => op.method === 'range'));
    assert.deepEqual(dataCall.ops.find(op => op.method === 'range').args, range);
  });
}

// -------------------------------------------------------------------------------
// 4. Access control based on schoolSlug (isolation between schools)
// -------------------------------------------------------------------------------

test('List is limited to the JWT school and pending statuses (query values cannot override)', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .get('/api/director/requests?school_slug=otherschool&schoolSlug=otherschool&status=approved')
    .set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.equal(supabaseCalls.length, 2, 'one count query and one data query expected');

  const [countCall, dataCall] = supabaseCalls;
  assert.equal(countCall.table, TABLE);
  assert.deepEqual(countCall.opts, { count: 'exact', head: true });
  assert.deepEqual(opsOf(countCall), [
    ['eq', 'school_slug', 'testschool'],
    ['in', 'status', PENDING_STATUSES]
  ]);

  assert.equal(dataCall.table, TABLE);
  assert.deepEqual(opsOf(dataCall), [
    ['eq', 'school_slug', 'testschool'],
    ['in', 'status', PENDING_STATUSES],
    ['order', 'requested_at', { ascending: false }],
    ['range', 0, 19]
  ]);
  assert.equal(rpcCalls.length, 0);
});

test('Detail request applies id and school_slug filters from the JWT', async () => {
  seedRequest();
  const token = generateToken(baseMockUser);
  const res = await request.get(`/api/director/requests/${REQUEST_ID}`).set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.request.id, REQUEST_ID);
  assert.equal(supabaseCalls.length, 1);
  assert.equal(supabaseCalls[0].table, TABLE);
  assert.deepEqual(opsOf(supabaseCalls[0]), [
    ['eq', 'id', REQUEST_ID],
    ['eq', 'school_slug', 'testschool'],
    ['single']
  ]);
});

test('Detail request from another school → 404', async () => {
  mockRequestData.school_slug = 'otherschool';
  const token = generateToken(baseMockUser);
  const res = await request
    .get(`/api/director/requests/${baseMockUser.id}`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'Demande non trouvée.');
  assert.deepEqual(opsOf(supabaseCalls[0]).slice(0, 2), [
    ['eq', 'id', baseMockUser.id],
    ['eq', 'school_slug', 'testschool']
  ]);
});

test('Detail request: unexpected Supabase error → 500 without internal details', async () => {
  mockMetaError = { code: 'XX000', message: 'boom internal sql detail' };
  const token = generateToken(baseMockUser);
  const res = await request.get(`/api/director/requests/${REQUEST_ID}`).set(authHeader(token));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Erreur serveur lors de la récupération de la demande.' });
});

test('Approve request from another school → 404 and no RPC call', async () => {
  mockRequestData.school_slug = 'otherschool';
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/approve`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'Demande introuvable.');
  assert.equal(rpcCalls.length, 0, 'RPC should not be invoked for foreign school');
});

test('Reject request from another school → 404 and no RPC call', async () => {
  mockRequestData.school_slug = 'otherschool';
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'Demande introuvable.');
  assert.equal(rpcCalls.length, 0);
});

test('Approve/reject pre-check filters by id AND JWT school_slug', async () => {
  seedRequest();
  const token = generateToken(baseMockUser);
  const approve = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(token));
  const reject = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(approve.statusCode, 200);
  assert.equal(reject.statusCode, 200);
  assert.equal(supabaseCalls.length, 2);
  for (const call of supabaseCalls) {
    assert.equal(call.table, TABLE);
    assert.equal(call.cols, 'school_slug,status');
    assert.deepEqual(opsOf(call), [
      ['eq', 'id', REQUEST_ID],
      ['eq', 'school_slug', 'testschool'],
      ['single']
    ]);
  }
});

test('Pre-check: unexpected Supabase error on approve/reject → 500 generic, no RPC', async () => {
  mockMetaError = { code: 'XX000', message: 'boom internal sql detail' };
  const token = generateToken(baseMockUser);
  const approve = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(token));
  const reject = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(approve.statusCode, 500);
  assert.deepEqual(approve.body, { error: 'Erreur serveur lors de l\'approbation.' });
  assert.equal(reject.statusCode, 500);
  assert.deepEqual(reject.body, { error: 'Erreur serveur lors du rejet.' });
  assert.equal(rpcCalls.length, 0);
});

// -------------------------------------------------------------------------------
// 5. RPC parameters come from the JWT, never from the HTTP body
// -------------------------------------------------------------------------------

test('Approve calls RPC with JWT school, JWT user and request id', async () => {
  seedRequest();
  rpcResult = { data: { success: true, status: 'approved', request_id: REQUEST_ID }, error: null };
  const token = generateToken(baseMockUser);
  const res = await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, status: 'approved', request_id: REQUEST_ID });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'approve_parent_student_link');
  assert.deepEqual(rpcCalls[0].params, {
    p_request_id: REQUEST_ID,
    p_school_slug: 'testschool',
    p_decided_by: baseMockUser.id,
    p_decided_by_name: 'Director Test'
  });
});

test('Approve ignores any hostile body value (JWT values win)', async () => {
  seedRequest();
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${REQUEST_ID}/approve`)
    .set(authHeader(token))
    .send(HOSTILE_BODY);
  assert.equal(res.statusCode, 200);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0].params, {
    p_request_id: REQUEST_ID,
    p_school_slug: 'testschool',
    p_decided_by: baseMockUser.id,
    p_decided_by_name: 'Director Test'
  });
  for (const call of supabaseCalls) {
    assert.ok(!JSON.stringify(call.ops).includes('otherschool'), 'body school must never reach Supabase filters');
  }
});

test('Reject calls RPC with JWT school, JWT user, reason and default code OTHER', async () => {
  seedRequest();
  rpcResult = { data: { success: true, status: 'rejected', request_id: REQUEST_ID }, error: null };
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, status: 'rejected', request_id: REQUEST_ID });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'reject_parent_student_link');
  assert.deepEqual(rpcCalls[0].params, {
    p_request_id: REQUEST_ID,
    p_school_slug: 'testschool',
    p_decided_by: baseMockUser.id,
    p_rejection_reason: 'spam',
    p_rejection_reason_code: 'OTHER',
    p_decided_by_name: 'Director Test'
  });
});

test('Reject ignores any hostile body value (JWT values win)', async () => {
  seedRequest();
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ ...HOSTILE_BODY, rejection_reason: 'spam' });
  assert.equal(res.statusCode, 200);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0].params, {
    p_request_id: REQUEST_ID,
    p_school_slug: 'testschool',
    p_decided_by: baseMockUser.id,
    p_rejection_reason: 'spam',
    p_rejection_reason_code: 'OTHER',
    p_decided_by_name: 'Director Test'
  });
  for (const call of supabaseCalls) {
    assert.ok(!JSON.stringify(call.ops).includes('otherschool'), 'body school must never reach Supabase filters');
  }
});

test('decided_by_name falls back to JWT nom, then to null', async () => {
  seedRequest();
  const { name, ...withoutName } = baseMockUser;

  const withNom = generateToken({ ...withoutName, nom: 'Directeur Nom' });
  await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(withNom));
  assert.equal(rpcCalls[0].params.p_decided_by_name, 'Directeur Nom');

  const withNothing = generateToken(withoutName);
  await request.post(`/api/director/requests/${REQUEST_ID}/approve`).set(authHeader(withNothing));
  assert.equal(rpcCalls[1].params.p_decided_by_name, null);
});

// -------------------------------------------------------------------------------
// 6. Reject validation (reason and reason code)
// -------------------------------------------------------------------------------

const INVALID_REASONS = [
  ['missing', {}],
  ['null', { rejection_reason: null }],
  ['empty', { rejection_reason: '' }],
  ['whitespace only', { rejection_reason: '   ' }],
  ['number', { rejection_reason: 123 }],
  ['array', { rejection_reason: ['spam'] }],
  ['object', { rejection_reason: { text: 'spam' } }]
];

for (const [label, body] of INVALID_REASONS) {
  test(`Reject with invalid rejection_reason (${label}) → 400, no Supabase, no RPC`, async () => {
    const token = generateToken(baseMockUser);
    const res = await request
      .post(`/api/director/requests/${REQUEST_ID}/reject`)
      .set(authHeader(token))
      .send(body);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Le champ rejection_reason est requis et ne doit pas être vide.');
    assert.equal(supabaseCalls.length, 0);
    assert.equal(rpcCalls.length, 0);
  });
}

const NON_STRING_CODES = [
  ['number', 123],
  ['boolean', true],
  ['object', { code: 'X' }],
  ['array', ['X']]
];

for (const [label, code] of NON_STRING_CODES) {
  test(`Reject with non-string rejection_reason_code (${label}) → 400, no Supabase, no RPC`, async () => {
    const token = generateToken(baseMockUser);
    const res = await request
      .post(`/api/director/requests/${REQUEST_ID}/reject`)
      .set(authHeader(token))
      .send({ rejection_reason: 'spam', rejection_reason_code: code });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Le champ rejection_reason_code doit être une chaîne de caractères.');
    assert.equal(supabaseCalls.length, 0);
    assert.equal(rpcCalls.length, 0);
  });
}

const DEFAULTED_CODES = [
  ['absent', {}],
  ['null', { rejection_reason_code: null }],
  ['empty', { rejection_reason_code: '' }],
  ['whitespace only', { rejection_reason_code: '   ' }]
];

for (const [label, extra] of DEFAULTED_CODES) {
  test(`Reject with ${label} rejection_reason_code → RPC receives OTHER`, async () => {
    seedRequest();
    const token = generateToken(baseMockUser);
    const res = await request
      .post(`/api/director/requests/${REQUEST_ID}/reject`)
      .set(authHeader(token))
      .send({ rejection_reason: 'spam', ...extra });
    assert.equal(res.statusCode, 200);
    assert.equal(rpcCalls[0].params.p_rejection_reason_code, 'OTHER');
  });
}

test('Reject keeps a free-text rejection_reason_code (trimmed, no whitelist)', async () => {
  seedRequest();
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'doublon', rejection_reason_code: '  custom_code_42 ' });
  assert.equal(res.statusCode, 200);
  assert.equal(rpcCalls[0].params.p_rejection_reason_code, 'custom_code_42');
  assert.equal(rpcCalls[0].params.p_rejection_reason, 'doublon');
});

test('Reject without any request body → 400 (no crash)', async () => {
  const token = generateToken(baseMockUser);
  const res = await request.post(`/api/director/requests/${REQUEST_ID}/reject`).set(authHeader(token));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Le champ rejection_reason est requis et ne doit pas être vide.');
  assert.equal(rpcCalls.length, 0);
});

test('Reject with a JSON array body → 400 (no crash)', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${REQUEST_ID}/reject`)
    .set(authHeader(token))
    .send([]);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Le champ rejection_reason est requis et ne doit pas être vide.');
  assert.equal(rpcCalls.length, 0);
});

// -------------------------------------------------------------------------------
// 7. UUID validation on approve / reject
// -------------------------------------------------------------------------------

test('Approve with invalid UUID → 400, no Supabase, no RPC', async () => {
  const token = generateToken(baseMockUser);
  const res = await request.post('/api/director/requests/not-a-uuid/approve').set(authHeader(token));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Identifiant de demande invalide (UUID attendu).');
  assert.equal(supabaseCalls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

test('Reject with invalid UUID → 400, no Supabase, no RPC', async () => {
  const token = generateToken(baseMockUser);
  const res = await request
    .post('/api/director/requests/not-a-uuid/reject')
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Identifiant de demande invalide (UUID attendu).');
  assert.equal(supabaseCalls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

// -------------------------------------------------------------------------------
// 8. Idempotent and RPC error scenarios
// -------------------------------------------------------------------------------

test('Approve already approved → idempotent 200 with proper status', async () => {
  rpcResult = { data: { success: true, status: 'already_approved', request_id: baseMockUser.id }, error: null };
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/approve`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'already_approved');
});

test('Reject already rejected → idempotent 200 with proper status', async () => {
  rpcResult = { data: { success: true, status: 'already_rejected', request_id: baseMockUser.id }, error: null };
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/reject`)
    .set(authHeader(token))
    .send({ rejection_reason: 'spam' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'already_rejected');
});

test('Invalid status transition → 409 with current_status from the SQL contract', async () => {
  // SQL contract: { success: false, error: 'INVALID_STATUS_TRANSITION', current_status: <status> }
  rpcResult = { data: { success: false, error: 'INVALID_STATUS_TRANSITION', current_status: 'approved' }, error: null };
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/approve`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'INVALID_STATUS_TRANSITION');
  assert.equal(res.body.current_status, 'approved');
});

const RPC_ENDPOINTS = [
  { action: 'approve', body: undefined, generic: 'Erreur interne lors de l\'approbation.' },
  { action: 'reject', body: { rejection_reason: 'spam' }, generic: 'Erreur interne lors du rejet.' }
];

const RPC_BUSINESS_ERRORS = [
  ['INVALID_REQUEST_ID', 400, { error: 'INVALID_REQUEST_ID' }],
  ['REJECTION_REASON_REQUIRED', 400, { error: 'REJECTION_REASON_REQUIRED' }],
  ['INVALID_SCHOOL_SLUG', 400, { error: 'INVALID_SCHOOL_SLUG' }],
  ['INVALID_DECIDED_BY', 400, { error: 'INVALID_DECIDED_BY' }],
  ['UNAUTHORIZED_APPROVER', 403, { error: 'UNAUTHORIZED_APPROVER' }],
  ['REQUEST_NOT_FOUND', 404, { error: 'Demande introuvable.' }],
  ['INVALID_STATUS_TRANSITION', 409, { error: 'INVALID_STATUS_TRANSITION', current_status: 'approved' }]
];

const RPC_INTERNAL_ERRORS = [
  'SCHOOL_PROFILE_NOT_FOUND',
  'LOCAL_TABLE_NOT_FOUND',
  'TOTALLY_NEW_CODE',
  'constructor',
  '__proto__'
];

async function callDecision(action, body) {
  const token = generateToken(baseMockUser);
  const req = request.post(`/api/director/requests/${REQUEST_ID}/${action}`).set(authHeader(token));
  return body === undefined ? req : req.send(body);
}

for (const { action, body, generic } of RPC_ENDPOINTS) {
  for (const [code, status, expectedBody] of RPC_BUSINESS_ERRORS) {
    test(`${action}: RPC ${code} → HTTP ${status}`, async () => {
      seedRequest();
      // current_status is always present in the RPC payload to prove it is only exposed for transitions
      rpcResult = { data: { success: false, error: code, current_status: 'approved' }, error: null };
      const res = await callDecision(action, body);
      assert.equal(res.statusCode, status);
      assert.deepEqual(res.body, expectedBody);
    });
  }

  for (const code of RPC_INTERNAL_ERRORS) {
    test(`${action}: RPC ${code} → HTTP 500 generic, code not exposed`, async () => {
      seedRequest();
      rpcResult = { data: { success: false, error: code }, error: null };
      const res = await callDecision(action, body);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: generic });
    });
  }

  test(`${action}: RPC failure without error code → HTTP 500 generic`, async () => {
    seedRequest();
    rpcResult = { data: { success: false }, error: null };
    const res = await callDecision(action, body);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: generic });
  });

  test(`${action}: transport/SQL RPC error → HTTP 500 without SQL details`, async () => {
    seedRequest();
    rpcResult = { data: null, error: { message: 'relation "profiles_testschool" does not exist; secret_sql' } };
    const res = await callDecision(action, body);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: generic });
  });

  test(`${action}: RPC returns null → HTTP 500 generic`, async () => {
    seedRequest();
    rpcResult = { data: null, error: null };
    const res = await callDecision(action, body);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Réponse RPC vide.' });
  });
}

// -------------------------------------------------------------------------------
// 9. Supabase error scenarios on listing
// -------------------------------------------------------------------------------

test('Supabase query error → 500', async () => {
  supabase.from = () => ({
    select: () => ({
      eq: () => ({
        in: () => ({
          then: (resolve) => resolve({ count: null, error: new Error('boom') })
        })
      })
    })
  });
  const token = generateToken(baseMockUser);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Erreur serveur lors de la récupération des demandes.' });
});

test('List: count query error → 500 without internal details', async () => {
  mockCountError = new Error('boom internal sql detail');
  const token = generateToken(baseMockUser);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Erreur serveur lors de la récupération des demandes.' });
});

test('List: data query error → 500 without internal details', async () => {
  mockListError = new Error('boom internal sql detail');
  const token = generateToken(baseMockUser);
  const res = await request.get('/api/director/requests').set(authHeader(token));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Erreur serveur lors de la récupération des demandes.' });
});

test('RPC returns null → 500 with generic message', async () => {
  rpcResult = { data: null, error: null };
  const token = generateToken(baseMockUser);
  const res = await request
    .post(`/api/director/requests/${baseMockUser.id}/approve`)
    .set(authHeader(token));
  assert.equal(res.statusCode, 500);
});
