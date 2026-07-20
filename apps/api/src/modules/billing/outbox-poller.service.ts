import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);
  private isProcessing = false;

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Dépilage des événements en attente
      const { data: events, error } = await this.db
        .from('saas_outbox_events')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error || !events || events.length === 0) {
        this.isProcessing = false;
        return;
      }

      for (const evt of events) {
        try {
          // Émission sur le bus d'événements interne
          this.eventEmitter.emit(evt.event_name, {
            ...evt.payload,
            correlationId: evt.correlation_id,
            causationId: evt.causation_id,
            eventVersion: evt.event_version,
          });

          // Marquer comme publié
          await this.db
            .from('saas_outbox_events')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
              attempts: evt.attempts + 1,
            })
            .eq('id', evt.id);

          this.logger.log(`[OUTBOX POLLER] Publié: ${evt.event_name} (${evt.id})`);
        } catch (pollErr: any) {
          const nextAttempts = evt.attempts + 1;
          // Exponential backoff (1m, 5m, 30m, 2h, 12h)
          const backoffMinutes = [1, 5, 30, 120, 720][Math.min(nextAttempts - 1, 4)];
          const nextRetry = new Date(Date.now() + backoffMinutes * 60000).toISOString();

          await this.db
            .from('saas_outbox_events')
            .update({
              status: nextAttempts >= 5 ? 'failed' : 'pending',
              attempts: nextAttempts,
              next_retry_at: nextRetry,
            })
            .eq('id', evt.id);

          this.logger.error(`[OUTBOX POLLER] Échec event ${evt.id}: ${pollErr.message}. Next retry at ${nextRetry}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Exception OutboxPollerService: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
