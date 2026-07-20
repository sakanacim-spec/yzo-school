import { Injectable, InternalServerErrorException, BadRequestException, NotImplementedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, BillingPlan, WebhookEvent } from '../interfaces/payment-gateway.interface';
import { IPaymentProvider, SubscriptionParams, ChargeParams } from '../../../common/providers/payment.provider';
import * as crypto from 'crypto';

@Injectable()
export class PaystackProvider implements PaymentGateway, IPaymentProvider {
  readonly providerName = 'paystack';
  private readonly logger = new Logger(PaystackProvider.name);
  private secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY') || 'mock';
  }

  async createSubscription(params: SubscriptionParams): Promise<{ subscriptionId: string; status: string }> {
    this.logger.log(`[PAYSTACK] Creating subscription for tenant ${params.tenantId} on plan ${params.planId}`);
    return { subscriptionId: `sub_paystack_${Date.now()}`, status: 'active' };
  }

  async chargeOneTime(params: ChargeParams): Promise<{ transactionId: string; status: string }> {
    this.logger.log(`[PAYSTACK] Charging ${params.amount} ${params.currency} for tenant ${params.tenantId} (Mobile Money / Card)`);
    return { transactionId: `tx_paystack_${Date.now()}`, status: 'succeeded' };
  }

  async refund(transactionId: string): Promise<boolean> {
    this.logger.log(`[PAYSTACK] Refunding transaction ${transactionId}`);
    return true;
  }

  async handleWebhook(headers: Record<string, string>, body: unknown): Promise<{ eventType: string; processed: boolean }>;
  async handleWebhook(payload: any, signature: string): Promise<WebhookEvent>;
  async handleWebhook(arg1: any, arg2: any): Promise<any> {
    if (typeof arg2 === 'string') {
      const payload = arg1;
      const signature = arg2;
      const hash = crypto.createHmac('sha512', this.secretKey).update(JSON.stringify(payload)).digest('hex');
      if (hash !== signature && process.env.NODE_ENV === 'production') {
        throw new BadRequestException('Signature Paystack invalide');
      }
      return {
        type: 'subscription.created',
        gateway: 'paystack',
        subscriptionId: payload?.data?.subscription_code || 'sub_mock',
        tenantId: payload?.data?.metadata?.tenant_id || '',
        data: payload?.data || {},
      };
    }
    this.logger.log('[PAYSTACK WEBHOOK] Received webhook event');
    return { eventType: 'charge.success', processed: true };
  }

  async createCheckoutSession(tenantId: string, plan: BillingPlan, successUrl: string, cancelUrl: string): Promise<string> {
    if (!plan.paystack_plan_code) {
      throw new BadRequestException('Ce plan n\'a pas de code Paystack valide.');
    }
    return `https://checkout.paystack.com/mock_transaction?tenant=${tenantId}&plan=${plan.id}`;
  }

  async createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
    throw new NotImplementedException('Le portail de facturation Paystack n\'est pas supporté pour le moment.');
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    return true;
  }
}
