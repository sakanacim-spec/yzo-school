import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

export interface BillingMetricsResult {
  mrrEurMinor: number;
  mrrXofMinor: number;
  activeSubscriptionsCount: number;
  outboxPendingCount: number;
  dlqCount: number;
  webhookSuccessRate24h: number;
  timestamp: string;
}

@Injectable()
export class BillingMetricsService {
  private readonly logger = new Logger(BillingMetricsService.name);

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  async getPlatformBillingMetrics(): Promise<BillingMetricsResult> {
    try {
      // 1. Abonnements actifs
      const { count: activeSubsCount } = await this.db
        .from('saas_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // 2. Queue Outbox en attente
      const { count: outboxPending } = await this.db
        .from('saas_outbox_events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 3. Dead Letter Queue count
      const { count: dlq } = await this.db
        .from('dead_letter_queue')
        .select('id', { count: 'exact', head: true });

      // 4. Calcul du MRR (Montants mensuels cumulés)
      const { data: activePrices } = await this.db
        .from('saas_subscriptions')
        .select('plan_id, saas_plans!inner(saas_plan_prices(currency, amount_minor_monthly))')
        .eq('status', 'active');

      let mrrEur = 0;
      let mrrXof = 0;

      if (activePrices) {
        for (const sub of activePrices as any[]) {
          const prices = sub.saas_plans?.saas_plan_prices || [];
          for (const price of prices) {
            if (price.currency === 'EUR') mrrEur += Number(price.amount_minor_monthly || 0);
            if (price.currency === 'XOF') mrrXof += Number(price.amount_minor_monthly || 0);
          }
        }
      }

      // 5. Taux de succès Webhooks sur 24h
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
      const { count: totalHooks } = await this.db
        .from('saas_webhook_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo);

      const { count: successHooks } = await this.db
        .from('saas_webhook_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo)
        .eq('status', 'processed');

      const successRate = totalHooks && totalHooks > 0 ? (successHooks || 0) / totalHooks : 1.0;

      return {
        mrrEurMinor: mrrEur,
        mrrXofMinor: mrrXof,
        activeSubscriptionsCount: activeSubsCount || 0,
        outboxPendingCount: outboxPending || 0,
        dlqCount: dlq || 0,
        webhookSuccessRate24h: Math.round(successRate * 1000) / 10,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Erreur calcul métriques billing: ${err.message}`);
      return {
        mrrEurMinor: 0,
        mrrXofMinor: 0,
        activeSubscriptionsCount: 0,
        outboxPendingCount: 0,
        dlqCount: 0,
        webhookSuccessRate24h: 100,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
