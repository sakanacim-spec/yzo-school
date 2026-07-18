import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

describe('Supabase RLS Tenant Isolation (e2e - Real DB)', () => {
  let app: NestFastifyApplication;
  let supabaseService: SupabaseService;

  // Supabase URL & Anon Key
  let supabaseUrl: string;
  let supabaseAnonKey: string;

  // Test data variables
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  // Clients
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  // Cleanup lists
  const createdUserIds: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    supabaseService = app.get(SupabaseService);

    // Retrieve credentials
    supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    // 1. Create Tenant A and Tenant B
    const createTenant = async (name: string, slug: string) => {
      const { data, error } = await supabaseService.admin
        .from('saas_tenants')
        .insert({ name, slug, plan: 'enterprise' })
        .select('id')
        .single();
      if (error) throw error;
      tenantIds.push(data.id);
      return data.id;
    };

    tenantAId = await createTenant(`Tenant A ${Date.now()}`, `tenant-a-${Date.now()}`);
    tenantBId = await createTenant(`Tenant B ${Date.now()}`, `tenant-b-${Date.now()}`);

    // Helper to setup user with tenant_id claim in metadata
    const setupTenantUser = async (tenantId: string, email: string) => {
      const password = 'TestAdmin123!';
      const { data: nu, error: cuErr } = await supabaseService.admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_e2e: true }
      });
      if (cuErr) throw cuErr;
      createdUserIds.push(nu.user.id);

      // Assign tenant_id in app_metadata to simulate standard SaaS authentication token claims
      await supabaseService.admin.auth.admin.updateUserById(nu.user.id, {
        app_metadata: { tenant_id: tenantId, roles: ['user'] }
      });

      // Sign in user to get real token
      const { data: auth, error: aErr } = await supabaseService.client.auth.signInWithPassword({
        email,
        password
      });
      if (aErr || !auth.session) throw new Error(`SignIn failed: ${aErr?.message}`);
      return { token: auth.session.access_token, id: nu.user.id };
    };

    const userA = await setupTenantUser(tenantAId, `user-a-${Date.now()}@test-rls.com`);
    userAId = userA.id;
    userAToken = userA.token;

    const userB = await setupTenantUser(tenantBId, `user-b-${Date.now()}@test-rls.com`);
    userBId = userB.id;
    userBToken = userB.token;

    // Create localized clients mimicking real requests
    clientA = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${userAToken}`
        }
      }
    });

    clientB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${userBToken}`
        }
      }
    });

    // Seed some profile data for Tenant B to verify read attempts
    // (saas_profiles is created automatically during signup in auth schema, but we link it to the tenant)
    await supabaseService.admin
      .from('saas_profiles')
      .update({ tenant_id: tenantBId })
      .eq('id', userBId);

    await supabaseService.admin
      .from('saas_profiles')
      .update({ tenant_id: tenantAId })
      .eq('id', userAId);
  });

  afterAll(async () => {
    // Teardown E2E tenants & users
    for (const userId of createdUserIds) {
      await supabaseService.admin.auth.admin.deleteUser(userId);
    }
    for (const tenantId of tenantIds) {
      await supabaseService.admin.from('saas_tenants').delete().eq('id', tenantId);
    }
    await app.close();
  });

  describe('1. Read Isolation (Select)', () => {
    it('Tenant A user should not be able to read Tenant B profile', async () => {
      const { data, error } = await clientA
        .from('saas_profiles')
        .select('*')
        .eq('id', userBId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLS makes it look like it doesn't exist
    });

    it('Tenant A user should be able to read their own profile in Tenant A', async () => {
      const { data, error } = await clientA
        .from('saas_profiles')
        .select('*')
        .eq('id', userAId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].tenant_id).toBe(tenantAId);
    });
  });

  describe('2. Write Isolation (Insert / Update / Delete)', () => {
    it('Tenant A user should not be able to insert data linked to Tenant B', async () => {
      // Trying to insert a file for Tenant B
      const { data, error } = await clientA
        .from('saas_files')
        .insert({
          tenant_id: tenantBId,
          filename: 'stolen_file.txt',
          storage_path: 'stolen_path',
          size_bytes: 100,
          mime_type: 'text/plain',
          uploaded_by: userAId
        })
        .select();

      // In Postgres, if RLS fails on insert, it returns an empty row or throws an error.
      // With Postgres 14+ RLS, if the policy check fails on insert it throws a 403 / "new row violates row-level security policy"
      if (error) {
        expect(error.code).toBe('42501'); // Postgres RLS policy violation code
      } else {
        expect(data).toHaveLength(0);
      }
    });

    it('Tenant A user should not be able to update Tenant B profile', async () => {
      const { data, error } = await clientA
        .from('saas_profiles')
        .update({ first_name: 'hacked' })
        .eq('id', userBId)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // 0 rows updated
    });

    it('Tenant A user should not be able to delete Tenant B profiles', async () => {
      const { data, error } = await clientA
        .from('saas_profiles')
        .delete()
        .eq('id', userBId)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // 0 rows deleted
    });
  });

  describe('3. Bypass Attempts', () => {
    it('should block bypass attempts via SQL OR conditions', async () => {
      // Trying to request profiles belonging to A OR B
      const { data, error } = await clientA
        .from('saas_profiles')
        .select('*')
        .or(`tenant_id.eq.${tenantAId},tenant_id.eq.${tenantBId}`);

      expect(error).toBeNull();
      // Should ONLY return user A's profile (Tenant A)
      for (const row of data || []) {
        expect(row.tenant_id).toBe(tenantAId);
        expect(row.tenant_id).not.toBe(tenantBId);
      }
    });

    it('should block bypass attempts via SQL IN conditions', async () => {
      const { data, error } = await clientA
        .from('saas_profiles')
        .select('*')
        .in('tenant_id', [tenantAId, tenantBId]);

      expect(error).toBeNull();
      for (const row of data || []) {
        expect(row.tenant_id).toBe(tenantAId);
        expect(row.tenant_id).not.toBe(tenantBId);
      }
    });
  });

  describe('4. Service Role Access', () => {
    it('service_role client should bypass RLS and read all tenants', async () => {
      const { data: tenantAData } = await supabaseService.admin
        .from('saas_profiles')
        .select('*')
        .eq('tenant_id', tenantAId);

      const { data: tenantBData } = await supabaseService.admin
        .from('saas_profiles')
        .select('*')
        .eq('tenant_id', tenantBId);

      expect(tenantAData?.length).toBeGreaterThanOrEqual(1);
      expect(tenantBData?.length).toBeGreaterThanOrEqual(1);
    });
  });
});
