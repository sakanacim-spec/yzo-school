import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';

export interface AuditLogEntry {
  tenantId?: string;
  userId?: string;
  actorEmail?: string;
  eventType: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  async logEvent(entry: AuditLogEntry) {
    try {
      const { error } = await this.db.from('saas_audit_logs').insert({
        tenant_id: entry.tenantId || null,
        user_id: entry.userId || null,
        actor_email: entry.actorEmail || null,
        event_type: entry.eventType,
        payload: entry.payload || {},
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
      });

      if (error) {
        this.logger.error(`Erreur écriture saas_audit_logs: ${error.message}`);
      } else {
        this.logger.log(`[AUDIT LOG] ${entry.eventType} pour tenant ${entry.tenantId || 'global'}`);
      }
    } catch (err: any) {
      this.logger.error(`Exception AuditLogService: ${err.message}`);
    }
  }

  @OnEvent('tenant.created')
  handleTenantCreated(payload: AuditLogEntry) {
    this.logEvent({ ...payload, eventType: 'TENANT_CREATED' });
  }

  @OnEvent('user.registered')
  handleUserRegistered(payload: AuditLogEntry) {
    this.logEvent({ ...payload, eventType: 'USER_REGISTERED' });
  }

  @OnEvent('saas.app_installed')
  handleAppInstalled(payload: AuditLogEntry) {
    this.logEvent({ ...payload, eventType: 'SAAS_APP_INSTALLED' });
  }

  @OnEvent('plan.changed')
  handlePlanChanged(payload: AuditLogEntry) {
    this.logEvent({ ...payload, eventType: 'PLAN_CHANGED' });
  }
}
