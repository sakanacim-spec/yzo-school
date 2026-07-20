import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingMetricsService, BillingMetricsResult } from '../billing/billing-metrics.service';

@ApiTags('SuperAdmin Billing Metrics')
@Controller('v1/superadmin/billing')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('SAAS_SUPER_ADMIN')
@ApiBearerAuth()
export class SuperAdminBillingController {
  constructor(private readonly billingMetricsService: BillingMetricsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Récupère les métriques d\'exploitation du Billing Engine (MRR, Outbox, DLQ, Taux de succès)' })
  @ApiResponse({ status: 200, description: 'Métriques d\'exploitation retournées avec succès.' })
  async getMetrics(): Promise<BillingMetricsResult> {
    return this.billingMetricsService.getPlatformBillingMetrics();
  }
}
