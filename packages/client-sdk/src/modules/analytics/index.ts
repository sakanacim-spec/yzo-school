import { OziowHttpClient } from '../../client';

export interface DashboardOverview {
  activeUsers: number;
  aiRequests: number;
  aiTokens: number;
  apiErrors: number;
}

export interface DashboardQuotas {
  maxUsers: number | null;
  maxAiTokens: number | null;
  usersUsagePercent: number;
  tokensUsagePercent: number;
}

export interface DashboardSummary {
  overview: DashboardOverview;
  quotas: DashboardQuotas;
  timeseries: any[];
}

export class AnalyticsModule {
  private basePath = '/v1/analytics';

  constructor(private client: OziowHttpClient) {}

  /**
   * Récupère le tableau de bord Analytics du locataire
   * @param days Nombre de jours d'historique (défaut: 30)
   */
  async getDashboardSummary(days: number = 30): Promise<DashboardSummary> {
    return this.client.get<DashboardSummary>(`${this.basePath}/dashboard`, { params: { days } });
  }
}
