import { Controller, Post, Get, Body, Query, BadRequestException } from '@nestjs/common';
import { ProvisioningService, ProvisionPayload } from './provisioning.service';
import { TenantsService } from './tenants.service';

@Controller('v1/onboarding')
export class OnboardingController {
  constructor(
    private readonly provisioningService: ProvisioningService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('provision')
  async provision(@Body() body: ProvisionPayload) {
    if (!body.email || !body.orgName || !body.orgSlug || !body.saasId) {
      throw new BadRequestException('Champs obligatoires manquants : email, orgName, orgSlug, saasId');
    }
    return this.provisioningService.provisionTenant(body);
  }

  @Get('tenant')
  async getTenantBySlug(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('Slug obligatoire');
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) throw new BadRequestException(`Tenant introuvable pour le slug: ${slug}`);
    return tenant;
  }
}
