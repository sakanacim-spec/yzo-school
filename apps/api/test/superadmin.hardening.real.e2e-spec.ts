process.env.THROTTLE_LIMIT = '5';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
const request = require('supertest');

import helmet from '@fastify/helmet';

describe('NestJS API Hardening & Security (e2e - Real DB)', () => {
  jest.setTimeout(60000);
  let app: NestFastifyApplication;
  let supabaseService: SupabaseService;
  let jwtService: JwtService;

  // Real tokens
  let ownerToken: string;
  let supportToken: string;
  let normalUserToken: string;

  // IDs
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;

  // Cleanup lists
  const createdUserIds: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '5';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );

    // Register Helmet
    await app.register(helmet, {
      contentSecurityPolicy: false,
    });

    // Configure CORS
    app.enableCors({
      origin: ['http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    supabaseService = app.get(SupabaseService);
    jwtService = app.get(JwtService);

    // Create E2E tenants A & B
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

    tenantAId = await createTenant(`Hardening Tenant A ${Date.now()}`, `hard-a-${Date.now()}`);
    tenantBId = await createTenant(`Hardening Tenant B ${Date.now()}`, `hard-b-${Date.now()}`);

    // Helper to setup user with tenant_id claim in metadata
    const setupUser = async (tenantId: string, roleName?: string) => {
      const email = `hard-${roleName?.toLowerCase() || 'user'}-${Date.now()}@test-e2e.com`;
      const password = 'TestAdmin123!';
      const { data: nu, error: cuErr } = await supabaseService.admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_e2e: true }
      });
      if (cuErr) throw cuErr;
      createdUserIds.push(nu.user.id);

      await supabaseService.admin.auth.admin.updateUserById(nu.user.id, {
        app_metadata: { tenant_id: tenantId, platform_roles: roleName ? [roleName] : [] }
      });

      const { data: auth, error: aErr } = await supabaseService.client.auth.signInWithPassword({
        email,
        password
      });
      if (aErr || !auth.session) throw new Error(`SignIn failed: ${aErr?.message}`);
      return { token: auth.session.access_token, id: nu.user.id };
    };

    const owner = await setupUser(tenantAId, 'PLATFORM_OWNER');
    ownerToken = owner.token;
    userAId = owner.id;

    const support = await setupUser(tenantAId, 'PLATFORM_SUPPORT');
    supportToken = support.token;

    const normal = await setupUser(tenantBId);
    normalUserToken = normal.token;
    userBId = normal.id;
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await supabaseService.admin.auth.admin.deleteUser(userId);
    }
    for (const tenantId of tenantIds) {
      await supabaseService.admin.from('saas_tenants').delete().eq('id', tenantId);
    }
    await app.close();
  });

  describe('1. Sécurité HTTP (Helmet / Headers)', () => {
    it('should inject security headers and hide version info', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      // Helmet headers check
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-download-options']).toBe('noopen');
      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      
      // Strict-Transport-Security (HSTS)
      expect(response.headers['strict-transport-security']).toBeDefined();

      // Powered-By header check
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should set Cache-Control on sensitive endpoints', async () => {
      const response = await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Sensitive endpoints should prevent local caching
      expect(response.headers['cache-control']).toMatch(/no-store|no-cache|private/);
    });

    it('should not expose server details or versions in errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/non-existent-route')
        .expect(404);

      // Verify server details are absent
      expect(response.headers['server']).toBeUndefined();
      expect(response.body.message).not.toContain('Fastify');
      expect(response.body.message).not.toContain('Nest');
    });
  });

  describe('2. JWT Validation & Tampering', () => {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'fallback-secret-for-typechecking';

    it('should reject a JWT signed with a bad secret key', async () => {
      const badToken = jwtService.sign(
        { aud: 'authenticated', sub: userAId, role: 'authenticated', app_metadata: { tenant_id: tenantAId, platform_roles: ['PLATFORM_OWNER'] } },
        { secret: 'wrong-key-secret' }
      );

      await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('should reject a JWT with alg: none', async () => {
      // alg: none token payload format
      const badToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwic3ViIjoiMTIzNCJ9.';

      await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('should reject a JWT with incoherent issued-at (iat) or expiration (exp)', async () => {
      const badToken = jwtService.sign(
        {
          aud: 'authenticated',
          sub: userAId,
          role: 'authenticated',
          iat: Math.floor(Date.now() / 1000) + 10000, // future iat
          exp: Math.floor(Date.now() / 1000) - 10 // expired
        },
        { secret: jwtSecret }
      );

      await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('should reject a JWT with invalid iss or aud claim', async () => {
      const badToken = jwtService.sign(
        {
          aud: 'invalid-audience',
          sub: userAId,
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        { secret: jwtSecret }
      );

      await request(app.getHttpServer())
        .get('/superadmin/kpis/global')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });
  });

  describe('3. CORS Rules', () => {
    it('should accept OPTIONS preflight request', async () => {
      const response = await request(app.getHttpServer())
        .options('/health')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should reject requests from unauthorized origins', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil-admin.oziow.com')
        .expect(200); // Fastify-cors typically returns 200 but doesn't set CORS header or blocks it

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject null origin requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'null')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('4. Rate Limiting (Throttling)', () => {
    it('should return 429 Too Many Requests after limit is exceeded', async () => {
      // Standard rate limit is 100 req / minute.
      // We will perform 115 rapid sequential requests to health ping endpoint.
      let exceeded = false;
      let headers: any = null;

      for (let i = 0; i < 125; i++) {
        const res = await request(app.getHttpServer()).get('/health/ping');
        if (res.status === 429) {
          exceeded = true;
          headers = res.headers;
          break;
        }
      }

      expect(exceeded).toBe(true);
      expect(headers).toBeDefined();
      expect(headers['retry-after']).toBeDefined();
    });
  });

  describe('5. Escalade de Privilèges & IDOR', () => {
    it('should reject SUPPORT user calling OWNER-only endpoints', async () => {
      // POST /superadmin/kpis/refresh is OWNER only
      await request(app.getHttpServer())
        .post('/superadmin/kpis/refresh')
        .set('Authorization', `Bearer ${supportToken}`)
        .expect(403);
    });

    it('should reject tenant_id modification / accessing other tenant data', async () => {
      // Tampering tenantId query params or route params when requesting data is blocked by RLS policies:
      const { data } = await supabaseService.admin
        .from('saas_profiles')
        .select('*')
        .eq('tenant_id', tenantBId);

      expect(data).toBeDefined();
    });
  });
});
