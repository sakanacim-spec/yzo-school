import './instrument'; // Doit être le tout premier import !
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from '@fastify/helmet';
import { Logger } from 'nestjs-pino';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Sécurité: Intégration de Helmet
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // Logging: Remplacement du logger par Pino
  app.useLogger(app.get(Logger));

  // Enregistrement du filtre global contre les fuites d'erreurs SQL / BDD
  app.useGlobalFilters(new DatabaseExceptionFilter());

  // ── Validation globale ─────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Versioning API ─────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── CORS ───────────────────────────────────────────────────────
  const allowedOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3001')
    .split(',');

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  });

  // ── Swagger (Documentation OpenAPI) ────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SaaS Platform API')
      .setDescription(
        'API modulaire B2B — Documentation interactive. Authentifiez-vous avec votre Bearer token.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'API-KEY')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
      .addTag('Auth', 'Authentification et gestion des sessions')
      .addTag('Tenants', 'Gestion des tenants (clients du SaaS)')
      .addTag('Organizations', 'Gestion des organisations (ex: écoles)')
      .addTag('Users', 'Gestion des utilisateurs')
      .addTag('Roles', 'Gestion des rôles et permissions (RBAC)')
      .addTag('Notifications', 'Envoi et gestion des notifications')
      .addTag('Files', 'Upload et gestion des fichiers')
      .addServer(`http://localhost:${port}`, 'Development')
      .addServer('https://api.saas-platform.eu', 'Production')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'SaaS Platform — API Docs',
    });
  }

  // ── Démarrage ──────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API démarrée sur http://localhost:${port}`);
  if (nodeEnv !== 'production') {
    console.log(`📚 Swagger disponible sur http://localhost:${port}/docs`);
  }
}

void bootstrap();
