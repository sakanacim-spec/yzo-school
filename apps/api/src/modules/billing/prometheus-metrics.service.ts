import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

@Injectable()
export class PrometheusMetricsService {
  private readonly logger = new Logger(PrometheusMetricsService.name);

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  async getPrometheusOpenMetrics(): Promise<string> {
    try {
      const { count: activeSubs } = await this.db.from('saas_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active');
      const { count: outboxPending } = await this.db.from('saas_outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: dlqCount } = await this.db.from('dead_letter_queue').select('id', { count: 'exact', head: true });
      const { count: totalTx } = await this.db.from('saas_billing_transactions').select('id', { count: 'exact', head: true });
      const { count: successTx } = await this.db.from('saas_billing_transactions').select('id', { count: 'exact', head: true }).eq('transaction_type', 'PAYMENT_CAPTURED');

      const lines = [
        '# HELP billing_active_subscriptions_gauge Nombre d\'abonnements actifs',
        '# TYPE billing_active_subscriptions_gauge gauge',
        `billing_active_subscriptions_gauge ${activeSubs || 0}`,
        '',
        '# HELP billing_outbox_pending_gauge Nombre d\'événements Outbox en attente',
        '# TYPE billing_outbox_pending_gauge gauge',
        `billing_outbox_pending_gauge ${outboxPending || 0}`,
        '',
        '# HELP billing_dlq_total_gauge Nombre d\'événements bloqués dans la DLQ',
        '# TYPE billing_dlq_total_gauge gauge',
        `billing_dlq_total_gauge ${dlqCount || 0}`,
        '',
        '# HELP billing_payment_captured_total Nombre total de paiements capturés',
        '# TYPE billing_payment_captured_total counter',
        `billing_payment_captured_total ${successTx || 0}`,
        '',
        '# HELP billing_transactions_total Nombre total de transactions financières',
        '# TYPE billing_transactions_total counter',
        `billing_transactions_total ${totalTx || 0}`,
        '',
      ];

      return lines.join('\n');
    } catch (err: any) {
      this.logger.error(`Erreur génération métriques Prometheus: ${err.message}`);
      return '# HELP billing_error Erreur lors de la génération des métriques\nbilling_error 1\n';
    }
  }
}
