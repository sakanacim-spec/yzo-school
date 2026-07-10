import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { HealthModule } from './modules/health/health.module';
import { SupabaseModule } from './common/supabase/supabase.module';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateConfig,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Rate Limiting global (par IP) ──────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,  limit: 10 },   // 10 req/sec
      { name: 'medium', ttl: 10_000, limit: 50 },   // 50 req/10sec
      { name: 'long',   ttl: 60_000, limit: 200 },  // 200 req/min
    ]),

    // ── Infrastructure partagée ────────────────────────────────
    SupabaseModule,

    // ── Modules Métier MVP ─────────────────────────────────────
    AuthModule,
    TenantsModule,
    OrganizationsModule,
    UsersModule,
    RolesModule,
    NotificationsModule,
    FilesModule,

    // ── Santé & Monitoring ─────────────────────────────────────
    HealthModule,
  ],
  providers: [
    // Rate limiting appliqué globalement
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
