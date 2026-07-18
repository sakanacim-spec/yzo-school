import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@RequireModule('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs du tenant' })
  @ApiQuery({ name: 'orgId', required: false })
  findAll(@TenantId() tenantId: string, @Query('orgId') orgId?: string) {
    return this.service.findAll(tenantId, orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Profil d\'un utilisateur' })
  findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(tenantId, id);
  }
}
