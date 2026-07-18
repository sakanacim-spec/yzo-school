import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Charge les variables de l'environnement racine
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRole) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for E2E seeding.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const E2E_PASSWORD = 'TestAdmin123!';

export const E2E_USERS = [
  { email: 'owner@test-e2e.com', roles: ['PLATFORM_OWNER'] },
  { email: 'finance@test-e2e.com', roles: ['PLATFORM_FINANCE'] },
  { email: 'support@test-e2e.com', roles: ['PLATFORM_SUPPORT'] }
];

export async function setupE2E() {
  console.log('--- E2E SETUP: Creating test users and tenant ---');
  
  // 1. Create a dynamic E2E tenant
  const tenantName = `TEST_E2E_TENANT_${Date.now()}`;
  const slug = `test-e2e-${Date.now()}`;
  const { data: tenant, error: tErr } = await supabase
    .from('saas_tenants')
    .insert({ slug, name: tenantName, plan: 'enterprise' })
    .select('id')
    .single();

  if (tErr) throw new Error(`Failed to create E2E tenant: ${tErr.message}`);
  
  const e2eTenantId = tenant.id;
  process.env.E2E_TENANT_ID = e2eTenantId;
  console.log(`E2E Tenant created: ${e2eTenantId}`);

  // 2. Create users
  for (const u of E2E_USERS) {
    // Check if exists
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
    const existing = users.find(user => user.email === u.email);

    let userId = existing?.id;

    if (!existing) {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: E2E_PASSWORD,
        email_confirm: true,
        user_metadata: { is_e2e: true }
      });
      if (createErr) throw new Error(`Failed to create ${u.email}: ${createErr.message}`);
      userId = newUser.user.id;
    }

    // Assign roles in metadata
    await supabase.auth.admin.updateUserById(userId as string, {
      app_metadata: { platform_roles: u.roles }
    });

    // Ensure they exist in public.saas_profiles
    const { error: upsertErr } = await supabase.from('saas_profiles').upsert({
      id: userId,
      tenant_id: e2eTenantId,
    }, { onConflict: 'id' });
    
    if (upsertErr) {
      console.error(`Could not upsert in public.saas_profiles: ${upsertErr.message}`);
    }
    console.log(`User ${u.email} ready (Role: ${u.roles[0]})`);
  }
}

export async function teardownE2E() {
  console.log('--- E2E TEARDOWN: Cleaning up test users and tenant ---');
  
  // 1. Clean users
  const { data: { users } } = await supabase.auth.admin.listUsers();
  for (const u of E2E_USERS) {
    const user = users.find(usr => usr.email === u.email);
    if (user) {
      // Delete impersonation sessions tied to this user to avoid FK violation
      await supabase.from('platform_impersonation_sessions').delete().eq('super_admin_id', user.id);
      
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`Deleted user ${u.email}`);
    }
  }

  // 2. Clean tenant
  const tenantId = process.env.E2E_TENANT_ID;
  if (tenantId) {
    // Delete impersonation sessions tied to this tenant just in case
    await supabase.from('platform_impersonation_sessions').delete().eq('tenant_id', tenantId);
    
    const { error } = await supabase.from('saas_tenants').delete().eq('id', tenantId);
    if (error) console.error('Failed to delete E2E tenant:', error.message);
    else console.log(`Deleted tenant ${tenantId}`);
  }
}
