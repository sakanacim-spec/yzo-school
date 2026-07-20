import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrometheusMetricsService } from '../billing/prometheus-metrics.service';

@ApiTags('SuperAdmin Prometheus Metrics')
@Controller('v1/superadmin/metrics')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('SAAS_SUPER_ADMIN')
@ApiBearerAuth()
export class PrometheusMetricsController {
  constructor(private readonly prometheusMetricsService: PrometheusMetricsService) {}

  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Exporte les métriques d\'exploitation au format Prometheus OpenMetrics' })
  @ApiResponse({ status: 200, description: 'Métriques Prometheus exportées avec succès.' })
  async getPrometheusMetrics(): Promise<string> {
    return this.prometheusMetricsService.getPrometheusOpenMetrics();
  }
}
