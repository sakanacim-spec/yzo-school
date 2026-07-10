# Guide de Séparation — SaaS vers Projet Supabase Dédié

> **Quand utiliser ce guide** : Quand Yziow passe en production à grande échelle et que la cohabitation avec le SaaS dans le même projet Supabase devient un risque (performances, isolation, facturation).

---

## Les 3 Mécanismes d'Isolation en Place

### 1. Préfixe `saas_` sur toutes les tables

```
saas_tenants          → Clients du SaaS
saas_organizations    → Organisations (écoles, agences…)
saas_profiles         → Profils utilisateurs
saas_roles            → Rôles RBAC
saas_user_roles       → Assignation user ↔ rôle
saas_notifications    → Notifications
saas_files            → Métadonnées des fichiers
```

→ **Aucun conflit** avec les tables Yziow existantes, identification visuelle immédiate.

---

### 2. Pattern Repository (couche d'abstraction DB)

```
SupabaseRepository<T> (abstrait)
├── TenantsRepository       → saas_tenants
├── OrganizationsRepository → saas_organizations
├── UsersRepository         → saas_profiles
├── RolesRepository         → saas_roles + saas_user_roles
├── NotificationsRepository → saas_notifications
└── FilesRepository         → saas_files + Storage bucket
```

**Les Services ne touchent jamais Supabase directement.**
→ Lors de la migration, seul le client injecté dans les repositories change.

---

### 3. Variables d'environnement dual-config

```env
# Actuellement : SAAS_* et SUPABASE_* pointent vers le même projet Yziow
SAAS_SUPABASE_URL=https://yziow-project.supabase.co
SAAS_SUPABASE_ANON_KEY=...
SAAS_SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Checklist de Migration (5 étapes, 0 réécriture de code)

### Étape 1 — Créer le projet Supabase SaaS dédié
Sur supabase.com → New Project → Region: Frankfurt (EU)

### Étape 2 — Exporter les tables saas_*
```bash
pg_dump --schema=public --table='saas_*' \
  "postgresql://postgres:password@db.yziow.supabase.co:5432/postgres" \
  > saas_export.sql
```

### Étape 3 — Importer dans le nouveau projet
```bash
npx supabase db push --project-ref <saas-project-ref>
# puis importer les données si nécessaire
```

### Étape 4 — Changer 3 variables d'environnement
```env
# C'est LA SEULE modification requise dans le code
SAAS_SUPABASE_URL=https://saas-platform.supabase.co     ← change
SAAS_SUPABASE_ANON_KEY=saas-anon-key                     ← change
SAAS_SUPABASE_SERVICE_ROLE_KEY=saas-service-role-key     ← change

# Yziow continue à utiliser SUPABASE_URL inchangé
SUPABASE_URL=https://yziow-project.supabase.co            ← inchangé
```

### Étape 5 — Redéployer
```bash
git push origin main  # → Render redéploie automatiquement
```

---

## Ce qui NE CHANGE PAS

| Composant | Statut |
|---|---|
| Code NestJS (services, controllers) | ✅ Inchangé |
| Repositories | ✅ Inchangés |
| API endpoints | ✅ Inchangés |
| CI/CD | ✅ Inchangé |
| Auth Supabase Yziow | ✅ Inchangé |

## Ce qui CHANGE

| Composant | Modification |
|---|---|
| `SAAS_SUPABASE_*` env vars | 3 nouvelles valeurs |
| Bucket Storage | Recréer `saas-files` dans le nouveau projet |
| RLS Policies | Réappliquer migration 002 |

---

## Risques et Mitigations

| Risque | Mitigation |
|---|---|
| Downtime | Migrer en read-only d'abord, switcher les env vars, puis écriture |
| Perte de données | Backup complet avant toute opération |
| Tokens JWT invalides | JWT Secret inchangé côté Yziow — tokens restent valides |
| Storage files | Copier bucket `saas-files` via AWS S3 CLI |
