import { Test, TestingModule } from '@nestjs/testing';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('SuperadminController', () => {
  let controller: SuperadminController;
  let service: SuperadminService;

  const mockSuperadminService = {
    getGlobalKpis: jest.fn(),
    getFinancialKpis: jest.fn(),
    getUsageKpis: jest.fn(),
    refreshKpis: jest.fn(),
    createImpersonationSession: jest.fn(),
    revokeImpersonationSession: jest.fn(),
    getCurrentImpersonationSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperadminController],
      providers: [
        {
          provide: SuperadminService,
          useValue: mockSuperadminService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SuperadminController>(SuperadminController);
    service = module.get<SuperadminService>(SuperadminService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('KPIs Endpoints', () => {
    it('should return global KPIs', async () => {
      mockSuperadminService.getGlobalKpis.mockResolvedValue({ id: 1, mrr: 100 });
      const result = await controller.getGlobalKpis();
      expect(result).toEqual({ id: 1, mrr: 100 });
    });

    it('should return financial KPIs', async () => {
      mockSuperadminService.getFinancialKpis.mockResolvedValue({ id: 1, total_mrr: 1000 });
      const result = await controller.getFinancialKpis();
      expect(result).toEqual({ id: 1, total_mrr: 1000 });
    });

    it('should return usage KPIs', async () => {
      mockSuperadminService.getUsageKpis.mockResolvedValue({ id: 1, actions_last_24h: 5 });
      const result = await controller.getUsageKpis();
      expect(result).toEqual({ id: 1, actions_last_24h: 5 });
    });

    it('should refresh KPIs and prevent concurrent refresh (lock)', async () => {
      mockSuperadminService.refreshKpis.mockResolvedValue({ success: true, duration_ms: 15 });
      const result = await controller.refreshKpis();
      expect(result.duration_ms).toBeDefined();
      expect(service.refreshKpis).toHaveBeenCalled();
    });

    it('should throw BadRequestException if refresh is already in progress', async () => {
      mockSuperadminService.refreshKpis.mockRejectedValue(new BadRequestException('Un rafraîchissement est déjà en cours.'));
      await expect(controller.refreshKpis()).rejects.toThrow(BadRequestException);
    });
  });

  describe('Impersonation Endpoints', () => {
    it('should create an impersonation session', async () => {
      const mockReq = { user: { id: 'admin1', platform_roles: ['PLATFORM_OWNER'] } };
      mockSuperadminService.createImpersonationSession.mockResolvedValue({
        session_id: 'sess123',
        token: 'fake-jwt',
        expires_at: new Date()
      });

      const result = await controller.createImpersonationSession(mockReq, { tenantId: 'tenant1', justification: 'Support' });
      expect(result.token).toEqual('fake-jwt');
      expect(service.createImpersonationSession).toHaveBeenCalledWith('admin1', 'tenant1', 'Support', ['PLATFORM_OWNER']);
    });

    it('should create an impersonation session with empty platform roles fallback', async () => {
      const mockReq = { user: { id: 'admin1' } }; // platform_roles is undefined
      mockSuperadminService.createImpersonationSession.mockResolvedValue({
        session_id: 'sess123',
        token: 'fake-jwt',
        expires_at: new Date()
      });

      const result = await controller.createImpersonationSession(mockReq, { tenantId: 'tenant1', justification: 'Support' });
      expect(result.token).toEqual('fake-jwt');
      expect(service.createImpersonationSession).toHaveBeenCalledWith('admin1', 'tenant1', 'Support', []);
    });

    it('should revoke an impersonation session', async () => {
      const mockReq = { user: { id: 'admin1' } };
      mockSuperadminService.revokeImpersonationSession.mockResolvedValue({ success: true });

      const result = await controller.revokeImpersonationSession(mockReq, { sessionId: 'sess123' });
      expect(result.success).toBe(true);
    });

    it('should get current impersonation session', async () => {
      const mockReq = { user: { id: 'admin1' } };
      mockSuperadminService.getCurrentImpersonationSession.mockResolvedValue({ id: 'sess123', status: 'ACTIVE' });

      const result = await controller.getCurrentImpersonationSession(mockReq);
      expect(result).toEqual({ id: 'sess123', status: 'ACTIVE' });
    });
  });
});
