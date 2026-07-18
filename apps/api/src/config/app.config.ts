import { registerAs } from '@nestjs/config';
import { z } from 'zod';

// ── Schema de validation des variables d'environnement ─────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_VERSION: z.string().default('v1'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  // JWT
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Email
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // SMS (optionnel)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // OpenAI (optionnel en dev, recommandé pour RAG)
  OPENAI_API_KEY: z.string().optional(),

  // Stripe & Paystack (Billing)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),

  // Reset Password URL
  RESET_PASSWORD_URL: z.string().url().default('http://localhost:3001/reset-password'),

  // Rate Limiting
  THROTTLE_TTL: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(100),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3001'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('debug'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateConfig(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Variables d\'environnement invalides:');
    console.error(result.error.flatten().fieldErrors);
    throw new Error('Configuration invalide — vérifiez votre .env');
  }
  return result.data;
}

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiVersion: process.env.API_VERSION ?? 'v1',
}));
