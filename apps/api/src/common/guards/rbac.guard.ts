import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

export type UserRole =
  | 'SAAS_SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'ORG_ADMIN'
  | 'ORG_STAFF'
  | 'USER';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SAAS_SUPER_ADMIN: 100,
  TENANT_ADMIN: 80,
  ORG_ADMIN: 60,
  ORG_STAFF: 40,
  USER: 20,
};

/**
 * Guard RBAC — vérifie que l'utilisateur possède le rôle requis.
 * Utilise une hiérarchie de rôles : un rôle supérieur hérite des permissions inférieures.
 *
 * Usage:
 *   @Roles('ORG_ADMIN')
 *   @UseGuards(JwtAuthGuard, RbacGuard)
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Aucun rôle requis → accès autorisé (JWT seul suffit)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: { role: UserRole } }>();
    const userRole = request.user?.role;

    if (!userRole) {
      throw new ForbiddenException('Rôle utilisateur introuvable');
    }

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const minRequiredLevel = Math.min(
      ...requiredRoles.map((r) => ROLE_HIERARCHY[r] ?? 999),
    );

    if (userLevel < minRequiredLevel) {
      throw new ForbiddenException(
        `Accès refusé — Rôle requis: ${requiredRoles.join(' ou ')}`,
      );
    }

    return true;
  }
}
