import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';
import { SubscriptionStateMachine } from './subscription-state-machine.service';

@Injectable()
export class DunningEngineService {
  private readonly logger = new Logger(DunningEngineService.name);
  private isProcessing = false;

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
    private readonly stateMachine: SubscriptionStateMachine,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDunningCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this.logger.log('[DUNNING ENGINE] Démarrage du cycle de vérification et relance...');

      // 1. Détection des essais arrivés à expiration (trialing -> suspended)
      const nowIso = new Date().toISOString();
      const { data: expiredTrials } = await this.db
        .from('saas_subscriptions')
        .select('*')
        .eq('status', 'trialing')
        .lt('trial_ends_at', nowIso);

      if (expiredTrials && expiredTrials.length > 0) {
        for (const sub of expiredTrials) {
          this.stateMachine.validateTransition('trialing', 'suspended');
          await this.db
            .from('saas_subscriptions')
            .update({ status: 'suspended', updated_at: nowIso, version: sub.version + 1 })
            .eq('id', sub.id);

          this.logger.log(`[DUNNING ENGINE] Essai expiré -> Suspendu pour abonnement ${sub.id}`);
        }
      }

      // 2. Détection des abonnements en retard de paiement > 7 jours (past_due -> suspended)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: overdueSubs } = await this.db
        .from('saas_subscriptions')
        .select('*')
        .eq('status', 'past_due')
        .lt('updated_at', sevenDaysAgo);

      if (overdueSubs && overdueSubs.length > 0) {
        for (const sub of overdueSubs) {
          this.stateMachine.validateTransition('past_due', 'suspended');
          await this.db
            .from('saas_subscriptions')
            .update({ status: 'suspended', updated_at: nowIso, version: sub.version + 1 })
            .eq('id', sub.id);

          this.logger.log(`[DUNNING ENGINE] Past_due > 7j -> Suspendu pour abonnement ${sub.id}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Exception DunningEngineService: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
