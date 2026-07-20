import { Injectable, ForbiddenException, Logger } from '@nestjs/common';

export type PaymentIntentStatus = 'created' | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded';

@Injectable()
export class PaymentIntentStateMachine {
  private readonly logger = new Logger(PaymentIntentStateMachine.name);

  private readonly allowedTransitions: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
    created: ['requires_action', 'processing', 'succeeded', 'failed', 'canceled'],
    requires_action: ['processing', 'succeeded', 'failed', 'canceled'],
    processing: ['succeeded', 'failed', 'canceled'],
    succeeded: ['refunded'],
    failed: [],
    canceled: [],
    refunded: [],
  };

  validateTransition(fromStatus: PaymentIntentStatus, toStatus: PaymentIntentStatus): boolean {
    if (fromStatus === toStatus) return true;

    const validTargets = this.allowedTransitions[fromStatus] || [];
    if (!validTargets.includes(toStatus)) {
      this.logger.error(`Transition illégale de PaymentIntent refusée: ${fromStatus} -> ${toStatus}`);
      throw new ForbiddenException(`Transition de PaymentIntent illégale: de '${fromStatus}' vers '${toStatus}'.`);
    }

    return true;
  }
}
