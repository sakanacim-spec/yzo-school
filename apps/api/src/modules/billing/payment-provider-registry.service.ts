import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';
import { IPaymentProvider, MockPaymentProvider } from '../../common/providers/payment.provider';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providersMap = new Map<string, IPaymentProvider>();

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
    private readonly mockProvider: MockPaymentProvider,
    private readonly stripeProvider: StripeProvider,
    private readonly paystackProvider: PaystackProvider,
  ) {
    this.registerProvider('mock', this.mockProvider);
    this.registerProvider('stripe', this.stripeProvider);
    this.registerProvider('paystack', this.paystackProvider);
  }

  registerProvider(code: string, provider: IPaymentProvider) {
    this.providersMap.set(code.toLowerCase(), provider);
    this.logger.log(`[PROVIDER REGISTRY] Fournisseur enregistré: ${code}`);
  }

  getProviderByCode(code: string): IPaymentProvider {
    const provider = this.providersMap.get(code.toLowerCase());
    if (!provider) {
      this.logger.warn(`Fournisseur ${code} inconnu, bascule sur MockPaymentProvider`);
      return this.mockProvider;
    }
    return provider;
  }

  async resolveBestProvider(currency: string, paymentMethod: string = 'card'): Promise<IPaymentProvider> {
    try {
      // Interroger les providers actifs et hors maintenance
      const { data: dbProviders } = await this.db
        .from('saas_payment_providers')
        .select('*')
        .eq('is_active', true)
        .eq('maintenance_mode', false)
        .order('priority', { ascending: true });

      if (dbProviders && dbProviders.length > 0) {
        for (const p of dbProviders) {
          const supportedCurrencies: string[] = p.supported_currencies || [];
          if (supportedCurrencies.includes(currency.toUpperCase())) {
            const resolved = this.providersMap.get(p.code.toLowerCase());
            if (resolved) {
              this.logger.log(`[PROVIDER REGISTRY] Provider résolu pour ${currency}/${paymentMethod}: ${p.code}`);
              return resolved;
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Erreur résolution provider DB: ${err.message}`);
    }

    // Fallback par défaut selon devise
    if (currency.toUpperCase() === 'XOF' || paymentMethod === 'momo') {
      return this.paystackProvider;
    }

    return this.stripeProvider;
  }
}
