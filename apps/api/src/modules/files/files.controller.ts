import { Controller, Get, Post, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { CurrentUser, AuthUser, TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('Files')
@ApiBearerAuth('JWT')
@Controller({ path: 'files', version: '1' })
@RequireModule('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Obtenir une URL pré-signée pour uploader un fichier' })
  createUploadUrl(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { orgId: string; filename: string; mimeType: string; sizeBytes: number },
  ) {
    return this.service.createUploadUrl(
      tenantId, body.orgId, user.id, body.filename, body.mimeType, body.sizeBytes,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister les fichiers' })
  findAll(@TenantId() tenantId: string, @Query('orgId') orgId?: string) {
    return this.service.findAll(tenantId, orgId);
  }

  @Get(':id/url')
  @ApiOperation({ summary: 'Obtenir une URL signée de téléchargement' })
  getUrl(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expires') expires?: number,
  ) {
    return this.service.getSignedUrl(tenantId, id, expires);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un fichier' })
  delete(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(tenantId, id);
  }
}
