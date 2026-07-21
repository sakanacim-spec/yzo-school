import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);
  private isRefreshing = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService
  ) {}

  async getGlobalKpis() {
    const { data, error } = await this.supabase.admin
      .from('platform_global_kpis_mv')
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async getFinancialKpis() {
    const { data, error } = await this.supabase.admin
      .from('platform_financial_kpis_mv')
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async getUsageKpis() {
    const { data, error } = await this.supabase.admin
      .from('platform_usage_kpis_mv')
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async refreshKpis() {
    if (this.isRefreshing) {
      throw new BadRequestException('Un rafraîchissement est déjà en cours.');
    }
    
    this.isRefreshing = true;
    const start = performance.now();
    
    try {
      // NOTE: Supabase JS client RPC is used to call a postgres function if we want to run REFRESH MATERIALIZED VIEW
      // Since we don't have a specific postgres function exposed for this, we must use the standard method 
      // or we can create a postgres function. Since we are using the service_role key, we can execute SQL via a secure wrapper,
      // but Supabase Data API doesn't support raw SQL.
      // Alternatively, we call an RPC `refresh_platform_kpis` that we should add to the DB, or we simulate it if not available.
      // For the sake of this plan, we call an RPC.
      const { error } = await this.supabase.admin.rpc('refresh_platform_kpis_mv');
      
      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const end = performance.now();
      return { 
        success: true, 
        message: 'Vues matérialisées rafraîchies avec succès.',
        duration_ms: Math.round(end - start)
      };
    } finally {
      this.isRefreshing = false;
    }
  }
  async createImpersonationSession(actorId: string, tenantId: string, justification: string, platformRoles: string[]) {
    try {
      // 1. Check if tenant exists
      const { data: tenant, error: tenantErr } = await this.supabase.admin
        .from('saas_tenants')
        .select('id')
        .eq('id', tenantId)
        .single();

      if (tenantErr || !tenant) {
        throw new NotFoundException('Locataire introuvable.');
      }

      // 2. Create the session
    const expiresAt = new Date(Date.now() + 59 * 60 * 1000); // 59 minutes (prevents clock skew / check constraint violation)

    const { data: session, error: sessionErr } = await this.supabase.admin
      .from('platform_impersonation_sessions')
      .insert({
        super_admin_id: actorId,
        tenant_id: tenantId,
        justification,
        expires_at: expiresAt.toISOString(),
        status: 'ACTIVE'
      })
      .select()
      .single();

    if (sessionErr) {
      // Pour gérer la contrainte d'unicité sur les sessions actives
      if (sessionErr.code === '23505') {
         throw new BadRequestException("Vous avez déjà une session d'impersonation active. Veuillez la révoquer d'abord.");
      }
      console.error("SESSION ERR", sessionErr);
      throw new InternalServerErrorException(sessionErr.message);
    }

    // 3. Generate the Custom JWT
    // The JWT must use the Supabase JWT secret to be accepted by Supabase RLS policies!
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      throw new InternalServerErrorException('SUPABASE_JWT_SECRET is not defined');
    }

    const payload = {
      aud: 'authenticated',
      sub: actorId,
      email: '', // Not strictly needed for impersonation unless UI displays it
      app_metadata: {
        provider: 'impersonation',
        impersonation_session_id: session.id,
        impersonating: true,
        tenant_id: tenantId,
        platform_roles: platformRoles
      },
      user_metadata: {
        impersonating: true
      },
      role: 'authenticated'
    };

    const token = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '1h'
    });

    // 4. Audit Log
    await this.supabase.admin.from('saas_audit_logs').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'superadmin.impersonation.started',
      severity: 'SECURITY',
      correlation_id: session.id,
      entity_type: 'impersonation_session',
      entity_id: session.id,
      metadata: {
        justification,
        session_id: session.id,
        expires_at: expiresAt.toISOString(),
        reason: "Nouvelle session d'impersonation"
      }
    });

    return {
      session_id: session.id,
      token,
      expires_at: expiresAt
    };
    } catch (err: any) {
      this.logger.error(`Erreur création session impersonation: ${err.message}`);
      throw err;
    }
  }

  async revokeImpersonationSession(sessionId: string, actorId: string) {
    const { data, error } = await this.supabase.admin
      .from('platform_impersonation_sessions')
      .update({ status: 'REVOKED' })
      .eq('id', sessionId)
      .eq('super_admin_id', actorId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException('Erreur lors de la révocation de la session.');
    }

    if (!data) {
      throw new NotFoundException('Session introuvable ou non autorisée.');
    }

    // Audit Log
    await this.supabase.admin.from('saas_audit_logs').insert({
      tenant_id: data.tenant_id,
      actor_id: actorId,
      action: 'superadmin.impersonation.revoked',
      severity: 'SECURITY',
      correlation_id: sessionId,
      entity_type: 'impersonation_session',
      entity_id: sessionId,
      metadata: {
        session_id: sessionId,
        reason: "Session révoquée manuellement par l'administrateur"
      }
    });

    return { success: true, message: 'Session révoquée.' };
  }

  async getCurrentImpersonationSession(actorId: string) {
    const { data, error } = await this.supabase.admin
      .from('platform_impersonation_sessions')
      .select('*')
      .eq('super_admin_id', actorId)
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data || null;
  }
}
