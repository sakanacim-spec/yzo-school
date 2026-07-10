import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Organizations')
@ApiBearerAuth('JWT')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @Roles('TENANT_ADMIN', 'SAAS_SUPER_ADMIN')
  @ApiOperation({ summary: 'Créer une organisation (ex: une école)' })
  create(@TenantId() tenantId: string, @Body() dto: CreateOrganizationDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les organisations du tenant' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @TenantId() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findAll(tenantId, page, Math.min(limit, 100));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une organisation par ID' })
  findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles('ORG_ADMIN', 'TENANT_ADMIN', 'SAAS_SUPER_ADMIN')
  @ApiOperation({ summary: 'Modifier une organisation' })
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('TENANT_ADMIN', 'SAAS_SUPER_ADMIN')
  @ApiOperation({ summary: 'Archiver une organisation (soft delete)' })
  archive(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(tenantId, id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistiques d\'une organisation' })
  getStats(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStats(tenantId, id);
  }
}
