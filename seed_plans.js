const fs = require('fs');

const envContent = fs.readFileSync('apps/api/.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim().replace(/['"]/g, '');
  }
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRest(endpoint, method = 'POST', body = null) {
  const options = {
    method,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log('Inserting plans...');
  
  const plans = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Free',
      description: 'Plan gratuit pour tester',
      price_amount: 0,
      currency: 'EUR',
      modules: ['auth', 'organizations', 'users'],
      quotas: { max_users: 5 },
      stripe_price_id: null
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Pro',
      description: 'Plan standard pour PME',
      price_amount: 2900,
      currency: 'EUR',
      modules: ['auth', 'organizations', 'users', 'roles', 'files', 'knowledge_base'],
      quotas: { max_users: 50, max_ai_tokens: 10000 },
      stripe_price_id: 'price_1ProPlanId'
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Enterprise',
      description: 'Illimité avec IA avancée',
      price_amount: 9900,
      currency: 'EUR',
      modules: ['auth', 'organizations', 'users', 'roles', 'files', 'knowledge_base', 'ai_concierge', 'api_keys', 'audit_logs'],
      quotas: { max_users: 10000, max_ai_tokens: 1000000 },
      stripe_price_id: 'price_1EnterprisePlanId'
    }
  ];

  for (const plan of plans) {
    const { status, data } = await supabaseRest('saas_billing_plans', 'POST', plan);
    if (status === 201) {
      console.log(`✅ Plan ${plan.name} inserted`);
    } else {
      console.error(`❌ Error inserting ${plan.name}:`, data);
    }
  }
}

run();
