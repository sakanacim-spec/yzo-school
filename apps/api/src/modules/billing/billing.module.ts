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

import { MockPaymentProvider } from '../../common/providers/payment.provider';
import { PaymentIntentStateMachine } from './payment-intent-state-machine.service';
import { PaymentProviderRegistry } from './payment-provider-registry.service';

import { DunningEngineService } from './dunning-engine.service';
import { BillingMetricsService } from './billing-metrics.service';
import { PrometheusMetricsService } from './prometheus-metrics.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [BillingController, WebhooksController],
  providers: [
    BillingService,
    MockPaymentProvider,
    StripeProvider,
    PaystackProvider,
    InvoiceNumberGenerator,
    SubscriptionStateMachine,
    PaymentIntentStateMachine,
    PaymentProviderRegistry,
    OutboxPollerService,
    ReconciliationService,
    DunningEngineService,
    BillingMetricsService,
    PrometheusMetricsService,
  ],
  exports: [
    BillingService,
    InvoiceNumberGenerator,
    SubscriptionStateMachine,
    PaymentIntentStateMachine,
    PaymentProviderRegistry,
    ReconciliationService,
    DunningEngineService,
    BillingMetricsService,
    PrometheusMetricsService,
  ],
})
export class BillingModule {}
