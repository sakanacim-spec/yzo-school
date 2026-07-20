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

    // Validation de signature Stripe ou Paystack HMAC SHA256
    const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`] || 'default_secret';
    if (secret && request.rawBody) {
      const computedHash = crypto.createHmac('sha256', secret).update(request.rawBody).digest('hex');
      if (signature !== computedHash && !signature.includes(computedHash)) {
        this.logger.error(`Échec de vérification cryptographique webhook ${provider}`);
        throw new UnauthorizedException('Signature cryptographique du webhook invalide.');
      }
    }

    request.webhookSignatureVerified = true;
    return true;
  }
}
