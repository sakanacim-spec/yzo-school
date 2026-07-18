import { Injectable, InternalServerErrorException, BadRequestException, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, BillingPlan, WebhookEvent } from '../interfaces/payment-gateway.interface';
import * as crypto from 'crypto';

@Injectable()
export class PaystackProvider implements PaymentGateway {
  private secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY') || 'mock';
  }

  async createCheckoutSession(tenantId: string, plan: BillingPlan, successUrl: string, cancelUrl: string): Promise<string> {
    if (!plan.paystack_plan_code) {
      throw new BadRequestException('Ce plan n\'a pas de code Paystack valide.');
    }

    // Dans une implémentation réelle, on utiliserait axios ou un SDK HTTP pour appeler l'API Paystack :
    // POST https://api.paystack.co/transaction/initialize
    // Avec le tenantId dans metadata.
    
    // Pour l'itération 1 (MVP orienté Stripe), on retourne une URL fictive
    return `https://checkout.paystack.com/mock_transaction?tenant=${tenantId}&plan=${plan.id}`;
  }

  async createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
    // Paystack ne propose pas de portail "clef en main" comme Stripe.
    // L'implémentation nécessitera de construire une interface React personnalisée gérant les appels API.
    throw new NotImplementedException('Le portail de facturation Paystack n\'est pas supporté pour le moment.');
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    // Appel à l'API : POST https://api.paystack.co/subscription/disable
    return true;
  }

  async handleWebhook(payload: any, signature: string): Promise<WebhookEvent> {
    try {
      // 1. Vérification de la signature cryptographique Paystack
      const hash = crypto.createHmac('sha512', this.secretKey)
                         .update(JSON.stringify(payload))
                         .digest('hex');
      
      if (hash !== signature) {
        throw new BadRequestException('Signature Paystack invalide');
      }

      const event = payload.event;
      const data = payload.data;

      let status = '';
      let subscriptionId = '';
      let metadata: Record<string, string> = {};

      if (event === 'subscription.create') {
        return {
          type: 'subscription.created',
          gateway: 'paystack',
          subscriptionId: data.subscription_code,
          status: data.status,
          metadata: data.metadata || {},
        };
      }

      if (event === 'charge.success') {
        // Renouvellement ou premier paiement
        return {
          type: 'subscription.updated',
          gateway: 'paystack',
          subscriptionId: data.subscription_code || data.reference,
          status: 'active',
          metadata: data.metadata || {},
        };
      }

      if (event === 'subscription.disable') {
        return {
          type: 'subscription.deleted',
          gateway: 'paystack',
          subscriptionId: data.subscription_code,
          status: 'canceled',
          metadata: data.metadata || {},
        };
      }

      return {
        type: 'subscription.updated',
        gateway: 'paystack',
        subscriptionId: '',
        status: 'ignored',
        metadata: {}
      };
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }
}
