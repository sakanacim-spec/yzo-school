import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../guards/rbac.guard';

export const ROLES_KEY = 'roles';

/**
 * Décorateur pour spécifier les rôles requis sur une route.
 *
 * @example
 * \@Roles('ORG_ADMIN', 'TENANT_ADMIN')
 * \@Get('organizations')
 * findAll() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
