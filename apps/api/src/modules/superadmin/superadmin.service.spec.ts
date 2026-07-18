import { Test, TestingModule } from '@nestjs/testing';
import { SuperadminService } from './superadmin.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('SuperadminService', () => {
  let service: SuperadminService;
  let supabaseService: SupabaseService;
  let jwtService: JwtService;

  const mockSupabaseService = {
    admin: {
      rpc: jest.fn(),
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.SUPABASE_JWT_SECRET = 'test-secret-123456789012345678901234567890';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperadminService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<SuperadminService>(SuperadminService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGlobalKpis', () => {
    it('should return global KPIs successfully', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: { active_tenants: 5, total_users: 100 },
        error: null,
      });

      const result = await service.getGlobalKpis();
      expect(result).toEqual({
        active_tenants: 5,
        total_users: 100,
      });
    });

    it('should throw InternalServerErrorException if global kpi fetch fails', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: null,
        error: new Error('DB Error'),
      });
      await expect(service.getGlobalKpis()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getFinancialKpis', () => {
    it('should return financial KPIs successfully', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({ data: { mrr: 1000 }, error: null });

      const result = await service.getFinancialKpis();
      expect(result).toEqual({ mrr: 1000 });
    });

    it('should throw InternalServerErrorException if fetch fails', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: null,
        error: new Error('DB Error'),
      });
      await expect(service.getFinancialKpis()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getUsageKpis', () => {
    it('should return usage KPIs successfully', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: { total_api_calls: 5000 },
        error: null,
      });

      const result = await service.getUsageKpis();
      expect(result).toEqual({ total_api_calls: 5000 });
    });

    it('should throw InternalServerErrorException if fetch fails', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: null,
        error: new Error('DB Error'),
      });
      await expect(service.getUsageKpis()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('refreshKpis', () => {
    it('should refresh successfully', async () => {
      mockSupabaseService.admin.rpc.mockResolvedValue({ error: null });
      const result = await service.refreshKpis();
      expect(result).toEqual({
        success: true,
        message: 'Vues matérialisées rafraîchies avec succès.',
        duration_ms: expect.any(Number)
      });
    });

    it('should throw BadRequestException if refresh is already in progress', async () => {
      (service as any).isRefreshing = true;
      await expect(service.refreshKpis()).rejects.toThrow(BadRequestException);
      (service as any).isRefreshing = false;
    });

    it('should throw InternalServerErrorException if rpc fails', async () => {
      mockSupabaseService.admin.rpc.mockResolvedValue({ error: new Error('RPC Error') });
      await expect(service.refreshKpis()).rejects.toThrow(InternalServerErrorException);
      expect((service as any).isRefreshing).toBe(false);
    });
  });

  describe('createImpersonationSession', () => {
    it('should create session and return token', async () => {
      mockSupabaseService.admin.single
        .mockResolvedValueOnce({ data: { id: 'tenant-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'sess-1' }, error: null });
      mockSupabaseService.admin.insert.mockReturnThis();

      mockJwtService.sign.mockReturnValue('mocked-jwt-token');

      const result = await service.createImpersonationSession('tenant-1', 'admin-1', 'Support', [
        'PLATFORM_OWNER',
      ]);
      expect(result).toEqual(
        expect.objectContaining({
          session_id: 'sess-1',
          token: 'mocked-jwt-token',
        }),
      );
      expect(mockJwtService.sign).toHaveBeenCalled();
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });
      await expect(
        service.createImpersonationSession('invalid-tenant', 'admin-1', 'Support', []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if session creation violates constraints', async () => {
      mockSupabaseService.admin.single
        .mockResolvedValueOnce({ data: { id: 'tenant-1' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: '23505' } }); // unique violation

      await expect(
        service.createImpersonationSession('tenant-1', 'admin-1', 'Support', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException if session creation fails for other reasons', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabaseService.admin.single
        .mockResolvedValueOnce({ data: { id: 'tenant-1' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'OTHER_CODE', message: 'DB Error' } });

      await expect(
        service.createImpersonationSession('admin-1', 'tenant-1', 'Support', []),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if SUPABASE_JWT_SECRET is missing', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      delete process.env.SUPABASE_JWT_SECRET;
      mockSupabaseService.admin.single
        .mockResolvedValueOnce({ data: { id: 'tenant-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'sess-1' }, error: null });

      await expect(
        service.createImpersonationSession('admin-1', 'tenant-1', 'Support', []),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('revokeImpersonationSession', () => {
    it('should revoke session successfully', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: { id: 'sess-1', tenant_id: 't1' },
        error: null,
      });

      const result = await service.revokeImpersonationSession('sess-1', 'admin-1');
      expect(result).toEqual({ message: 'Session révoquée.', success: true });
    });

    it('should throw NotFoundException if session not found', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(service.revokeImpersonationSession('sess-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException if db error', async () => {
      mockSupabaseService.admin.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB Error' },
      });
      await expect(service.revokeImpersonationSession('sess-1', 'admin-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getCurrentImpersonationSession', () => {
    it('should return session if found', async () => {
      mockSupabaseService.admin.maybeSingle.mockResolvedValueOnce({
        data: { id: 'sess-1' },
        error: null,
      });
      const result = await service.getCurrentImpersonationSession('admin-1');
      expect(result).toEqual({ id: 'sess-1' });
    });

    it('should return null if no active session', async () => {
      mockSupabaseService.admin.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const result = await service.getCurrentImpersonationSession('admin-1');
      expect(result).toBeNull();
    });

    it('should throw InternalServerErrorException on db error', async () => {
      mockSupabaseService.admin.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB Error' },
      });
      await expect(service.getCurrentImpersonationSession('admin-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
