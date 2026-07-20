import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { OnboardingController } from './onboarding.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { ProvisioningService } from './provisioning.service';

@Module({
  controllers: [TenantsController, OnboardingController],
  providers: [TenantsService, TenantsRepository, ProvisioningService],
  exports: [TenantsService, TenantsRepository, ProvisioningService],
})
export class TenantsModule {}
