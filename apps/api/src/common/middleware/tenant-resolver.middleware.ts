import { Injectable, NestMiddleware } from '@nestjs/common';

type RawRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: Record<string, unknown>;
  tenantId?: string;
};

/**
 * Middleware de résolution du Tenant.
 * Extrait le tenant_id depuis :
 *   1. Le JWT (custom claim) — méthode principale
 *   2. Le header X-Tenant-ID — pour les API Keys
 *   3. Le subdomain — optionnel (ex: yziow.api.saas-platform.eu)
 *
 * Compatible Fastify (utilise types natifs, pas express/fastify imports).
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  use(req: RawRequest, _res: unknown, next: () => void): void {
    let tenantId: string | undefined;

    // ── 1. Depuis le JWT (custom claim) ───────────────────────────
    if (req.user?.tenant_id && typeof req.user.tenant_id === 'string') {
      tenantId = req.user.tenant_id;
    }

    // ── 2. Depuis le header X-Tenant-ID (API Key auth) ─────────────
    if (!tenantId) {
      const header = req.headers['x-tenant-id'];
      if (typeof header === 'string' && header) tenantId = header;
    }

    // ── 3. Depuis le subdomain ──────────────────────────────────────
    if (!tenantId) {
      const host = (req.headers.host as string | undefined) ?? '';
      const subdomain = host.split('.')[0];
      const excluded = ['api', 'www', 'admin', 'docs', 'localhost'];
      if (subdomain && !excluded.includes(subdomain)) tenantId = subdomain;
    }

    req.tenantId = tenantId;
    next();
  }
}
