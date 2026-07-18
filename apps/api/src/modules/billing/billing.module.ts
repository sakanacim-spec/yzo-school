import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { WebhooksController } from './webhooks.controller';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService, StripeProvider, PaystackProvider],
  exports: [BillingService],
})
export class BillingModule {}
