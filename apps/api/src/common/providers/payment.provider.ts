import { Injectable, Logger } from '@nestjs/common';

export interface SubscriptionParams {
  tenantId: string;
  planId: string;
  currency: string;
  paymentMethodToken?: string;
}

export interface ChargeParams {
  tenantId: string;
  amount: number;
  currency: string;
  description: string;
}

export interface IPaymentProvider {
  providerName: string;
  createSubscription(params: SubscriptionParams): Promise<{ subscriptionId: string; status: string }>;
  chargeOneTime(params: ChargeParams): Promise<{ transactionId: string; status: string }>;
  refund(transactionId: string): Promise<boolean>;
  handleWebhook(headers: Record<string, string>, body: unknown): Promise<{ eventType: string; processed: boolean }>;
}

@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  readonly providerName = 'MockPaymentProvider';
  private readonly logger = new Logger('PaymentProvider');

  async createSubscription(params: SubscriptionParams) {
    this.logger.log(`[PAYMENT] Subscription Created for Tenant ${params.tenantId} on plan ${params.planId}`);
    return { subscriptionId: `sub_mock_${Date.now()}`, status: 'active' };
  }

  async chargeOneTime(params: ChargeParams) {
    this.logger.log(`[PAYMENT] Charge ${params.amount} ${params.currency} for Tenant ${params.tenantId}`);
    return { transactionId: `tx_mock_${Date.now()}`, status: 'succeeded' };
  }

  async refund(transactionId: string) {
    this.logger.log(`[PAYMENT] Refund for transaction ${transactionId}`);
    return true;
  }

  async handleWebhook(headers: Record<string, string>, body: unknown) {
    this.logger.log(`[PAYMENT WEBHOOK] Received webhook event`);
    return { eventType: 'payment.succeeded', processed: true };
  }
}
