import { OziowHttpClient } from '../client';

export interface AuditLog {
  id: string;
  tenant_id: string;
  actor_id?: string;
  api_key_id?: string;
  action: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SECURITY';
  correlation_id?: string;
  entity_type?: string;
  entity_id?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ListAuditLogsResponse {
  data: AuditLog[];
  count: number;
}

export class AuditLogsModule {
  constructor(private client: OziowHttpClient) {}

  /**
   * Récupère l'historique des logs d'audit
   * @param limit Nombre de résultats max (défaut: 50)
   * @param offset Décalage pour la pagination (défaut: 0)
   */
  async list(limit: number = 50, offset: number = 0): Promise<ListAuditLogsResponse> {
    return this.client.get<ListAuditLogsResponse>('/v1/audit-logs', {
      params: { limit, offset }
    });
  }
}
