import { Controller, Get, Post, Body, Param, Patch, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Tenants')
@ApiBearerAuth('JWT')
@Roles('SAAS_SUPER_ADMIN')
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  @ApiOperation({ summary: '[Super Admin] Lister tous les tenants' })
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @ApiOperation({ summary: '[Super Admin] Détail d\'un tenant' })
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @ApiOperation({ summary: '[Super Admin] Créer un nouveau tenant' })
  create(@Body() body: { slug: string; name: string; plan?: string }) {
    return this.service.create(body);
  }

  @Patch(':id/plan')
  @ApiOperation({ summary: '[Super Admin] Changer le plan d\'un tenant' })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('plan') plan: string,
  ) {
    return this.service.updatePlan(id, plan);
  }
}
