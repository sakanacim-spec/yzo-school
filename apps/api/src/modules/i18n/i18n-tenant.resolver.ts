import { Injectable, ExecutionContext } from '@nestjs/common';
import { I18nResolver, I18nResolverOptions } from 'nestjs-i18n';

@Injectable()
export class I18nTenantResolver implements I18nResolver {
  resolve(context: ExecutionContext): string | string[] | Promise<string | string[]> | undefined {
    const req = context.switchToHttp().getRequest();
    
    // 1. Si l'utilisateur est authentifié et que le tenant a une langue par défaut
    // (Dans un MVP simple, on suppose que la langue préférée est passée explicitement par le SDK)
    // Mais on vérifie le header en premier (Accept-Language injecté par le client)
    
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
      // Ex: "fr-CH, fr;q=0.9, en;q=0.8" -> "fr"
      const languages = acceptLanguage.split(',').map((l: string) => l.split(';')[0].trim().substring(0, 2));
      return languages;
    }

    // 2. Fallback par défaut (géré par I18nModule configuré avec 'fr')
    return undefined;
  }
}
