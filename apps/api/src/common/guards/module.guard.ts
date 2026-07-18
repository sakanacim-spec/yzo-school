import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Guard Module — vérifie si le tenant de l'utilisateur a accès au module requis.
 * Si la route nécessite @RequireModule('billing'), on vérifie que 'billing'
 * est dans settings->'modules' de la table saas_tenants.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  // Simple cache in-memory pour éviter de requêter la DB à chaque appel
  // Key: tenant_id, Value: { modules: string[], expires: number }
  private cache = new Map<string, { modules: string[]; expires: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Aucun module spécifique requis
    if (!requiredModule) return true;

    const request = context.switchToHttp().getRequest<{ user: { tenant_id?: string; role?: string } }>();
    const user = request.user;

    // Si on est SAAS_SUPER_ADMIN, on bypass le module check
    if (user?.role === 'SAAS_SUPER_ADMIN') return true;

    const tenantId = user?.tenant_id;
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID manquant pour vérifier l\'accès au module');
    }

    const modules = await this.getTenantModules(tenantId);

    if (!modules.includes(requiredModule)) {
      throw new ForbiddenException(
        `Accès refusé — Le module '${requiredModule}' n'est pas activé pour votre organisation. Veuillez contacter le support pour upgrader votre plan.`,
      );
    }

    return true;
  }

  private async getTenantModules(tenantId: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);

    if (cached && cached.expires > now) {
      return cached.modules;
    }

    // Utilisation du client admin pour être sûr de pouvoir lire les settings
    const { data, error } = await this.supabaseService.admin
      .from('saas_tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      return [];
    }

    // Extraction des modules du JSONB settings
    const settings = data.settings as { modules?: string[] };
    const modules = Array.isArray(settings?.modules) ? settings.modules : [];

    // Cache pour 1 minute (60000ms) pour les performances
    this.cache.set(tenantId, { modules, expires: now + 60000 });

    return modules;
  }
}
