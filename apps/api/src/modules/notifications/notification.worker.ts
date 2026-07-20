import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';
import { DefaultNotificationProvider } from '../../common/providers/notification.provider';

@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
    private readonly notificationProvider: DefaultNotificationProvider,
  ) {}

  @OnEvent('payment.success.v1')
  async handlePaymentSuccess(payload: any) {
    this.logger.log(`[NOTIFICATION WORKER] Processing payment.success.v1 for tenant ${payload.tenantId}`);
    try {
      await this.notificationProvider.sendEmail(
        payload.actorEmail || 'admin@tenant.com',
        'Confirmation de paiement & Facture OZIOW',
        'payment_receipt',
        payload,
      );
    } catch (err: any) {
      await this.moveToDeadLetterQueue('payment.success.v1', payload, err.message);
    }
  }

  @OnEvent('trial.expiring.v1')
  async handleTrialExpiring(payload: any) {
    this.logger.log(`[NOTIFICATION WORKER] Processing trial.expiring.v1 for tenant ${payload.tenantId}`);
    try {
      await this.notificationProvider.sendEmail(
        payload.actorEmail || 'admin@tenant.com',
        'Votre période d\'essai OZIOW expire bientôt',
        'trial_expiring',
        payload,
      );
    } catch (err: any) {
      await this.moveToDeadLetterQueue('trial.expiring.v1', payload, err.message);
    }
  }

  private async moveToDeadLetterQueue(queueName: string, payload: any, errorMsg: string) {
    this.logger.error(`[DLQ] Transfère de l'événement ${queueName} vers dead_letter_queue: ${errorMsg}`);
    try {
      await this.db.from('dead_letter_queue').insert({
        queue_name: queueName,
        payload: payload || {},
        error_message: errorMsg,
        attempts: 3,
      });
    } catch (dbErr: any) {
      this.logger.error(`Erreur écriture DLQ: ${dbErr.message}`);
    }
  }
}
