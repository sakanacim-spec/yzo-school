const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Lire et parser manuellement .env.local
const envPath = path.join(__dirname, '.env.local');
console.log('Loading env from:', envPath);
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.substring(0, firstEq).trim();
    const val = trimmed.substring(firstEq + 1).trim();
    process.env[key] = val;
  });
}

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is missing in env.local');
  process.exit(1);
}

// Initialiser Supabase Admin
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  const email = `perf-owner-${Date.now()}@test-e2e.com`;
  const password = 'TestPassword123!';

  console.log(`Creating performance test user: ${email}...`);

  // Créer l'utilisateur
  const { data: userRecord, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { is_e2e: true }
  });

  if (createError) {
    console.error('Failed to create user:', createError.message);
    process.exit(1);
  }

  const userId = userRecord.user.id;
  console.log(`User created. ID: ${userId}. Setting PLATFORM_OWNER role...`);

  // Assigner PLATFORM_OWNER
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { platform_roles: ['PLATFORM_OWNER'], tenant_id: '00000000-0000-0000-0000-000000000000' }
  });

  if (updateError) {
    console.error('Failed to update metadata:', updateError.message);
    process.exit(1);
  }

  // Se connecter pour obtenir le token
  console.log('Signing in...');
  const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !sessionData.session) {
    console.error('Failed to sign in:', loginError?.message || 'No session');
    process.exit(1);
  }

  const token = sessionData.session.access_token;
  console.log('Successfully acquired JWT Token!');

  // Scénarios de test de charge
  const targetHost = 'http://127.0.0.1:3000';
  const runs = [
    { name: 'Health Ping (100 VUs)', path: '/v1/health/ping', authenticated: false, connections: 100 },
    { name: 'Health Ping (300 VUs)', path: '/v1/health/ping', authenticated: false, connections: 300 },
    { name: 'Health Ping (500 VUs)', path: '/v1/health/ping', authenticated: false, connections: 500 },
    { name: 'Global KPIs (100 VUs)', path: '/v1/superadmin/kpis/global', authenticated: true, connections: 100 },
    { name: 'Global KPIs (300 VUs)', path: '/v1/superadmin/kpis/global', authenticated: true, connections: 300 },
    { name: 'Global KPIs (500 VUs)', path: '/v1/superadmin/kpis/global', authenticated: true, connections: 500 },
  ];

  const results = [];

  for (const run of runs) {
    console.log(`\n==================================================`);
    console.log(`Running benchmark: ${run.name}`);
    console.log(`==================================================`);

    const url = `${targetHost}${run.path}`;
    const duration = 10; // 10 secondes par run

    let cmd = `npx autocannon -c ${run.connections} -d ${duration} --json`;
    if (run.authenticated) {
      cmd += ` -H "Authorization=Bearer ${token}"`;
    }
    cmd += ` ${url}`;

    try {
      const output = execSync(cmd, { encoding: 'utf8' });
      // Supprimer d'éventuels warnings npm au début du flux JSON
      const jsonStart = output.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('No JSON output from autocannon');
      }
      const rawJson = JSON.parse(output.substring(jsonStart));
      
      const stats = {
        name: run.name,
        connections: run.connections,
        path: run.path,
        authenticated: run.authenticated,
        requestsPerSec: rawJson.requests.average,
        throughputMbPerSec: (rawJson.throughput.average / 1024 / 1024).toFixed(2),
        latencyP50: rawJson.latency.p50,
        latencyP95: rawJson.latency.p95,
        latencyP99: rawJson.latency.p99,
        errorRate: ((rawJson.errors / (rawJson.requests.sent || 1)) * 100).toFixed(2) + '%',
        totalSent: rawJson.requests.sent,
        totalErrors: rawJson.errors,
        statusCodes: rawJson.statusCodeStats || {}
      };

      console.log(`Done. Req/Sec: ${stats.requestsPerSec}, P50: ${stats.latencyP50}ms, P95: ${stats.latencyP95}ms, Errors: ${stats.totalErrors}`);
      results.push(stats);
    } catch (err) {
      console.error(`Error running benchmark ${run.name}:`, err.message);
    }
  }

  // Enregistrer le rapport de résultats au format JSON
  const reportPath = path.join(__dirname, 'load_test_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAll benchmarks completed. Results saved to: ${reportPath}`);

  // Nettoyer l'utilisateur
  console.log(`Cleaning up test user ${userId}...`);
  await supabase.auth.admin.deleteUser(userId);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
});
