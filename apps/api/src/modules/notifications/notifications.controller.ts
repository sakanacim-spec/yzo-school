import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser, AuthUser, TenantId } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return this.service.findAll(tenantId, user.id, unreadOnly);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  markAsRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markAsRead(tenantId, user.id, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  markAllAsRead(@TenantId() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.service.markAllAsRead(tenantId, user.id);
  }

  @Post('send')
  @ApiOperation({ summary: '[Admin] Envoyer une notification manuelle' })
  send(
    @TenantId() tenantId: string,
    @Body() body: { userId: string; title: string; message: string; type?: 'email' | 'in_app' },
  ) {
    return this.service.createInApp({
      tenantId,
      userId: body.userId,
      title: body.title,
      body: body.message,
      type: body.type,
    });
  }
}
