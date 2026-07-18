import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Analytics')
@Controller({ path: 'analytics', version: '1' })
@ApiBearerAuth('JWT')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Récupérer le tableau de bord Analytics du locataire' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Période en jours (défaut: 30)' })
  async getDashboard(
    @TenantId() tenantId: string,
    @Query('days') days?: number
  ) {
    if (!tenantId) throw new UnauthorizedException('Tenant ID manquant');
    
    // Par défaut 30 jours, max 365 pour éviter les requêtes trop larges
    const period = days ? Math.min(Math.max(days, 1), 365) : 30;
    
    return this.analyticsService.getTenantDashboardSummary(tenantId, period);
  }
}
