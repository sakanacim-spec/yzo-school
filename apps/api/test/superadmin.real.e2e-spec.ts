import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';

describe('Superadmin API (e2e - Real DB)', () => {
  let app: NestFastifyApplication;
  let supabaseService: SupabaseService;
  let ownerToken: string;
  let impersonationToken: string;
  let impersonationSessionId: string;
  let tenantId: string;
  let e2eUserId: string;

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

    // 1. Create a dynamic E2E tenant
    const { data: tenant, error: tErr } = await supabaseService.admin
      .from('saas_tenants')
      .insert({ slug: `test-api-${Date.now()}`, name: `TEST_API_${Date.now()}`, plan: 'enterprise' })
      .select('id')
      .single();
    if (tErr) throw new Error(`Failed to create API E2E tenant: ${tErr.message}`);
    tenantId = tenant.id;

    // 2. Create an E2E superadmin user
    const email = `api-owner-${Date.now()}@test-e2e.com`;
    const password = 'TestAdmin123!';
    const { data: newUser, error: createErr } = await supabaseService.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_e2e: true }
    });
    if (createErr) throw new Error(`Failed to create E2E user: ${createErr.message}`);
    e2eUserId = newUser.user.id;

    // 3. Assign roles
    await supabaseService.admin.auth.admin.updateUserById(e2eUserId, {
      app_metadata: { platform_roles: ['PLATFORM_OWNER'] }
    });

    // 4. Sign in to get a real token
    const { data: authData, error: authError } = await supabaseService.client.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.session) {
      throw new Error(`Cannot authenticate API E2E owner user: ${authError?.message}`);
    }
    ownerToken = authData.session.access_token;
  });

  afterAll(async () => {
    if (impersonationSessionId) {
      await request(app.getHttpServer())
        .post('/superadmin/impersonate/revoke')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sessionId: impersonationSessionId });
    }
    
    // Clean up
    if (impersonationSessionId) {
       await supabaseService.admin.from('saas_audit_logs').delete().eq('correlation_id', impersonationSessionId);
       await supabaseService.admin.from('platform_impersonation_sessions').delete().eq('id', impersonationSessionId);
    }
    if (e2eUserId) {
      await supabaseService.admin.auth.admin.deleteUser(e2eUserId);
    }
    if (tenantId) {
      await supabaseService.admin.from('saas_tenants').delete().eq('id', tenantId);
    }
    await app.close();
  });

  describe('KPIs', () => {
    it('/superadmin/kpis/global (GET)', async () => {
      const response = await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total_active_tenants');
      expect(response.body).toHaveProperty('total_users');
    });

    it('/superadmin/kpis/refresh (POST)', async () => {
      const response = await request(app.getHttpServer())
        .post('/superadmin/kpis/refresh')
        .set('Authorization', `Bearer ${ownerToken}`)
      if (response.status !== 201) {
        console.error('REFRESH ERROR:', response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('duration_ms');
      console.log('REFRESH DURATION:', response.body.duration_ms, 'ms');
    });
  });

  describe('Impersonation', () => {
    it('/superadmin/impersonate (POST) - Create Session', async () => {
      const response = await request(app.getHttpServer())
        .post('/superadmin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          tenantId: tenantId,
          justification: 'API E2E Testing'
        })
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('session_id');
      
      impersonationToken = response.body.token;
      impersonationSessionId = response.body.session_id;
    });

    it('should verify audit log was inserted for session start', async () => {
      const { data, error } = await supabaseService.admin
        .from('saas_audit_logs')
        .select('*')
        .eq('correlation_id', impersonationSessionId)
        .eq('action', 'superadmin.impersonation.started')
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('should authenticate using the impersonation token and verify roles', async () => {
      const response = await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total_active_tenants');
    });

    it('/superadmin/impersonate/revoke (POST) - Revoke Session', async () => {
      const response = await request(app.getHttpServer())
        .post('/superadmin/impersonate/revoke')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sessionId: impersonationSessionId })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should verify audit log was inserted for session revoke', async () => {
      const { data, error } = await supabaseService.admin
        .from('saas_audit_logs')
        .select('*')
        .eq('correlation_id', impersonationSessionId)
        .eq('action', 'superadmin.impersonation.revoked')
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('should reject impersonation token after revocation', async () => {
      await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .expect(401);
    });
  });
});
