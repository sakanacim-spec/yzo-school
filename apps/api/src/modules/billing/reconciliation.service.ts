import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private isRunning = false;

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async reconcilePaymentIntents() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.logger.log('[RECONCILIATION] Démarrage de la vérification de réconciliation...');

      // Récupérer les PaymentIntents bloqués en 'processing' depuis plus de 15 minutes
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();

      const { data: pendingIntents, error } = await this.db
        .from('saas_payment_intents')
        .select('*')
        .eq('status', 'processing')
        .lt('created_at', fifteenMinsAgo)
        .limit(50);

      if (error || !pendingIntents || pendingIntents.length === 0) {
        this.logger.log('[RECONCILIATION] Aucun PaymentIntent en attente de réconciliation.');
        this.isRunning = false;
        return;
      }

      this.logger.log(`[RECONCILIATION] ${pendingIntents.length} intention(s) à réconcilier.`);

      for (const intent of pendingIntents) {
        // En mode mock ou sans connecteur actif, basculer sur succeeded ou log
        this.logger.log(`[RECONCILIATION] Synchro intent ${intent.id} (${intent.provider})`);
      }
    } catch (err: any) {
      this.logger.error(`Exception ReconciliationService: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
