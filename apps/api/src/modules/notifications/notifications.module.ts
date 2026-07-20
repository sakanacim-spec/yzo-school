import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

import { NotificationWorker } from './notification.worker';
import { DefaultNotificationProvider } from '../../common/providers/notification.provider';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository, NotificationWorker, DefaultNotificationProvider],
  exports: [NotificationsService, NotificationsRepository, NotificationWorker, DefaultNotificationProvider],
})
export class NotificationsModule {}
