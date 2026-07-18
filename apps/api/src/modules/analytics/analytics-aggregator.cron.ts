import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../common/supabase/supabase.service';

@Injectable()
export class AnalyticsAggregatorCron {
  private readonly logger = new Logger(AnalyticsAggregatorCron.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Rafraîchit les vues matérialisées de manière asynchrone toutes les heures.
   * On utilise CONCURRENTLY pour ne pas bloquer les lectures du Dashboard.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshMaterializedViews() {
    this.logger.debug('Début du rafraîchissement des vues matérialisées Analytics...');
    
    // Le client Admin (Service Role) est nécessaire pour invoquer le rafraîchissement
    const { error } = await this.supabase.admin.rpc('refresh_analytics_daily_tenant_view');

    if (error) {
      this.logger.error(`Erreur lors du rafraîchissement des vues: ${error.message}`);
      
      // Fallback SQL brut si l'appel RPC n'est pas créé
      // Normalement on utilise un execute() brut ou rpc() sur Supabase
      // Pour éviter des problèmes, nous allons ajouter un rpc dans la migration
    } else {
      this.logger.debug('Vues matérialisées rafraîchies avec succès.');
    }
  }
}
