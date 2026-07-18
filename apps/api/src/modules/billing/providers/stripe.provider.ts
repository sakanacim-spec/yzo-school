import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentGateway, BillingPlan, WebhookEvent } from '../interfaces/payment-gateway.interface';

@Injectable()
export class StripeProvider implements PaymentGateway {
  private stripe: Stripe;
  private endpointSecret: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.endpointSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    
    // Fallback key pour ne pas crasher si non configuré en dev
    this.stripe = new Stripe(apiKey || 'sk_test_mock', {
      apiVersion: '2026-06-24.dahlia',
    });
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
        client_reference_id: tenantId, // Permet d'identifier le tenant lors du webhook
        metadata: {
          tenant_id: tenantId,
          plan_id: plan.id,
        }
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

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
      return true;
    } catch (error: any) {
      throw new InternalServerErrorException(`Erreur Stripe Cancel: ${error.message}`);
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<WebhookEvent> {
    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.endpointSecret);

      let status = '';
      let subscriptionId = '';
      let metadata: Record<string, string> = {};

      // Mapping simple des events
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        subscriptionId = session.subscription as string;
        metadata = session.metadata || {};
        return {
          type: 'subscription.created',
          gateway: 'stripe',
          subscriptionId,
          status: 'active',
          metadata,
        };
      }
      
      if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object as Stripe.Subscription;
        return {
          type: 'subscription.updated',
          gateway: 'stripe',
          subscriptionId: sub.id,
          status: sub.status, // ex: 'active', 'past_due'
          metadata: sub.metadata,
        };
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as Stripe.Subscription;
        return {
          type: 'subscription.deleted',
          gateway: 'stripe',
          subscriptionId: sub.id,
          status: 'canceled',
          metadata: sub.metadata,
        };
      }

      // Par défaut on retourne un format ignoré
      return {
        type: 'subscription.updated',
        gateway: 'stripe',
        subscriptionId: '',
        status: 'ignored',
        metadata: {}
      };
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }
}
