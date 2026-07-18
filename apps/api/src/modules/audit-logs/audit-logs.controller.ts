import { Controller, Get, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { TenantId, AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT') // Utilisera x-api-key en réalité via JwtAuthGuard si supporté
@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer l\'historique des logs d\'audit du tenant' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getLogs(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID manquant');
    }

    const parsedLimit = limit ? parseInt(limit.toString(), 10) : 50;
    const parsedOffset = offset ? parseInt(offset.toString(), 10) : 0;

    const result = await this.auditLogsService.getLogs(tenantId, parsedLimit, parsedOffset);
    
    // Loguer le fait qu'un utilisateur consulte les audits logs :)
    this.auditLogsService.log({
      tenantId,
      actorId: user.id, // Si authentifié via JWT
      action: 'auditlogs.read',
      severity: 'INFO',
      metadata: { limit: parsedLimit, offset: parsedOffset }
    });

    return result;
  }
}
