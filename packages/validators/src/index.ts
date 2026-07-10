import { z } from 'zod';

// ── UUID ───────────────────────────────────────────────────────
export const uuidSchema = z.string().uuid('UUID invalide');

// ── Pagination ────────────────────────────────────────────────
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Tenant ────────────────────────────────────────────────────
export const tenantSlugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets');

export const createTenantSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().min(2).max(200),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional().default('free'),
});

// ── Organization ─────────────────────────────────────────────
export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

// ── Auth ──────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantId: uuidSchema.optional(),
  role: z.string().optional().default('USER'),
});

// ── Notification ─────────────────────────────────────────────
export const sendNotificationSchema = z.object({
  userId: uuidSchema,
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  type: z.enum(['email', 'in_app', 'sms', 'push']).optional().default('in_app'),
  metadata: z.record(z.unknown()).optional().default({}),
});

// ── File ──────────────────────────────────────────────────────
export const createUploadUrlSchema = z.object({
  orgId: uuidSchema,
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024), // max 50MB
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;
