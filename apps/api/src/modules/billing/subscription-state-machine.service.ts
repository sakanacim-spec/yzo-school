import { Injectable, ForbiddenException, Logger } from '@nestjs/common';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';

@Injectable()
export class SubscriptionStateMachine {
  private readonly logger = new Logger(SubscriptionStateMachine.name);

  private readonly allowedTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    trialing: ['active', 'suspended', 'canceled'],
    active: ['past_due', 'suspended', 'canceled'],
    past_due: ['active', 'suspended', 'canceled'],
    suspended: ['active', 'canceled'],
    canceled: [], // Statut terminal immuable
  };

  validateTransition(fromStatus: SubscriptionStatus, toStatus: SubscriptionStatus): boolean {
    if (fromStatus === toStatus) {
      return true; // Auto-transition neutre
    }

    const validTargets = this.allowedTransitions[fromStatus] || [];
    if (!validTargets.includes(toStatus)) {
      this.logger.error(`Transition illégale d'abonnement refusée: ${fromStatus} -> ${toStatus}`);
      throw new ForbiddenException(`Transition de statut d'abonnement illégale: de '${fromStatus}' vers '${toStatus}'.`);
    }

    return true;
  }
}
