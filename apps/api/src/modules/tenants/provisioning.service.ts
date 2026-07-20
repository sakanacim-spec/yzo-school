import { Inject, Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT } from '../../common/supabase/supabase.tokens';
import { SHARED_SAAS_REGISTRY } from '@saas/types';

export interface ProvisionPayload {
  email: string;
  password?: string;
  userId?: string;
  orgName: string;
  orgSlug: string;
  saasId: string;
  country?: string;
  currency?: string;
}

@Injectable()
export class ProvisioningService {
  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    private readonly db: SupabaseClient,
  ) {}

  async provisionTenant(payload: ProvisionPayload) {
    const { email, password, orgName, orgSlug, saasId, country = 'FRA', currency = 'EUR' } = payload;

    // 1. Vérifier que le SaaS existe dans le registre partagé
    const saasDef = SHARED_SAAS_REGISTRY.find((s) => s.id === saasId);
    if (!saasDef) {
      throw new BadRequestException(`SaaS métier inconnu : ${saasId}`);
    }

    // 2. Vérifier l'unicité du slug
    const { data: existingTenant } = await this.db
      .from('saas_tenants')
      .select('id')
      .eq('slug', orgSlug)
      .single();

    if (existingTenant) {
      throw new BadRequestException(`Le slug "${orgSlug}" est déjà utilisé. Veuillez en choisir un autre.`);
    }

    let createdUserId = payload.userId;
    let createdTenantId: string | null = null;
    let createdOrgId: string | null = null;

    try {
      // 3. Étape Auth User (Si non fourni)
      if (!createdUserId) {
        if (!password) {
          throw new BadRequestException('Mot de passe requis pour la création du compte.');
        }
        const { data: authData, error: authError } = await this.db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (authError || !authData.user) {
          throw new BadRequestException(`Erreur création compte utilisateur: ${authError?.message}`);
        }
        createdUserId = authData.user.id;
      }

      // 4. Étape Création du Tenant (public.saas_tenants)
      const { data: tenantData, error: tenantError } = await this.db
        .from('saas_tenants')
        .insert({
          slug: orgSlug,
          name: orgName,
          plan: 'starter',
          status: 'trial',
          country,
          currency,
          owner_id: createdUserId,
          settings: { modules: saasDef.modules },
        })
        .select()
        .single();

      if (tenantError || !tenantData) {
        throw new InternalServerErrorException(`Erreur création tenant: ${tenantError?.message}`);
      }
      createdTenantId = tenantData.id;

      // 5. Étape Création de l'Organisation (public.saas_organizations)
      const { data: orgData, error: orgError } = await this.db
        .from('saas_organizations')
        .insert({
          tenant_id: createdTenantId,
          name: orgName,
          code: orgSlug.toUpperCase().replace(/-/g, '_'),
          metadata: { saasId },
        })
        .select()
        .single();

      if (orgError || !orgData) {
        throw new InternalServerErrorException(`Erreur création organisation: ${orgError?.message}`);
      }
      createdOrgId = orgData.id;

      // 6. Étape Création du Profil Utilisateur (public.saas_profiles)
      const { error: profileError } = await this.db.from('saas_profiles').upsert({
        id: createdUserId,
        tenant_id: createdTenantId,
        org_id: createdOrgId,
        locale: 'fr',
        metadata: { role: 'TENANT_ADMIN' },
      });

      if (profileError) {
        throw new InternalServerErrorException(`Erreur création profil: ${profileError.message}`);
      }

      // 7. Étape Rattachement du SaaS Métier (public.saas_tenant_apps)
      const { error: appError } = await this.db.from('saas_tenant_apps').insert({
        tenant_id: createdTenantId,
        saas_id: saasId,
        status: 'trial',
        modules: saasDef.modules,
      });

      if (appError) {
        throw new InternalServerErrorException(`Erreur raccordement SaaS app: ${appError.message}`);
      }

      return {
        success: true,
        message: 'Espace professionnel créé avec succès',
        tenant: {
          id: createdTenantId,
          slug: orgSlug,
          name: orgName,
          status: 'trial',
          country,
          currency,
        },
        user: {
          id: createdUserId,
          email,
        },
        activeApp: {
          saasId,
          name: saasDef.name,
          modules: saasDef.modules,
        },
        redirectUrl: `/hub?tenant=${orgSlug}`,
      };
    } catch (err) {
      // Nettoyage de secours (Rollback simulation) en cas d'échec
      if (createdTenantId) {
        await this.db.from('saas_tenants').delete().eq('id', createdTenantId);
      }
      if (createdUserId && !payload.userId) {
        await this.db.auth.admin.deleteUser(createdUserId);
      }
      throw err;
    }
  }
}
