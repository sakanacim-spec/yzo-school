import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';

const request = require('supertest');

describe('Superadmin RBAC Access Matrix (e2e - Real DB)', () => {
  jest.setTimeout(30000);
  let app: NestFastifyApplication;
  let supabaseService: SupabaseService;
  let jwtService: JwtService;

  // Tokens
  let ownerToken: string;
  let financeToken: string;
  let supportToken: string;
  let normalUserToken: string;
  let expiredToken: string;
  let tamperedToken: string;
  let impersonationTokenRevoked: string;
  let impersonationTokenExpired: string;
  let ownerForImpersonateToken: string;
  let supportForImpersonateToken: string;

  // Cleanup lists
  const createdUserIds: string[] = [];
  let tenantId: string;
  let activeSessionId: string;
  let supportActiveSessionId: string;
  let revokedSessionId: string;
  let expiredSessionId: string;

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
    jwtService = app.get(JwtService);

    // 1. Create E2E tenant
    const { data: tenant, error: tErr } = await supabaseService.admin
      .from('saas_tenants')
      .insert({ slug: `test-rbac-${Date.now()}`, name: `TEST_RBAC_${Date.now()}`, plan: 'enterprise' })
      .select('id')
      .single();
    if (tErr) throw new Error(`Failed to create tenant: ${tErr.message}`);
    tenantId = tenant.id;

    // Helper to create and authenticate users
    const setupUser = async (roleName?: string) => {
      const email = `rbac-${roleName?.toLowerCase() || 'user'}-${Date.now()}@test-e2e.com`;
      const password = 'TestAdmin123!';
      const { data: nu, error: cuErr } = await supabaseService.admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_e2e: true }
      });
      if (cuErr) throw new Error(`Failed to create user: ${cuErr.message}`);
      createdUserIds.push(nu.user.id);

      if (roleName) {
        await supabaseService.admin.auth.admin.updateUserById(nu.user.id, {
          app_metadata: { platform_roles: [roleName] }
        });
      }

      const { data: auth, error: aErr } = await supabaseService.client.auth.signInWithPassword({
        email,
        password
      });
      if (aErr || !auth.session) throw new Error(`Failed to sign in user: ${aErr?.message}`);
      return { token: auth.session.access_token, id: nu.user.id };
    };

    // Create users & get real tokens
    const owner = await setupUser('PLATFORM_OWNER');
    ownerToken = owner.token;

    const finance = await setupUser('PLATFORM_FINANCE');
    financeToken = finance.token;

    const support = await setupUser('PLATFORM_SUPPORT');
    supportToken = support.token;

    const normal = await setupUser();
    normalUserToken = normal.token;

    // Separate support users to hold revoked and expired sessions (avoiding 1 active session per user DB constraints)
    const supportForRevoke = await setupUser('PLATFORM_SUPPORT');
    const supportForExpire = await setupUser('PLATFORM_SUPPORT');

    // Dedicated users for POST /superadmin/impersonate to avoid conflict with already active sessions
    const ownerForImpersonate = await setupUser('PLATFORM_OWNER');
    ownerForImpersonateToken = ownerForImpersonate.token;

    const supportForImpersonate = await setupUser('PLATFORM_SUPPORT');
    supportForImpersonateToken = supportForImpersonate.token;

    // 2. Generate abnormal JWTs
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'fallback-secret-for-typechecking';
    
    // Expired standard token
    expiredToken = jwtService.sign({
      aud: 'authenticated',
      sub: owner.id,
      email: 'expired@test-e2e.com',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 10 // 10s in past
    }, { secret: jwtSecret });

    // Tampered token
    tamperedToken = supportToken.slice(0, -10) + 'invalidsig';

    // 3. Setup Impersonation Tokens
    // A. Revoked session impersonation token
    const { data: rSess, error: rsErr } = await supabaseService.admin
      .from('platform_impersonation_sessions')
      .insert({
        super_admin_id: supportForRevoke.id, // Use dedicated support user
        tenant_id: tenantId,
        justification: 'RBAC Revoke Test',
        status: 'REVOKED',
        expires_at: new Date(Date.now() + 3540000).toISOString() // 59m in future
      })
      .select()
      .single();
    if (rsErr) throw new Error(`Failed to create revoked session: ${rsErr.message}`);
    revokedSessionId = rSess.id;

    impersonationTokenRevoked = jwtService.sign({
      aud: 'authenticated',
      sub: supportForRevoke.id,
      app_metadata: {
        provider: 'impersonation',
        impersonation_session_id: revokedSessionId,
        impersonating: true,
        tenant_id: tenantId,
        platform_roles: ['PLATFORM_SUPPORT']
      },
      role: 'authenticated'
    }, { secret: jwtSecret, expiresIn: '1h' });

    // B. Expired session impersonation token
    const { data: eSess, error: esErr } = await supabaseService.admin
      .from('platform_impersonation_sessions')
      .insert({
        super_admin_id: supportForExpire.id, // Use dedicated support user
        tenant_id: tenantId,
        justification: 'RBAC Expire Test',
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 2000).toISOString() // Valid future date for INSERT
      })
      .select()
      .single();
    if (esErr) throw new Error(`Failed to create expired session: ${esErr.message}`);
    expiredSessionId = eSess.id;

    // Update to make it expired relative to NOW(), but still satisfy check constraint (expires_at > created_at)
    const { error: updErr } = await supabaseService.admin
      .from('platform_impersonation_sessions')
      .update({
        expires_at: new Date(new Date(eSess.created_at).getTime() + 1).toISOString()
      })
      .eq('id', expiredSessionId);
    if (updErr) throw new Error(`Failed to update expired session: ${updErr.message}`);

    impersonationTokenExpired = jwtService.sign({
      aud: 'authenticated',
      sub: supportForExpire.id,
      app_metadata: {
        provider: 'impersonation',
        impersonation_session_id: expiredSessionId,
        impersonating: true,
        tenant_id: tenantId,
        platform_roles: ['PLATFORM_SUPPORT']
      },
      role: 'authenticated'
    }, { secret: jwtSecret, expiresIn: '1h' });

    // C. Active session for owner revoke tests
    const { data: aSess, error: asErr } = await supabaseService.admin
      .from('platform_impersonation_sessions')
      .insert({
        super_admin_id: owner.id,
        tenant_id: tenantId,
        justification: 'RBAC Active Test Owner',
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 3540000).toISOString()
      })
      .select()
      .single();
    if (asErr) throw new Error(`Failed to create active session: ${asErr.message}`);
    activeSessionId = aSess.id;

    // D. Active session for support revoke tests
    const { data: sSess, error: ssErr } = await supabaseService.admin
      .from('platform_impersonation_sessions')
      .insert({
        super_admin_id: support.id,
        tenant_id: tenantId,
        justification: 'RBAC Active Test Support',
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 3540000).toISOString()
      })
      .select()
      .single();
    if (ssErr) throw new Error(`Failed to create support active session: ${ssErr.message}`);
    supportActiveSessionId = sSess.id;
  });

  afterAll(async () => {
    // Teardown
    if (activeSessionId) {
      await supabaseService.admin.from('platform_impersonation_sessions').delete().eq('id', activeSessionId);
    }
    if (supportActiveSessionId) {
      await supabaseService.admin.from('platform_impersonation_sessions').delete().eq('id', supportActiveSessionId);
    }
    if (revokedSessionId) {
      await supabaseService.admin.from('platform_impersonation_sessions').delete().eq('id', revokedSessionId);
    }
    if (expiredSessionId) {
      await supabaseService.admin.from('platform_impersonation_sessions').delete().eq('id', expiredSessionId);
    }
    await supabaseService.admin.from('saas_audit_logs').delete().eq('tenant_id', tenantId);
    
    for (const userId of createdUserIds) {
      await supabaseService.admin.auth.admin.deleteUser(userId);
    }
    if (tenantId) {
      await supabaseService.admin.from('saas_tenants').delete().eq('id', tenantId);
    }
    await app.close();
  });

  const matrix = [
    // 1. GET /superadmin/kpis/global
    { path: '/superadmin/kpis/global', method: 'get', body: null, results: {
      PLATFORM_OWNER: 200, PLATFORM_FINANCE: 200, PLATFORM_SUPPORT: 200,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 2. GET /superadmin/kpis/financial
    { path: '/superadmin/kpis/financial', method: 'get', body: null, results: {
      PLATFORM_OWNER: 200, PLATFORM_FINANCE: 200, PLATFORM_SUPPORT: 403,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 3. GET /superadmin/kpis/usage
    { path: '/superadmin/kpis/usage', method: 'get', body: null, results: {
      PLATFORM_OWNER: 200, PLATFORM_FINANCE: 403, PLATFORM_SUPPORT: 200,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 4. POST /superadmin/kpis/refresh
    { path: '/superadmin/kpis/refresh', method: 'post', body: null, results: {
      PLATFORM_OWNER: 201, PLATFORM_FINANCE: 403, PLATFORM_SUPPORT: 403,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 5. POST /superadmin/impersonate
    { path: '/superadmin/impersonate', method: 'post', body: { tenantId: 'dummy-uuid', justification: 'Justification E2E Matrix Test' }, results: {
      PLATFORM_OWNER: 201, PLATFORM_FINANCE: 403, PLATFORM_SUPPORT: 201,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 6. POST /superadmin/impersonate/revoke
    { path: '/superadmin/impersonate/revoke', method: 'post', body: { sessionId: 'dummy-uuid' }, results: {
      PLATFORM_OWNER: 201, PLATFORM_FINANCE: 403, PLATFORM_SUPPORT: 201,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }},
    // 7. GET /superadmin/impersonate/current
    { path: '/superadmin/impersonate/current', method: 'get', body: null, results: {
      PLATFORM_OWNER: 200, PLATFORM_FINANCE: 403, PLATFORM_SUPPORT: 200,
      TENANT_ADMIN: 403, normal: 403, nojwt: 401, expired: 401,
      revoked: 401, expiredSession: 401, tampered: 401
    }}
  ];

  const getRequest = (item: typeof matrix[0], token: string | null, profileName: string) => {
    let req = request(app.getHttpServer());
    if (item.method === 'get') {
      req = req.get(item.path);
    } else {
      req = req.post(item.path);
    }
    
    let finalToken = token;
    if (item.path === '/superadmin/impersonate' && item.method === 'post') {
      if (profileName === 'PLATFORM_OWNER') finalToken = ownerForImpersonateToken;
      if (profileName === 'PLATFORM_SUPPORT') finalToken = supportForImpersonateToken;
    }

    if (finalToken) {
      req = req.set('Authorization', `Bearer ${finalToken}`);
    }
    if (item.body) {
      // Dynamic replace if body needs UUIDs
      const payload = { ...item.body };
      if (payload.tenantId === 'dummy-uuid') payload.tenantId = tenantId;
      if (payload.sessionId === 'dummy-uuid') {
        payload.sessionId = profileName === 'PLATFORM_SUPPORT' ? supportActiveSessionId : activeSessionId;
      }
      req = req.send(payload);
    }
    return req;
  };

  const profiles: { name: string; token: string | null }[] = [
    { name: 'PLATFORM_OWNER', token: () => ownerToken } as any,
    { name: 'PLATFORM_FINANCE', token: () => financeToken } as any,
    { name: 'PLATFORM_SUPPORT', token: () => supportToken } as any,
    { name: 'TENANT_ADMIN', token: () => normalUserToken } as any, // acts as tenant admin / unauthorized
    { name: 'normal', token: () => normalUserToken } as any,
    { name: 'nojwt', token: () => null } as any,
    { name: 'expired', token: () => expiredToken } as any,
    { name: 'revoked', token: () => impersonationTokenRevoked } as any,
    { name: 'expiredSession', token: () => impersonationTokenExpired } as any,
    { name: 'tampered', token: () => tamperedToken } as any,
  ];

  for (const item of matrix) {
    describe(`${item.method.toUpperCase()} ${item.path}`, () => {
      for (const profile of profiles) {
        const expectedStatus = (item.results as any)[profile.name];

        it(`should return ${expectedStatus} for ${profile.name}`, async () => {
          const t = (profile.token as any)();
          const response = await getRequest(item, t, profile.name);
          
          if (response.status === 500 && expectedStatus !== 500) {
            console.error('500 ERROR FOR', profile.name, 'ON', item.method.toUpperCase(), item.path, ':', response.body);
          }
          expect(response.status).toBe(expectedStatus);

          // Security checks for denied profiles
          if (expectedStatus === 401 || expectedStatus === 403) {
            // Confirm no sensitive fields are returned
            expect(response.body).not.toHaveProperty('token');
            expect(response.body).not.toHaveProperty('session_id');
            expect(response.body).not.toHaveProperty('active_tenants');
            expect(response.body).not.toHaveProperty('total_active_tenants');
            expect(response.body).not.toHaveProperty('total_mrr');
          }
        });
      }
    });
  }
});
