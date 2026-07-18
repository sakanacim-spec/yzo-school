import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { I18nService } from 'nestjs-i18n';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Guard Auth unifié — vérifie le Bearer token Supabase ou la Clé API (M2M) à chaque requête.
 * Injecte l'utilisateur + tenant_id dans req.user.
 *
 * Usage: appliqué globalement via APP_GUARD ou sur les contrôleurs.
 * Pour les routes publiques, utilisez @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── Route publique ? ─────────────────────────────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // ── Extraction des Credentials ──────────────────────────────────────
    const request = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const apiKey = (request.headers as any)['x-api-key'] as string | undefined;
    const token = this.extractBearerToken(request);

    if (!token && !apiKey) {
      const lang = (request.headers as any)['accept-language']?.split(',')[0]?.substring(0, 2) || 'fr';
      throw new UnauthorizedException(this.i18n.t('errors.invalid_api_key', { lang }));
    }

    // ── Validation Clé API (M2M) ────────────────────────────────────
    if (apiKey) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      const client = this.supabaseService.admin;
      const { data: keyRecord, error } = await client
        .from('saas_api_keys')
        .select('tenant_id, is_revoked, expires_at')
        .eq('key_hash', keyHash)
        .single();

      if (error || !keyRecord) {
        throw new UnauthorizedException('Clé API invalide');
      }

      if (keyRecord.is_revoked) {
        throw new UnauthorizedException('Clé API révoquée');
      }

      if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
        throw new UnauthorizedException('Clé API expirée');
      }

      // Mettre à jour last_used_at asynchrone (fire and forget)
      client.from('saas_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key_hash', keyHash)
        .then();

      // Injection dans la requête
      (request as any).user = {
        id: 'm2m_service',
        tenant_id: keyRecord.tenant_id,
        role: 'TENANT_ADMIN', // Une clé API a généralement les droits d'un admin de tenant
        is_m2m: true, // Tag spécifique pour les audits futurs
      };
      return true;
    }

    // ── Vérification Supabase (JWT) ────────────────────────────────────
    if (!token) {
      throw new UnauthorizedException('Token JWT manquant');
    }

    try {
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      if (!jwtSecret) {
        throw new InternalServerErrorException('SUPABASE_JWT_SECRET manquant');
      }

      let tokenPayload: any;

      // Détermine l'algorithme depuis le header du token
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());

      if (header.alg === 'HS256') {
        // Token signé avec le secret symétrique (impersonation, tests mockés)
        try {
          tokenPayload = jwt.verify(token, jwtSecret, {
            algorithms: ['HS256'],
            audience: 'authenticated',
            ignoreExpiration: false,
          });
        } catch (e: any) {
          throw new UnauthorizedException('Token invalide ou expiré');
        }
      } else if (header.alg === 'ES256') {
        // Token émis par Supabase GoTrue (ECDSA P-256)
        const kid = header.kid;
        if (!kid) {
          throw new UnauthorizedException('Token ES256 sans kid dans le header');
        }
        const publicKey = await JwtAuthGuard.getGoTruePublicKey(kid);
        try {
          tokenPayload = jwt.verify(token, publicKey, {
            algorithms: ['ES256'],
            audience: 'authenticated',
            ignoreExpiration: false,
          });
        } catch (e: any) {
          throw new UnauthorizedException('Token invalide ou expiré');
        }

        // Validation stricte de l'issuer (iss) pour les tokens ES256
        const supabaseUrl = process.env.SUPABASE_URL;
        const expectedIssuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined;
        if (expectedIssuer && tokenPayload.iss !== expectedIssuer) {
          throw new UnauthorizedException('Issuer JWT non autorisé');
        }
      } else {
        throw new UnauthorizedException('Algorithme JWT non supporté');
      }

      // Validation stricte du issued-at (iat)
      const now = Math.floor(Date.now() / 1000);
      if (tokenPayload.iat && tokenPayload.iat > now + 300) { // Tolérance de 5 minutes pour clock skew
        throw new UnauthorizedException('Token iat dans le futur (rejeu)');
      }

      if (!tokenPayload.sub) {
        throw new UnauthorizedException('Claim sub manquante');
      }
      if (!tokenPayload.iat) {
        throw new UnauthorizedException('Claim iat manquante');
      }

      // Reconstruit l'objet utilisateur tel qu'attendu par la suite du code
      const supabaseUser = {
        id: tokenPayload.sub,
        email: tokenPayload.email || '',
        user_metadata: tokenPayload.user_metadata || {},
        app_metadata: tokenPayload.app_metadata || {},
      };

      let appMetadata = supabaseUser.app_metadata ?? {};

      if (appMetadata.impersonation_session_id) {
        const sessionId = appMetadata.impersonation_session_id;
        const { data: session, error: sessionErr } = await this.supabaseService.admin
          .from('platform_impersonation_sessions')
          .select('status, expires_at')
          .eq('id', sessionId)
          .single();

        if (sessionErr || !session) {
          throw new UnauthorizedException('Session d\'impersonation introuvable');
        }
        if (session.status === 'REVOKED') {
          throw new UnauthorizedException('Session d\'impersonation révoquée');
        }
        if (new Date(session.expires_at) < new Date()) {
          // Expirée en DB, on met à jour
          await this.supabaseService.admin
            .from('platform_impersonation_sessions')
            .update({ status: 'EXPIRED' })
            .eq('id', sessionId);
            
          // Audit Log
          await this.supabaseService.admin.from('saas_audit_logs').insert({
            tenant_id: appMetadata.tenant_id,
            actor_id: supabaseUser.id,
            action: 'superadmin.impersonation.expired',
            severity: 'INFO',
            correlation_id: sessionId,
            entity_type: 'impersonation_session',
            entity_id: sessionId,
            metadata: {
              session_id: sessionId,
              reason: "Session d'impersonation expirée automatiquement"
            }
          });
          
          throw new UnauthorizedException("Session d'impersonation expirée");
        }
      }

      // Injection dans la requête pour les guards suivants
      (request as any).user = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        // Les custom claims (tenant_id, role, org_id) sont dans le JWT
        ...(supabaseUser.user_metadata ?? {}),
        ...appMetadata,
      };

      return true;
    } catch (error: any) {
      // Re-throw les exceptions système NestJS sans les masquer (401 et 500)
      if (error instanceof UnauthorizedException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const authHeader = (request.headers as any)['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    return authHeader.slice(7);
  }

  // ── Cache JWKS pour vérification ES256 ──────────────────────────────
  private static readonly jwksCache = new Map<string, { key: string; fetchedAt: number }>();
  private static lastFetchTime = 0;
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Cache de 24 heures
  private static readonly MIN_FETCH_INTERVAL_MS = 10 * 1000; // Minimum 10 secondes entre les appels au serveur JWKS (anti-DDoS)
  private static activeFetchPromise: Promise<void> | null = null;

  /**
   * Récupère la clé publique JWKS depuis GoTrue en se basant sur le kid du header du token.
   * Les clés sont mises en cache en mémoire avec un TTL de 24h et une protection anti-DDoS.
   * La méthode est concurrency-safe (attend la même promesse en cas de requêtes simultanées).
   */
  private static async getGoTruePublicKey(kid: string): Promise<string> {
    const cached = this.jwksCache.get(kid);
    const now = Date.now();

    const isExpired = cached && (now - cached.fetchedAt > this.CACHE_TTL_MS);
    const isMissing = !cached;

    if (isMissing || isExpired) {
      // Si une requête de récupération est déjà en cours, on attend sa résolution
      if (this.activeFetchPromise) {
        await this.activeFetchPromise;
      } else if (now - this.lastFetchTime > this.MIN_FETCH_INTERVAL_MS) {
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
          throw new InternalServerErrorException('SUPABASE_URL manquant');
        }

        // Crée la promesse partagée pour tous les appels concurrents
        this.activeFetchPromise = (async () => {
          try {
            const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
            if (!response.ok) {
              throw new Error(`JWKS endpoint returned status ${response.status}`);
            }
            const jwks = await response.json() as any;
            this.lastFetchTime = Date.now();

            if (jwks && Array.isArray(jwks.keys)) {
              for (const key of jwks.keys) {
                if (key.kid && key.kty === 'EC') {
                  const keyObject = crypto.createPublicKey({ key, format: 'jwk' });
                  const pem = keyObject.export({ type: 'spki', format: 'pem' }) as string;
                  this.jwksCache.set(key.kid, { key: pem, fetchedAt: Date.now() });
                }
              }
            }
          } catch (e: any) {
            // Si l'appel échoue et qu'on a un cache expiré, on garde le cache expiré par résilience
            if (!cached) {
              throw new InternalServerErrorException(`Impossible de récupérer la clé JWKS: ${e.message}`);
            }
          } finally {
            this.activeFetchPromise = null;
          }
        })();

        await this.activeFetchPromise;
      }
    }

    const finalCached = this.jwksCache.get(kid);
    if (!finalCached) {
      throw new UnauthorizedException(`Clé publique non trouvée pour le kid spécifié`);
    }

    return finalCached.key;
  }
}
