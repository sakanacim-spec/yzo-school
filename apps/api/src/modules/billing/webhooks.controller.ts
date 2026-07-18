import { Controller, Post, Headers, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BillingService } from './billing.service';

@ApiTags('Webhooks')
@Controller({ path: 'webhooks/billing', version: '1' })
export class WebhooksController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Post('stripe')
  @ApiOperation({ summary: 'Webhook Stripe pour les abonnements' })
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    if (!signature) throw new BadRequestException('Signature manquante');
    // Important: req.rawBody est requis pour que Stripe valide la signature
    return this.billingService.processWebhook('stripe', req.rawBody || req.body, signature);
  }

  @Public()
  @Post('paystack')
  @ApiOperation({ summary: 'Webhook Paystack pour les paiements Mobile Money' })
  async handlePaystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: any,
  ) {
    if (!signature) throw new BadRequestException('Signature manquante');
    return this.billingService.processWebhook('paystack', req.body, signature);
  }
}
