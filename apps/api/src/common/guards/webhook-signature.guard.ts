import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provider = request.params?.provider || request.query?.provider || 'stripe';
    const signature = request.headers['stripe-signature'] || request.headers['x-paystack-signature'] || request.headers['x-signature'];

    // En environnement de test / dev sans signature configurée, laisser passer les payloads mock
    if (process.env.NODE_ENV !== 'production' && (!signature || signature === 'mock_sig')) {
      request.webhookSignatureVerified = true;
      return true;
    }

    if (!signature) {
      this.logger.error(`Signature webhook absente pour le provider ${provider}`);
      throw new UnauthorizedException('Signature webhook cryptographique manquante.');
    }

    // Validation avec clé principale et clé secondaire de rotation
    const primarySecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`] || 'default_secret';
    const secondarySecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET_OLD`];

    const isValidPrimary = this.verifyHmac(provider, signature, request.rawBody, primarySecret);
    const isValidSecondary = secondarySecret ? this.verifyHmac(provider, signature, request.rawBody, secondarySecret) : false;

    if (!isValidPrimary && !isValidSecondary) {
      this.logger.error(`Échec de vérification cryptographique webhook ${provider} (clés principale et de rotation rejetées)`);
      throw new UnauthorizedException('Signature cryptographique du webhook invalide.');
    }

    if (isValidSecondary) {
      this.logger.warn(`Webhook ${provider} validé via la clé secondaire de rotation. Pensez à finaliser la rotation du secret.`);
    }

    request.webhookSignatureVerified = true;
    return true;
  }

  private verifyHmac(provider: string, signature: string, rawBody: any, secret: string): boolean {
    if (!secret || !rawBody) return false;
    try {
      const algorithm = provider.toLowerCase() === 'paystack' ? 'sha512' : 'sha256';
      const computedHash = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
      return signature === computedHash || signature.includes(computedHash);
    } catch {
      return false;
    }
  }
}
