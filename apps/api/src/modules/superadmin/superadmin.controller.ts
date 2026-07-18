import { Controller, Get, Post, UseGuards, Request, Body, UseInterceptors } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { NoCacheInterceptor } from '../../common/interceptors/no-cache.interceptor';

@Controller('superadmin')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@UseInterceptors(NoCacheInterceptor)
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Get('kpis/global')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_FINANCE', 'PLATFORM_SUPPORT')
  getGlobalKpis() {
    return this.superadminService.getGlobalKpis();
  }

  @Get('kpis/financial')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_FINANCE')
  getFinancialKpis() {
    return this.superadminService.getFinancialKpis();
  }

  @Get('kpis/usage')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_SUPPORT')
  getUsageKpis() {
    return this.superadminService.getUsageKpis();
  }

  @Post('kpis/refresh')
  @PlatformRoles('PLATFORM_OWNER')
  refreshKpis() {
    return this.superadminService.refreshKpis();
  }

  @Post('impersonate')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_SUPPORT')
  createImpersonationSession(@Request() req: any, @Body() body: { tenantId: string; justification: string }) {
    const actorId = req.user.id;
    const platformRoles = req.user.platform_roles || [];
    return this.superadminService.createImpersonationSession(actorId, body.tenantId, body.justification, platformRoles);
  }

  @Post('impersonate/revoke')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_SUPPORT')
  revokeImpersonationSession(@Request() req: any, @Body() body: { sessionId: string }) {
    const actorId = req.user.id;
    return this.superadminService.revokeImpersonationSession(body.sessionId, actorId);
  }

  @Get('impersonate/current')
  @PlatformRoles('PLATFORM_OWNER', 'PLATFORM_SUPPORT')
  getCurrentImpersonationSession(@Request() req: any) {
    const actorId = req.user.id;
    return this.superadminService.getCurrentImpersonationSession(actorId);
  }
}
