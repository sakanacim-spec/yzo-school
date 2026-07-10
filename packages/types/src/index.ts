// ============================================================
// @saas/types — Types TypeScript partagés dans tout le monorepo
// ============================================================

// ── Tenant ────────────────────────────────────────────────────
export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  settings: TenantSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  modules: string[];
  branding?: {
    primaryColor?: string;
    logo?: string;
  };
  quotas?: {
    maxOrganizations?: number;
    maxUsersPerOrg?: number;
    maxStorageGb?: number;
  };
}

// ── Organization ─────────────────────────────────────────────
export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  address?: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── User / Profile ────────────────────────────────────────────
export type UserRole =
  | 'SAAS_SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'ORG_ADMIN'
  | 'ORG_STAFF'
  | 'USER';

export interface Profile {
  id: string;
  tenantId: string;
  orgId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  phone?: string;
  locale: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  tenant_id: string;
  org_id?: string;
  role: UserRole;
}

// ── Role ──────────────────────────────────────────────────────
export interface Role {
  id: string;
  tenantId: string;
  name: string;
  level: number;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
}

// ── Notification ─────────────────────────────────────────────
export type NotificationType = 'email' | 'in_app' | 'sms' | 'push';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  read: boolean;
  metadata: Record<string, unknown>;
  sentAt?: string;
  createdAt: string;
}

// ── File ──────────────────────────────────────────────────────
export interface FileRecord {
  id: string;
  tenantId: string;
  orgId?: string;
  uploadedBy?: string;
  storagePath: string;
  filename: string;
  mimeType?: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── API Response wrappers ─────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  timestamp: string;
  path?: string;
}
