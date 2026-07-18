import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

export interface DashboardSummary {
  overview: {
    activeUsers: number;
    aiRequests: number;
    aiTokens: number;
    apiErrors: number;
  };
  quotas: {
    maxUsers: number | null;
    maxAiTokens: number | null;
    usersUsagePercent: number;
    tokensUsagePercent: number;
  };
  timeseries: any[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Récupère le résumé analytique d'un locataire.
   * L'interrogation se fait EXCLUSIVEMENT sur la vue matérialisée pour garantir un impact nul sur le transactionnel.
   */
  async getTenantDashboardSummary(tenantId: string, days: number = 30): Promise<DashboardSummary> {
    const client = this.supabase.admin;
    
    // 1. Récupérer les données de la vue matérialisée sur la période
    const { data: timeseries, error: mvError } = await client
      .from('saas_analytics_daily_tenant')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('date', { ascending: true });

    if (mvError) {
      throw new InternalServerErrorException(`Erreur Analytics: ${mvError.message}`);
    }

    // 2. Calculer les totaux (Overview)
    let activeUsers = 0;
    let aiRequests = 0;
    let aiTokens = 0;
    let apiErrors = 0;

    if (timeseries && timeseries.length > 0) {
      for (const row of timeseries) {
        // Pour les active users sur 30 jours, on additionne les max journaliers 
        // ou on pourrait compter différemment. Ici on additionne pour simplifier le MVP.
        activeUsers += Number(row.active_users_count || 0);
        aiRequests += Number(row.ai_requests_count || 0);
        aiTokens += Number(row.ai_tokens_used || 0);
        apiErrors += Number(row.api_errors_count || 0);
      }
    }

    // 3. Récupérer les Quotas actuels du tenant pour les barres de progression
    const { data: tenantData } = await client
      .from('saas_tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const quotas = tenantData?.settings?.quotas || {};
    const maxUsers = quotas.max_users || null;
    const maxTokens = quotas.max_ai_tokens || null;

    const usersUsagePercent = maxUsers ? Math.min(Math.round((activeUsers / maxUsers) * 100), 100) : 0;
    const tokensUsagePercent = maxTokens ? Math.min(Math.round((aiTokens / maxTokens) * 100), 100) : 0;

    return {
      overview: {
        activeUsers,
        aiRequests,
        aiTokens,
        apiErrors
      },
      quotas: {
        maxUsers,
        maxAiTokens: maxTokens,
        usersUsagePercent,
        tokensUsagePercent
      },
      timeseries: timeseries || []
    };
  }
}
