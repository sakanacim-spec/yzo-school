import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Décorateur pour marquer une route comme publique (sans authentification).
 *
 * @example
 * \@Public()
 * \@Post('auth/login')
 * login() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
