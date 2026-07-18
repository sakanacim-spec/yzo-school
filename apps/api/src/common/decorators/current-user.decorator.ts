import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  tenant_id: string;
  org_id?: string;
  role: string;
}

/**
 * Décorateur de paramètre pour injecter l'utilisateur courant dans un handler.
 *
 * @example
 * \@Get('profile')
 * getProfile(\@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);

/**
 * Décorateur pour injecter le tenant_id courant.
 *
 * @example
 * \@Get('organizations')
 * findAll(\@TenantId() tenantId: string) { ... }
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user?.tenant_id;
  },
);
