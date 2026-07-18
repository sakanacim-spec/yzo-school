import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import * as crypto from 'crypto';

export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'SECURITY';

export interface AuditLogDto {
  tenantId: string;
  action: string;
  severity?: AuditSeverity;
  actorId?: string;
  apiKeyId?: string;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Enregistre un événement d'audit de manière asynchrone (fire-and-forget).
   * L'erreur est catchée et logguée localement pour ne pas bloquer le thread principal.
   */
  async log(dto: AuditLogDto): Promise<void> {
    try {
      // Nettoyage des undefined pour éviter des soucis avec Supabase
      const payload = {
        tenant_id: dto.tenantId,
        action: dto.action,
        severity: dto.severity || 'INFO',
        actor_id: dto.actorId || null,
        api_key_id: dto.apiKeyId || null,
        entity_type: dto.entityType || null,
        entity_id: dto.entityId || null,
        correlation_id: dto.correlationId || null,
        metadata: dto.metadata || {},
      };

      // On utilise admin (Service Role) pour écrire afin de ne pas être bloqué par RLS 
      // ou par l'absence de JWT valide si l'action vient d'une API Key M2M.
      const { error } = await this.supabase.admin
        .from('saas_audit_logs')
        .insert(payload);

      if (error) {
        throw error;
      }
    } catch (error: any) {
      // L'erreur est juste tracée dans les logs serveur pour ne pas casser le flux utilisateur
      this.logger.error(`Failed to insert audit log for action ${dto.action}: ${error.message}`);
    }
  }

  /**
   * Récupère les logs d'un tenant (avec pagination).
   * Peut être appelé par le contrôleur public via SDK.
   */
  async getLogs(tenantId: string, limit: number = 50, offset: number = 0) {
    const { data, error, count } = await this.supabase.admin
      .from('saas_audit_logs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Erreur récupération audit logs: ${error.message}`);
    }

    return { data, count };
  }

  /**
   * Génère un nouveau correlationId pour un groupe d'actions.
   */
  generateCorrelationId(): string {
    return crypto.randomUUID();
  }
}
