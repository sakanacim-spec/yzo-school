import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { appConfig, validateConfig } from './config/app.config';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FilesModule } from './modules/files/files.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { AiConciergeModule } from './modules/ai-concierge/ai-concierge.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { BillingModule } from './modules/billing/billing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { SuperAdminModule } from './modules/superadmin/superadmin.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { ModuleGuard } from './common/guards/module.guard';
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n';
import { I18nTenantResolver } from './modules/i18n/i18n-tenant.resolver';
import * as path from 'path';
import { LoggerModule } from 'nestjs-pino';
import { SentryModule } from '@sentry/nestjs/setup';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateConfig,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Rate Limiting global (par IP) ──────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL') || 60000,
          limit: configService.get<number>('THROTTLE_LIMIT') || 100,
        },
      ],
    }),

    // ── Infrastructure partagée (Global) ───────────────────────
    SupabaseModule,

    // ── Modules Métier MVP ─────────────────────────────────────
    AuthModule,
    TenantsModule,
    OrganizationsModule,
    UsersModule,
    RolesModule,
    NotificationsModule,
    FilesModule,
    ApiKeysModule,
    KnowledgeBaseModule,
    AiConciergeModule,
    AuditLogsModule,
    BillingModule,
    AnalyticsModule,
    SuperAdminModule,

    // ── Localisation (i18n) ────────────────────────────────────
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        new I18nTenantResolver(),
        AcceptLanguageResolver, // Fallback natif nestjs-i18n
      ],
    }),

    // ── Santé & Monitoring ─────────────────────────────────────
    HealthModule,
  ],
  providers: [
    // Guards globaux — déclarés ici pour éviter la dépendance circulaire
    // SupabaseModule (global) est résolu avant les modules métier
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
  ],
})
export class AppModule {}
