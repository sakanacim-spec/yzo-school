import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

import { SuperAdminBillingController } from './superadmin-billing.controller';
import { PrometheusMetricsController } from './prometheus-metrics.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [JwtModule.register({}), BillingModule],
  controllers: [SuperadminController, SuperAdminBillingController, PrometheusMetricsController],
  providers: [SuperadminService],
})
export class SuperAdminModule {}
