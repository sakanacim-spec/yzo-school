import { Controller, Get, Post, Body, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'ID du plan choisi' })
  plan_id: string;

  @ApiProperty({ description: 'Passerelle de paiement (stripe ou paystack)', enum: ['stripe', 'paystack'] })
  gateway: 'stripe' | 'paystack';

  @ApiProperty({ description: 'URL de redirection après succès' })
  success_url: string;

  @ApiProperty({ description: 'URL de redirection après annulation' })
  cancel_url: string;
}

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Lister les plans d\'abonnement disponibles (Public)' })
  async getPlans() {
    return this.billingService.getAvailablePlans();
  }

  @Post('checkout')
  @ApiBearerAuth('JWT')
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN')
  @ApiOperation({ summary: 'Générer une URL de paiement pour souscrire à un plan' })
  async checkout(@TenantId() tenantId: string, @Body() dto: CreateCheckoutDto) {
    if (!tenantId) throw new UnauthorizedException('Tenant ID manquant');
    if (!['stripe', 'paystack'].includes(dto.gateway)) throw new BadRequestException('Passerelle invalide');
    
    return this.billingService.createCheckoutSession(
      tenantId, 
      dto.plan_id, 
      dto.gateway, 
      dto.success_url, 
      dto.cancel_url
    );
  }
}
