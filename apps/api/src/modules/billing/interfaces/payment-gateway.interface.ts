export interface BillingPlan {
  id: string;
  name: string;
  price_amount: number;
  currency: string;
  interval: 'month' | 'year' | 'one_time';
  stripe_price_id?: string;
  paystack_plan_code?: string;
}

export interface WebhookEvent {
  type: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'payment.failed';
  gateway: 'stripe' | 'paystack';
  subscriptionId: string;
  status: string; // ex: 'active', 'canceled', 'past_due'
  metadata: Record<string, string>;
}

export interface PaymentGateway {
  /**
   * Crée une session de checkout et retourne l'URL
   */
  createCheckoutSession(tenantId: string, plan: BillingPlan, successUrl: string, cancelUrl: string): Promise<string>;
  
  /**
   * Récupère le portail de facturation client
   */
  createBillingPortal(customerId: string, returnUrl: string): Promise<string>;
  
  /**
   * Annule un abonnement
   */
  cancelSubscription(subscriptionId: string): Promise<boolean>;
  
  /**
   * Parse et valide la signature d'un webhook entrant
   */
  handleWebhook(payload: any, signature: string): Promise<WebhookEvent>;
}
