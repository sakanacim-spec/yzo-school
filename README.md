# SaaS Platform API — Monorepo

> **Plateforme SaaS d'API Modulaire B2B** · Multi-tenant · Enterprise-ready

[![CI](https://github.com/your-org/saas-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/saas-platform/actions)

---

## Vue d'ensemble

Ce monorepo contient l'intégralité du SaaS d'API modulaire B2B. La plateforme permet à des entreprises clientes (tenants) de consommer des API métier via un système de modules activables à la carte.

**Premier client** : [Yziow](https://yziow.com) — plateforme de gestion d'établissements scolaires.

---

## Structure du monorepo

```
saas-platform/
├── apps/
│   ├── api/              # NestJS — API principale (port 3000)
│   ├── admin/            # Next.js — Admin Portal (port 3001)
│   └── docs/             # Next.js — Developer Portal (port 3002)
├── packages/
│   ├── types/            # Types TypeScript partagés
│   ├── validators/       # Zod schemas partagés
│   └── utils/            # Helpers communs
├── supabase/
│   ├── migrations/       # SQL migrations versionnées
│   └── seed.sql          # Données de test
├── .github/workflows/    # CI/CD GitHub Actions
├── render.yaml           # Infrastructure Render
├── turbo.json            # Config Turborepo
└── pnpm-workspace.yaml   # Config workspace pnpm
```

---

## Stack Technique

| Couche | Technologie |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework API | NestJS 10 (Fastify) |
| Base de données | PostgreSQL via Supabase (EU) |
| Auth | Supabase Auth (JWT + OAuth) |
| Storage | Supabase Storage (S3-compatible) |
| Email | Resend |
| Monorepo | Turborepo + pnpm workspaces |
| CI/CD | GitHub Actions → Render |
| Hosting | Render (Frankfurt, EU) |

---

## Démarrage rapide

### Prérequis
- Node.js 20+
- pnpm 11+
- Compte Supabase (gratuit)

### Installation

```bash
# Cloner le repo
git clone https://github.com/your-org/saas-platform.git
cd saas-platform

# Installer les dépendances
pnpm install

# Configurer l'environnement
cp .env.example apps/api/.env
# → Remplir les valeurs Supabase dans apps/api/.env
```

### Base de données

```bash
# Appliquer les migrations sur votre projet Supabase
npx supabase db push

# Insérer les données de développement
npx supabase db seed
```

### Lancer en développement

```bash
# Démarrer tous les services en parallèle
pnpm dev

# Ou individuellement :
pnpm --filter @saas/api dev        # API sur :3000
pnpm --filter @saas/admin dev      # Admin sur :3001
```

### Documentation API

Une fois l'API démarrée, la documentation Swagger est disponible sur :
```
http://localhost:3000/docs
```

---

## Modules Disponibles (MVP)

| Module | Endpoint | Description |
|---|---|---|
| **AUTH** | `/v1/auth/*` | Inscription, login, refresh, logout |
| **TENANTS** | `/v1/tenants/*` | Gestion des clients SaaS (super admin) |
| **ORGANIZATIONS** | `/v1/organizations/*` | Gestion des organisations (ex: écoles) |
| **USERS** | `/v1/users/*` | Profils utilisateurs |
| **ROLES** | `/v1/roles/*` | RBAC — rôles et permissions |
| **NOTIFICATIONS** | `/v1/notifications/*` | Email, in-app notifications |
| **FILES** | `/v1/files/*` | Upload et gestion des fichiers |

---

## Variables d'environnement

Voir [`.env.example`](.env.example) pour la liste complète.

Les variables minimales requises :
```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
```

---

## Architecture Multi-Tenant

Chaque requête est automatiquement scopée au tenant de l'utilisateur via :
1. **JWT custom claims** : `app_metadata.tenant_id` injecté par Supabase Auth
2. **PostgreSQL RLS** : Row Level Security active sur toutes les tables
3. **Middleware** : `TenantResolverMiddleware` injecte `req.tenantId`

---

## Déploiement

Le déploiement est automatique via GitHub Actions :
- **Push sur `develop`** → staging
- **Push sur `main`** → production (Render EU + migrations Supabase)

Voir [`.github/workflows/`](.github/workflows/) et [`render.yaml`](render.yaml).

---

## Licence

Propriétaire — Tous droits réservés.
