import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('Roles')
@ApiBearerAuth('JWT')
@Controller({ path: 'roles', version: '1' })
@RequireModule('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les rôles du tenant' })
  findAll(@TenantId() tenantId: string) { return this.service.findAll(tenantId); }

  @Post()
  @Roles('TENANT_ADMIN', 'SAAS_SUPER_ADMIN')
  @ApiOperation({ summary: 'Créer un rôle custom' })
  create(@TenantId() tenantId: string, @Body() body: { name: string; level: number; permissions: string[] }) {
    return this.service.create(tenantId, body);
  }

  @Post('assign')
  @Roles('ORG_ADMIN', 'TENANT_ADMIN', 'SAAS_SUPER_ADMIN')
  @ApiOperation({ summary: 'Assigner un rôle à un utilisateur' })
  assign(@TenantId() tenantId: string, @Body() body: { userId: string; roleId: string; orgId: string }) {
    return this.service.assignToUser(tenantId, body.userId, body.roleId, body.orgId);
  }
}
