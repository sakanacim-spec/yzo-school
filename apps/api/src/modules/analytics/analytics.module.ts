import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsAggregatorCron } from './analytics-aggregator.cron';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsAggregatorCron],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
