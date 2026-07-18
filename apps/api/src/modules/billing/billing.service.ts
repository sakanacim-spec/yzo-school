import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { PaymentGateway, BillingPlan, WebhookEvent } from './interfaces/payment-gateway.interface';

@Injectable()
export class BillingService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly stripe: StripeProvider,
    private readonly paystack: PaystackProvider,
  ) {}

  /**
   * Retourne le provider en fonction de la région/préférence
   */
  private getGatewayProvider(gateway: 'stripe' | 'paystack'): PaymentGateway {
    if (gateway === 'paystack') return this.paystack;
    return this.stripe;
  }

  /**
   * Lister les plans disponibles publiquement
   */
  async getAvailablePlans(): Promise<BillingPlan[]> {
    const { data, error } = await this.supabase.admin
      .from('saas_billing_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_amount', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return data as BillingPlan[];
  }

  /**
   * Créer une session de paiement pour un locataire
   */
  async createCheckoutSession(tenantId: string, planId: string, gateway: 'stripe' | 'paystack', successUrl: string, cancelUrl: string) {
    const { data: plan, error } = await this.supabase.admin
      .from('saas_billing_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error || !plan) throw new NotFoundException('Plan introuvable');

    const provider = this.getGatewayProvider(gateway);
    const sessionUrl = await provider.createCheckoutSession(tenantId, plan, successUrl, cancelUrl);

    this.auditLogs.log({
      tenantId,
      action: 'billing.checkout_started',
      severity: 'INFO',
      entityType: 'billing_plan',
      entityId: planId,
      metadata: { gateway }
    });

    return { url: sessionUrl };
  }

  /**
   * Réagir à un paiement réussi ou à un changement d'abonnement (Appelé par le Webhook)
   * C'EST ICI QUE LA MAGIE ASYNCHRONE OPÈRE.
   */
  async handleSubscriptionUpdated(tenantId: string, planId: string, subscriptionId: string, gateway: string, status: string) {
    const client = this.supabase.admin;

    // 1. Récupération du Plan pour avoir les modules et les quotas
    const { data: plan, error: planError } = await client
      .from('saas_billing_plans')
      .select('id, modules, quotas')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      console.error(`[Webhook] Plan ${planId} introuvable.`);
      return;
    }

    // 2. Mise à jour de saas_subscriptions
    const { error: subError } = await client
      .from('saas_subscriptions')
      .upsert({
        tenant_id: tenantId,
        plan_id: planId,
        gateway: gateway,
        gateway_subscription_id: subscriptionId,
        status: status,
      }, { onConflict: 'tenant_id' });

    if (subError) {
      console.error(`[Webhook] Erreur update abonnement :`, subError.message);
      throw subError;
    }

    // 3. LA SYNCHRONISATION MAGIQUE : On pousse Modules et Quotas dans le locataire
    // Le ModuleGuard pourra lire ça instanément depuis la table ou son cache !
    if (status === 'active' || status === 'trialing') {
      const { error: tenantError } = await client
        .from('saas_tenants')
        .update({
          settings: {
            plan_id: planId,
            modules: plan.modules || [],
            quotas: plan.quotas || {},
          }
        })
        .eq('id', tenantId);
      
      if (tenantError) {
        console.error(`[Webhook] Erreur synchro tenant settings :`, tenantError.message);
      }
    }

    // 4. Log
    this.auditLogs.log({
      tenantId,
      action: 'billing.subscription_updated',
      severity: status === 'active' ? 'INFO' : 'WARNING',
      entityType: 'subscription',
      entityId: subscriptionId,
      metadata: { plan_id: planId, status, gateway }
    });
  }

  /**
   * Gestion générique des webhooks par fournisseur
   */
  async processWebhook(gateway: 'stripe' | 'paystack', payload: any, signature: string) {
    const provider = this.getGatewayProvider(gateway);
    const event: WebhookEvent = await provider.handleWebhook(payload, signature);

    if (event.status === 'ignored') return { received: true };

    const tenantId = event.metadata?.tenant_id;
    const planId = event.metadata?.plan_id;

    if (!tenantId || !planId) {
      console.warn(`[Webhook ${gateway}] Evénement reçu sans tenant_id ou plan_id. On ignore.`);
      return { received: true };
    }

    await this.handleSubscriptionUpdated(tenantId, planId, event.subscriptionId, event.gateway, event.status);

    return { received: true, handled: true, type: event.type };
  }
}
