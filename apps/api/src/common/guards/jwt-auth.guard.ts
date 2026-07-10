import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard JWT — vérifie le Bearer token Supabase à chaque requête.
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── Route publique ? ─────────────────────────────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // ── Extraction du token ──────────────────────────────────────
    const request = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Token d\'authentification manquant');
    }

    // ── Vérification Supabase ────────────────────────────────────
    try {
      const supabaseUser = await this.supabaseService.verifyToken(token);

      if (!supabaseUser) {
        throw new UnauthorizedException('Token invalide ou expiré');
      }

      // Injection dans la requête pour les guards suivants
      (request as any).user = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        // Les custom claims (tenant_id, role, org_id) sont dans le JWT
        ...(supabaseUser.user_metadata ?? {}),
        ...(supabaseUser.app_metadata ?? {}),
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const authHeader = (request.headers as any)['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    return authHeader.slice(7);
  }
}
