import { Controller, Get, Post, Body, Param, Patch, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('API Keys')
@ApiBearerAuth('JWT')
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les clés API du tenant' })
  // On autorise un ADMIN du tenant à gérer les clés
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN') 
  findAll(@TenantId() tenantId: string) {
    return this.service.listKeys(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Générer une nouvelle clé API (Affiche la clé brute une seule fois)' })
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN')
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.service.generateKey(tenantId, dto);
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Révoquer une clé API' })
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN')
  revoke(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeKey(tenantId, id);
  }
}
