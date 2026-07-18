import { Test, TestingModule } from '@nestjs/testing';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { UnauthorizedException } from '@nestjs/common';

import * as jwt from 'jsonwebtoken';

describe('SuperAdmin (e2e)', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;
  let supabaseService: SupabaseService;
  let server: any;

  // Helpers pour générer des tokens mockés
  const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'test-secret-dev-only-min-32-chars';

  const generateToken = (userId: string, roles: string[] = [], impersonationSessionId: string | null = null, tenantId: string | null = null) => {
    const payload = {
      sub: userId,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      app_metadata: {
        platform_roles: roles,
        impersonation_session_id: impersonationSessionId,
        tenant_id: tenantId
      }
    };
    return jwt.sign(payload, jwtSecret);
  };

  const MOCK_DB = {
    impersonation_sessions: new Map<string, any>(),
    audit_logs: [] as any[]
  };

  beforeAll(async () => {

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(SupabaseService)
    .useValue({
      verifyToken: jest.fn().mockImplementation(async (token) => {
         let role = ['PLATFORM_OWNER'];
         if (token.includes('user-finance')) role = ['PLATFORM_FINANCE'];
         if (token.includes('user-support')) role = ['PLATFORM_SUPPORT'];
         if (token.includes('user-tenant')) role = [];
         
         const app_metadata: any = { platform_roles: role };
         if (token.includes('impersonate')) {
            app_metadata.impersonation_session_id = 'sess-123';
            app_metadata.tenant_id = 'tenant-99';
         }
         return { id: 'test-user', app_metadata };
      }),
      admin: {
        from: (table: string) => ({
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockImplementation((data: any) => {
            if (table === 'saas_audit_logs') {
              MOCK_DB.audit_logs.push(data);
            }
            if (table === 'platform_impersonation_sessions') {
              const id = 'sess-123';
              const session = { ...data, id };
              MOCK_DB.impersonation_sessions.set(id, session);
              return { select: () => ({ single: () => Promise.resolve({ data: session, error: null }) }) };
            }
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'some-id' }, error: null }) }) };
          }),
          update: jest.fn().mockImplementation((data: any) => {
             return {
               eq: (field: string, val: any) => {
                 if (table === 'platform_impersonation_sessions') {
                    const session = MOCK_DB.impersonation_sessions.get(val);
                    if (session) {
                       session.status = data.status;
                       MOCK_DB.impersonation_sessions.set(val, session);
                    }
                    return {
                      eq: () => ({
                        select: () => ({
                           single: () => Promise.resolve({ data: session, error: null })
                        })
                      })
                    }
                 }
                 return this;
               }
             }
          }),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() => {
             if (table === 'saas_tenants') return Promise.resolve({ data: { id: 'tenant-1' }, error: null });
             if (table === 'platform_global_kpis_mv') return Promise.resolve({ data: { id: 1 }, error: null });
             if (table === 'platform_financial_kpis_mv') return Promise.resolve({ data: { id: 1 }, error: null });
             if (table === 'platform_usage_kpis_mv') return Promise.resolve({ data: { id: 1 }, error: null });
             // default mock for auth checks in guard
             return Promise.resolve({ data: { status: 'ACTIVE', expires_at: new Date(Date.now() + 3600000).toISOString() }, error: null });
          }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        rpc: jest.fn().mockImplementation(async (fnName) => {
           if (fnName === 'refresh_platform_kpis_mv') {
             await new Promise(r => setTimeout(r, 100));
             return { error: null };
           }
           return { error: null };
        }),
        auth: {
           getUser: jest.fn().mockImplementation(async (token) => {
              let role = ['PLATFORM_OWNER'];
              if (token.includes('user-finance')) role = ['PLATFORM_FINANCE'];
              if (token.includes('user-support')) role = ['PLATFORM_SUPPORT'];
              if (token.includes('user-tenant')) role = [];
              
              const app_metadata: any = { platform_roles: role };
              if (token.includes('impersonate')) {
                 app_metadata.impersonation_session_id = 'sess-123';
                 app_metadata.tenant_id = 'tenant-99';
              }
              
              return { data: { user: { id: 'test-user', app_metadata } }, error: null };
           })
        }
    })
    .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    jwtService = new JwtService({ secret: jwtSecret });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    MOCK_DB.audit_logs = [];
    MOCK_DB.impersonation_sessions.clear();
  });

  describe('Matrice des Rôles (Endpoints)', () => {
    const tokens: Record<string, string> = {
      OWNER: '',
      FINANCE: '',
      SUPPORT: '',
      TENANT_ADMIN: '',
    };

    beforeAll(() => {
      tokens.OWNER = generateToken('user-owner', ['PLATFORM_OWNER']);
      tokens.FINANCE = generateToken('user-finance', ['PLATFORM_FINANCE']);
      tokens.SUPPORT = generateToken('user-support', ['PLATFORM_SUPPORT']);
      tokens.TENANT_ADMIN = generateToken('user-tenant', []); // Pas de rôles plateforme
    });

    it('GET /superadmin/kpis/global', async () => {
      await request(server).get('/superadmin/kpis/global').set('Authorization', `Bearer ${tokens.OWNER}`).expect(200);
      await request(server).get('/superadmin/kpis/global').set('Authorization', `Bearer ${tokens.FINANCE}`).expect(200);
      await request(server).get('/superadmin/kpis/global').set('Authorization', `Bearer ${tokens.SUPPORT}`).expect(200);
      await request(server).get('/superadmin/kpis/global').set('Authorization', `Bearer ${tokens.TENANT_ADMIN}`).expect(403);
    });

    it('GET /superadmin/kpis/financial', async () => {
      await request(server).get('/superadmin/kpis/financial').set('Authorization', `Bearer ${tokens.OWNER}`).expect(200);
      await request(server).get('/superadmin/kpis/financial').set('Authorization', `Bearer ${tokens.FINANCE}`).expect(200);
      await request(server).get('/superadmin/kpis/financial').set('Authorization', `Bearer ${tokens.SUPPORT}`).expect(403);
      await request(server).get('/superadmin/kpis/financial').set('Authorization', `Bearer ${tokens.TENANT_ADMIN}`).expect(403);
    });
  });

  describe('Concurrence Refresh (Lock)', () => {
    let token: string;
    beforeAll(() => {
      token = generateToken('owner', ['PLATFORM_OWNER']);
    });
    
    it('Devrait rejeter la deuxième requête simultanée avec 400 Bad Request', async () => {
      
      // On lance deux requêtes en même temps (la première prend ~100ms car mockée)
      const req1 = request(server).post('/superadmin/kpis/refresh').set('Authorization', `Bearer ${token}`);
      const req2 = request(server).post('/superadmin/kpis/refresh').set('Authorization', `Bearer ${token}`);

      const [res1, res2] = await Promise.all([req1, req2]);

      // L'une doit réussir (201 pour POST NestJS par défaut), l'autre doit échouer (400)
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);
    });
  });

  describe('Scénario Complet Impersonation & Audit', () => {
    let impersonationToken: string;
    let sessionId: string;
    let ownerToken: string;

    beforeAll(() => {
      ownerToken = generateToken('owner-1', ['PLATFORM_OWNER']);
    });

    it('1. Création de session & Audit Log Start', async () => {
      const res = await request(server)
        .post('/superadmin/impersonate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tenantId: 'tenant-99', justification: 'Bug UI' })
        .expect(201);

      expect(res.body.token).toBeDefined();
      expect(res.body.session_id).toBe('sess-123');
      impersonationToken = res.body.token;
      sessionId = res.body.session_id;

      // Vérification audit log (start)
      const auditLog = MOCK_DB.audit_logs.find(l => l.action === 'superadmin.impersonation.started');
      expect(auditLog).toBeDefined();
      expect(auditLog.correlation_id).toBe(sessionId);
      expect(auditLog.tenant_id).toBe('tenant-99');
      // Vérification PAS de JWT dans l'audit
      expect(JSON.stringify(auditLog)).not.toContain(impersonationToken);
    });

    it('2. Appel avec JWT valide', async () => {
      // Pour ce test on simule que le Guard vérifie la DB et que c'est ACTIVE (default mock)
      await request(server)
        .get('/superadmin/impersonate/current')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .expect(200);
    });

    it('3. Révocation de session & Audit Log Revoke', async () => {
      MOCK_DB.impersonation_sessions.set(sessionId, {
        id: sessionId,
        super_admin_id: 'test-user',
        tenant_id: 'tenant-99',
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      });

      await request(server)
        .post('/superadmin/impersonate/revoke')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sessionId })
        .expect(201);

      // Vérification audit log (revoke)
      const auditLog = MOCK_DB.audit_logs.find(l => l.action === 'superadmin.impersonation.revoked');
      expect(auditLog).toBeDefined();
      expect(auditLog.correlation_id).toBe(sessionId);
    });

    it('4. Appel avec JWT révoqué -> 401', async () => {
      // Mock the guard check to return REVOKED based on our MOCK_DB
      const appRef = app.get(SupabaseService);
      jest.spyOn(appRef.admin, 'from').mockImplementationOnce((table: string) => {
         if (table === 'platform_impersonation_sessions') {
            return {
              select: () => ({
                 eq: () => ({
                    single: () => Promise.resolve({ data: { status: 'REVOKED', expires_at: new Date(Date.now() + 3600000).toISOString() }, error: null })
                 })
              })
            } as any;
         }
         return {} as any;
      });

      await request(server)
        .get('/superadmin/impersonate/current')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .expect(401);
    });
    
    it('5. Expiration -> Audit Log Expired & 401', async () => {
      // Mock the guard check to return EXPIRED based on time
      const appRef = app.get(SupabaseService);
      jest.spyOn(appRef.admin, 'from').mockImplementationOnce((table: string) => {
         if (table === 'platform_impersonation_sessions') {
            return {
              select: () => ({
                 eq: () => ({
                    single: () => Promise.resolve({ data: { status: 'ACTIVE', expires_at: new Date(Date.now() - 3600000).toISOString() }, error: null })
                 })
              })
            } as any;
         }
         return {
           update: () => ({ eq: () => Promise.resolve() }),
           insert: (data: any) => { MOCK_DB.audit_logs.push(data); return Promise.resolve(); }
         } as any;
      });

      await request(server)
        .get('/superadmin/impersonate/current')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .expect(401);

      // Vérification audit log (expired)
      const auditLog = MOCK_DB.audit_logs.find(l => l.action === 'superadmin.impersonation.expired');
      expect(auditLog).toBeDefined();
      expect(auditLog.correlation_id).toBe(sessionId);
    });
  });
});
