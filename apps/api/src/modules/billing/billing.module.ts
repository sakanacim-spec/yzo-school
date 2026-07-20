import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { WebhooksController } from './webhooks.controller';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

import { InvoiceNumberGenerator } from './invoice-number.generator';
import { SubscriptionStateMachine } from './subscription-state-machine.service';
import { OutboxPollerService } from './outbox-poller.service';

import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [BillingController, WebhooksController],
  providers: [
    BillingService,
    StripeProvider,
    PaystackProvider,
    InvoiceNumberGenerator,
    SubscriptionStateMachine,
    OutboxPollerService,
    ReconciliationService,
  ],
  exports: [BillingService, InvoiceNumberGenerator, SubscriptionStateMachine, ReconciliationService],
})
export class BillingModule {}
