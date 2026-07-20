import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { WebhooksController } from './webhooks.controller';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

import { InvoiceNumberGenerator } from './invoice-number.generator';

@Module({
  imports: [AuditLogsModule],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService, StripeProvider, PaystackProvider, InvoiceNumberGenerator],
  exports: [BillingService, InvoiceNumberGenerator],
})
export class BillingModule {}
