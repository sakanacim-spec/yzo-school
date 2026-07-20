import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentGateway, BillingPlan, WebhookEvent } from '../interfaces/payment-gateway.interface';
import { IPaymentProvider, SubscriptionParams, ChargeParams } from '../../../common/providers/payment.provider';

@Injectable()
export class StripeProvider implements PaymentGateway, IPaymentProvider {
  readonly providerName = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe;
  private endpointSecret: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.endpointSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';

    this.stripe = new Stripe(apiKey || 'sk_test_mock', {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  async createSubscription(params: SubscriptionParams): Promise<{ subscriptionId: string; status: string }> {
    this.logger.log(`[STRIPE] Creating subscription for tenant ${params.tenantId} on plan ${params.planId}`);
    return { subscriptionId: `sub_stripe_${Date.now()}`, status: 'active' };
  }

  async chargeOneTime(params: ChargeParams): Promise<{ transactionId: string; status: string }> {
    this.logger.log(`[STRIPE] Charging ${params.amount} ${params.currency} for tenant ${params.tenantId}`);
    return { transactionId: `ch_stripe_${Date.now()}`, status: 'succeeded' };
  }

  async refund(transactionId: string): Promise<boolean> {
    this.logger.log(`[STRIPE] Refunding transaction ${transactionId}`);
    return true;
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    this.logger.log(`[STRIPE] Canceling subscription ${subscriptionId}`);
    return true;
  }

  async handleWebhook(headers: Record<string, string>, body: unknown): Promise<{ eventType: string; processed: boolean }>;
  async handleWebhook(payload: any, signature: string): Promise<WebhookEvent>;
  async handleWebhook(arg1: any, arg2: any): Promise<any> {
    if (typeof arg2 === 'string') {
      return {
        type: 'subscription.created',
        gateway: 'stripe',
        subscriptionId: 'sub_mock',
        status: 'active',
        metadata: {},
      };
    }
    this.logger.log('[STRIPE WEBHOOK] Received webhook event');
    return { eventType: 'checkout.session.completed', processed: true };
  }

  async createCheckoutSession(tenantId: string, plan: BillingPlan, successUrl: string, cancelUrl: string): Promise<string> {
    if (!plan.stripe_price_id) {
      throw new BadRequestException('Ce plan n\'a pas d\'identifiant Stripe valide.');
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripe_price_id,
            quantity: 1,
          },
        ],
        mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: tenantId,
        metadata: {
          tenant_id: tenantId,
          plan_id: plan.id,
        },
      });

      return session.url as string;
    } catch (error: any) {
      throw new InternalServerErrorException(`Erreur Stripe Checkout: ${error.message}`);
    }
  }

  async createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
    try {
      const portalSession = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return portalSession.url;
    } catch (error: any) {
      throw new InternalServerErrorException(`Erreur Stripe Portal: ${error.message}`);
    }
  }

  constructEventFromPayload(signature: string, payload: Buffer): WebhookEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.endpointSecret);
      return {
        type: 'subscription.created',
        gateway: 'stripe',
        subscriptionId: event.id,
        status: 'active',
        metadata: {},
      };
    } catch (error: any) {
      throw new BadRequestException(`Erreur Signature Webhook Stripe: ${error.message}`);
    }
  }
}
