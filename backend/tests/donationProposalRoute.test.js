'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

// Fake env for supabase.js
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key_1234567890';
process.env.JWT_SECRET = 'mock_jwt_secret_32_characters_long_!';

let rpcCallCount = 0;
let currentServer = null;
let lastRpc = null;
let mockRpcResult = { data: null, error: null };
const supabaseMock = {
  rpc: async (name, params) => {
    rpcCallCount++;
    lastRpc = { name, params };
    return mockRpcResult;
  },
  __getLastRpc: () => lastRpc,
};

// Inject mock before requiring router
const supabaseCachePath = require.resolve('../utils/supabase');
require.cache[supabaseCachePath] = {
  id: supabaseCachePath,
  filename: supabaseCachePath,
  loaded: true,
  exports: { supabase: supabaseMock, supabaseAdmin: supabaseMock },
};

// Capture console.error for confidentiality checks
let capturedLogs = [];
const originalConsoleError = console.error;

test.beforeEach(() => {
  // Reset counters and mocks
  rpcCallCount = 0;
  lastRpc = null;
  mockRpcResult = { data: null, error: null };
  supabaseMock.rpc = async (name, params) => {
    rpcCallCount++;
    lastRpc = { name, params };
    return mockRpcResult;
  };
  // Reset log capture
  capturedLogs = [];
  console.error = (...args) => {
    capturedLogs.push(args);
    originalConsoleError.apply(console, args);
  };
});

test.afterEach(async () => {
    // Restore console.error
    console.error = originalConsoleError;
    // Ensure any server started is closed and awaited
    if (currentServer && currentServer.listening) {
        await new Promise((resolve) => {
            currentServer.on('close', resolve);
            currentServer.close();
        });
    }
    currentServer = null;
});

// Helper to require a fresh router (clears cache)
function getFreshRouter() {
  const routerPath = require.resolve('../routes/public');
  delete require.cache[routerPath];
  return require('../routes/public');
}

// Helper to start a fresh Express app with a real HTTP server
async function startServer() {
  const app = express();
  app.use(express.json());
  const router = getFreshRouter();
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

// Helper to perform POST request
async function post(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/donation-proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { statusCode: res.status, body };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

  test('✅ Success → 201 (strict params & log check)', async () => {
    rpcCallCount = 0;
    mockRpcResult = { data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' }], error: null };
    const payload = {
      fullName: 'John Doe',
      role: 'director',
      companyName: 'Acme',
      sector: 'finance',
      license: '12345',
      supportType: 'future_financial_donation',
      language: 'en',
      projectDescription: 'desc',
      consent: true,
      country: 'FR',
      targetMarkets: 'EU',
      email: 'john@acme.com',
      phone: '+33612345678',
    };
    const { server, baseUrl } = await startServer();
    currentServer = server;
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 201);
    assert.equal(rpcCallCount, 1);
    assert.deepStrictEqual(res.body, { id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' });
    // strict RPC param check
    const expectedParams = {
      p_full_name: payload.fullName,
      p_role: payload.role,
      p_company_name: payload.companyName,
      p_sector: payload.sector,
      p_sub_sector: null,
      p_regulation_declaration: null,
      p_other_sector_details: null,
      p_organization_type: null,
      p_support_type: payload.supportType,
      p_license: payload.license,
      p_country: payload.country,
      p_target_markets: payload.targetMarkets,
      p_email: payload.email,
      p_phone: payload.phone,
      p_website: null,
      p_project_description: payload.projectDescription,
      p_language: payload.language,
      p_consent: payload.consent,
    };
    assert.deepStrictEqual(lastRpc.params, expectedParams);
    // log confidentiality check
    const allowedMessages = [
      'Erreur API public donation-proposals',
      'Erreur API public contact',
      'Erreur API public careers',
      'Erreur insertion recommandation école',
      'Erreur API public recommend-school'
    ];
    for (const args of capturedLogs) {
      assert.equal(args.length, 1, 'Console.error should receive a single argument');
      assert.ok(allowedMessages.includes(args[0]), `Unexpected log message: ${args[0]}`);
    }
  });

  test('❌ RPC error → 500 and RPC was called (log check)', async () => {
    rpcCallCount = 0;
    mockRpcResult = { data: null, error: { message: 'boom' } };
    const payload = {
      fullName: 'Jane Doe',
      role: 'director',
      companyName: 'Acme',
      sector: 'finance',
      license: '12345',
      supportType: 'future_financial_donation',
      language: 'en',
      projectDescription: 'desc',
      consent: true,
      country: 'FR',
      targetMarkets: 'EU',
      email: 'jane@acme.com',
      phone: '+33612345678',
    };
    const { server, baseUrl } = await startServer();
    currentServer = server;
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 500);
    assert.equal(rpcCallCount, 1);
    assert.deepStrictEqual(res.body, { error: "Erreur lors de l'enregistrement de la proposition." });
    // log check
    const allowedMessages = [
      'Erreur API public donation-proposals'
    ];
    for (const args of capturedLogs) {
      assert.equal(args.length, 1);
      assert.ok(allowedMessages.includes(args[0]), `Unexpected log: ${args[0]}`);
    }
  });

  test('❌ RPC returns empty array → 500 (log check)', async () => {
    rpcCallCount = 0;
    mockRpcResult = { data: [], error: null };
    const payload = {
      fullName: 'Eve',
      role: 'director',
      companyName: 'Acme',
      sector: 'telecom',
      supportType: 'future_financial_donation',
      language: 'en',
      projectDescription: 'desc',
      consent: true,
      country: 'FR',
      targetMarkets: 'EU',
      email: 'eve@acme.com',
      phone: '+33612345678',
    };
    const { server, baseUrl } = await startServer();
    global.__currentServer = server;
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 500);
    assert.equal(rpcCallCount, 1);
    const allowedMessages = [
      'Erreur API public donation-proposals'
    ];
    for (const args of capturedLogs) {
      assert.equal(args.length, 1);
      assert.ok(allowedMessages.includes(args[0]));
    }
  });

  test('❌ RPC returns multiple rows → 500 (log check)', async () => {
    rpcCallCount = 0;
    mockRpcResult = { data: [
	      { id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' },
	      { id: '550e8400-e29b-41d4-a716-446655440001', reference: 'DON-2024-HJKLMNPQ', status: 'pending' }
    ], error: null };
    const payload = {
      fullName: 'Eve',
      role: 'director',
      companyName: 'Acme',
      sector: 'telecom',
      supportType: 'future_financial_donation',
      language: 'en',
      projectDescription: 'desc',
      consent: true,
      country: 'FR',
      targetMarkets: 'EU',
      email: 'eve@acme.com',
      phone: '+33612345678',
    };
    const { server, baseUrl } = await startServer();
    currentServer = server;
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 500);
    assert.equal(rpcCallCount, 1);
    const allowedMessages = [
      'Erreur API public donation-proposals'
    ];
    for (const args of capturedLogs) {
      assert.equal(args.length, 1);
      assert.ok(allowedMessages.includes(args[0]));
    }
  });

test('❌ RPC promise rejects → 500', async () => {
  rpcCallCount = 0;
  supabaseMock.rpc = async () => { rpcCallCount++; throw new Error('boom'); };
  const payload = {
    fullName: 'Eve',
    role: 'director',
    companyName: 'Acme',
    sector: 'telecom',
    supportType: 'future_financial_donation',
    language: 'en',
    projectDescription: 'desc',
    consent: true,
    country: 'FR',
    targetMarkets: 'EU',
    email: 'eve@acme.com',
    phone: '+33612345678',
  };
    const { server, baseUrl } = await startServer();
    global.__currentServer = server;
    const res = await post(baseUrl, payload);
  assert.equal(res.statusCode, 500);
  assert.equal(rpcCallCount, 1);
});
// Additional tests for validation, limiter, and confidentiality

  // ---------------------------------------------------------------------------
  // RPC response edge‑case tests – start from a fully valid RPC result and mutate only one field
  // ---------------------------------------------------------------------------
  const validRpcResult = () => ({
    data: [{
      id: '550e8400-e29b-41d4-a716-446655440000',
      reference: 'DON-2024-ABCDEFGH',
      status: 'pending',
    }],
    error: null,
  });

  // Helper to run a request with a given mock RPC result and assert generic error handling
  async function runErrorScenario(mockResult, modifyPayload = null) {
    rpcCallCount = 0;
    mockRpcResult = mockResult;
    const payload = modifyPayload || {
      fullName: 'John Doe',
      role: 'director',
      companyName: 'Acme',
      sector: 'finance',
      license: '12345',
      supportType: 'future_financial_donation',
      language: 'en',
      projectDescription: 'desc',
      consent: true,
      country: 'FR',
      targetMarkets: 'EU',
      email: 'john@acme.com',
      phone: '+33612345678',
    };
    const { server, baseUrl } = await startServer();
    global.__currentServer = server;
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 500);
    assert.equal(rpcCallCount, 1);
    assert.deepStrictEqual(res.body, { error: "Erreur lors de l'enregistrement de la proposition." });
    assert.deepStrictEqual(capturedLogs, [['Erreur API public donation-proposals']]);
    // Ensure the RPC parameters are still the expected strict 18‑param object
    const expectedParams = {
      p_full_name: payload.fullName,
      p_role: payload.role,
      p_company_name: payload.companyName,
      p_sector: payload.sector,
      p_sub_sector: null,
      p_regulation_declaration: null,
      p_other_sector_details: null,
      p_organization_type: null,
      p_support_type: payload.supportType,
      p_license: payload.license,
      p_country: payload.country,
      p_target_markets: payload.targetMarkets,
      p_email: payload.email,
      p_phone: payload.phone,
      p_website: null,
      p_project_description: payload.projectDescription,
      p_language: payload.language,
      p_consent: payload.consent,
    };
    assert.deepStrictEqual(lastRpc.params, expectedParams);
  }

  // 1. data absent
  test('❌ RPC response missing data → 500', async () => {
    await runErrorScenario({ error: null });
  });

  // 2. data null
  test('❌ RPC response data null → 500', async () => {
    await runErrorScenario({ data: null, error: null });
  });

  // 3. data object instead of array
  test('❌ RPC response data object → 500', async () => {
    await runErrorScenario({ data: { id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' }, error: null });
  });

  // 4. empty array
  test('❌ RPC response empty array → 500', async () => {
    await runErrorScenario({ data: [], error: null });
  });

  // 5. multiple rows (already valid) – kept for completeness
  test('❌ RPC response multiple rows (both valid) → 500', async () => {
    await runErrorScenario({ data: [
      { id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' },
      { id: '550e8400-e29b-41d4-a716-446655440001', reference: 'DON-2024-HJKLMNPQ', status: 'pending' },
    ], error: null });
  });

  // 6. row null
  test('❌ RPC response row null → 500', async () => {
    await runErrorScenario({ data: [null], error: null });
  });

  // 7. primitive row
  test('❌ RPC response row primitive → 500', async () => {
    await runErrorScenario({ data: [42], error: null });
  });

  // 8. row array
  test('❌ RPC response row array → 500', async () => {
    await runErrorScenario({ data: [[1,2,3]], error: null });
  });

  // 9. id absent
  test('❌ RPC response missing id → 500', async () => {
    await runErrorScenario({ data: [{ reference: 'DON-2024-ABCDEFGH', status: 'pending' }], error: null });
  });

  // 10. id non‑string
  test('❌ RPC response id non‑string → 500', async () => {
    await runErrorScenario({ data: [{ id: 12345, reference: 'DON-2024-ABCDEFGH', status: 'pending' }], error: null });
  });

  // 11. malformed UUID
  test('❌ RPC response malformed UUID → 500', async () => {
    await runErrorScenario({ data: [{ id: 'not-a-uuid', reference: 'DON-2024-ABCDEFGH', status: 'pending' }], error: null });
  });

  // 12. reference absent
  test('❌ RPC response missing reference → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', status: 'pending' }], error: null });
  });

  // 13. reference non‑string
  test('❌ RPC response reference non‑string → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 12345, status: 'pending' }], error: null });
  });

  // 14. reference malformed
  test('❌ RPC response malformed reference → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'BAD-REF', status: 'pending' }], error: null });
  });

  // 15. status absent
  test('❌ RPC response missing status → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH' }], error: null });
  });

  // 16. status non‑string
  test('❌ RPC response status non‑string → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 123 }], error: null });
  });

  // 17. status not pending
  test('❌ RPC response status not pending → 500', async () => {
    await runErrorScenario({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'completed' }], error: null });
  });

  // ---------------------------------------------------------------------------
  // End of RPC edge‑case tests
  // ---------------------------------------------------------------------------

// 1. Validation failure (400) – no RPC call
test('❌ Validation failure → 400, no RPC', async () => {
  rpcCallCount = 0;
  const payload = { fullName: '', role: 'director' }; // missing many required fields
  const { server, baseUrl } = await startServer();
  global.__currentServer = server;
  const res = await post(baseUrl, payload);
  assert.equal(res.statusCode, 400);
  assert.equal(rpcCallCount, 0);
});

// 2. Limiter – invalid requests
test('❌ Limiteur invalid → 400 then 429, no RPC', async () => {
  const payload = {}; // triggers validation 400
  const { server, baseUrl } = await startServer();
  global.__currentServer = server;
  for (let i = 0; i < 5; i++) {
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 400);
    assert.equal(rpcCallCount, 0);
  }
  const res = await post(baseUrl, payload);
  assert.equal(res.statusCode, 429);
  assert.equal(rpcCallCount, 0);
});

// 3. Limiter – valid requests
test('✅ Limiteur valid → 201 then 429, exact RPC count', async () => {
  const payload = {
    fullName: 'John Doe',
    role: 'director',
    companyName: 'Acme',
    sector: 'finance',
    license: '12345',
    supportType: 'future_financial_donation',
    language: 'en',
    projectDescription: 'desc',
    consent: true,
    country: 'FR',
    targetMarkets: 'EU',
    email: 'john@acme.com',
    phone: '+33612345678',
  };
  mockRpcResult = { data: [{ id: '550e8400-e29b-41d4-a716-446655440000', reference: 'DON-2024-ABCDEFGH', status: 'pending' }], error: null };
  const { server, baseUrl } = await startServer();
  global.__currentServer = server;
  for (let i = 0; i < 5; i++) {
    const res = await post(baseUrl, payload);
    assert.equal(res.statusCode, 201);
  }
  const res = await post(baseUrl, payload);
  assert.equal(res.statusCode, 429);
  assert.equal(rpcCallCount, 5);
});
