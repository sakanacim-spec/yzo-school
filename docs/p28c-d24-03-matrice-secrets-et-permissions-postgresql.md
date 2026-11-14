# YZIOW P28c — Chantier D.2.4 (Volet 3)
# Matrice des Secrets et Cloisonnement PostgreSQL / Supabase (Étapes C & D)

> **Statut :** Document de préparation technique D.2.4 — **Aucun secret de production généré, aucune requête exécutée sur Supabase Production**.

---

## 1. Matrice de responsabilité et d'isolation des secrets (Étape C)

Le tableau suivant définit de manière normative quel composant est autorisé à détenir chaque secret ou identifiant, et quel composant a l'interdiction absolue d'y accéder :

| Nom de la variable / secret | Autorité WebAuthn Isolée (`webauthnAuthorityServer.js`) | Backend Applicatif YZIOW (Vercel) | Base PostgreSQL (Supabase) | Opérateur Sécurité Hors Bande (Propriétaire) | Usage et règles d'isolation strictes |
|---|---|---|---|---|---|
| `YZIOW_WEBAUTHN_AUTHORITY_SECRET` | **OUI (Exclusif en runtime)** | **JAMAIS** | **OUI** (Stocké uniquement dans `yziow_refund_auth.authority_config.secret_key`) | **OUI** (Provisionnement initial / rotation) | Clé HMAC-SHA256 (≥ 64 octets hex/base64url) signant les preuves `v1-superadmin-refund-action-proof`. **Ne doit jamais figurer dans Vercel.** |
| `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` | **OUI (Vérification)** | **JAMAIS** | **JAMAIS** | **OUI (Émission hors bande CLI)** | Clé HMAC-SHA256 (≥ 64 octets) dédiée uniquement à la signature/vérification des jetons `oob_bootstrap` lors du premier enrôlement. Désactivable/supprimable après l'enrôlement initial. |
| `YZIOW_AUTH_AUTHORITY_DATABASE_URL` | **OUI (Exclusif)** | **JAMAIS** | *(Cible : rôle `yziow_webauthn_authority`)* | **OUI** (Provisionnement) | Chaîne de connexion PostgreSQL utilisant exclusivement le rôle à privilèges minimaux `yziow_webauthn_authority`. |
| `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` | **OUI (Vérification Bearer)** | **OUI (Envoi Bearer)** | **JAMAIS** | **OUI** (Provisionnement) | Jeton d'authentification réseau inter-service (`Authorization: Bearer ...`, ≥ 48 octets aléatoires). Permet au backend d'appeler l'autorité, mais **ne donne aucun droit de fabriquer une preuve sans assertion matérielle WebAuthn**. |
| `YZIOW_REFUND_DATABASE_URL` | **JAMAIS** | **OUI (Exclusif)** | *(Cible : rôle `yziow_refund_executor`)* | **OUI** (Provisionnement) | Connexion PostgreSQL du backend pour appeler les RPC de rapprochement P28c. N'a aucun droit sur `yziow_refund_auth` ni sur `superadmin_webauthn_credentials`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **JAMAIS** | **OUI** | *(Cible : rôle `service_role` via PostgREST)* | **OUI** | Clé API Supabase du backend principal. Explicitement révoquée (`REVOKE ALL`) sur `yziow_refund_auth` et `superadmin_webauthn_credentials`. |
| `JWT_SECRET` | **JAMAIS** | **OUI** | **JAMAIS** | **OUI** | Secret de signature des sessions JWT applicatives du backend. L'autorité WebAuthn ne fait jamais confiance aux JWT du backend. |
| `DATABASE_URL` *(rôle propriétaire `postgres`)* | **JAMAIS** | **JAMAIS EN PRODUCTION / STAGING** | *(Rôle propriétaire `postgres`)* | **OUI** (Migrations hors bande uniquement) | **Exigence critique :** La chaîne de connexion du rôle propriétaire `postgres` ne doit **jamais** être configurée dans les variables d'environnement Vercel du backend, sinon un backend compromis pourrait contourner `REVOKE ALL` en se connectant comme propriétaire du schéma. |

---

## 2. Gouvernance des accès humains, journalisation, rotation et révocation

### 2.1 Séparation des accès humains à l'infrastructure
1. **Principe de non-recouvrement avec les accès de développement :**
   - Les développeurs ou intégrateurs ayant accès au projet Vercel `yzo-school` ne doivent **pas** disposer des droits de lecture des secrets sur l'hébergement de l'Autorité WebAuthn ni de l'accès SQL Superuser (`postgres`) sur Supabase Production.
   - Seul le propriétaire de YZIOW (avec authentification matérielle 2FA/FIDO2 activée sur le compte cloud de l'autorité et sur Supabase) peut lire ou modifier `YZIOW_WEBAUTHN_AUTHORITY_SECRET`, `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` et `yziow_refund_auth.authority_config`.

### 2.2 Politique de journalisation sans fuite (No-Secret Logging)
- Le serveur `webauthnAuthorityServer.js` ne journalise jamais :
  - les en-têtes `Authorization: Bearer ...` ;
  - les clés `YZIOW_WEBAUTHN_AUTHORITY_SECRET` et `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` ;
  - les valeurs brutes des jetons `oob_bootstrap` ou `enrollmentApprovalToken` ;
  - les signatures complètes des `actionProof` (seuls le `challenge_id`, le `credential_id`, le `period_id`, le `code` de résultat et l'horodatage peuvent être journalisés pour l'audit).

### 2.3 Rotation et révocation des secrets
1. **Rotation de `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` (trimestrielle ou sur suspicion) :**
   - Générer un nouveau jeton (≥ 48 octets), mettre à jour simultanément la variable sur l'autorité isolée et sur Vercel, puis redémarrer les deux services (coupure < 10 s en mode fail-closed).
2. **Rotation de `YZIOW_WEBAUTHN_AUTHORITY_SECRET` :**
   - Exécuter hors bande dans Supabase SQL Editor :
     `UPDATE yziow_refund_auth.authority_config SET secret_key = '<NOUVEAU_SECRET>', updated_at = clock_timestamp() WHERE id = true;`
   - Mettre à jour `YZIOW_WEBAUTHN_AUTHORITY_SECRET` sur le service d'autorité isolé et le redémarrer. Toute preuve émise avant la rotation et non encore consommée devient immédiatement invalide (`INVALID_ACTION_PROOF_SIGNATURE`).
3. **Neutralisation de `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` après amorçage :**
   - Dès que les deux SuperAdmins physiques ont enregistré leurs clés matérielles FIDO2/WebAuthn actives, la variable `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` peut être **supprimée (vidée)** de l'environnement du serveur d'autorité : tout futur remplacement de clé passera exclusivement par la co-autorisation matérielle WebAuthn (`enroll_approve`, `UP=1, UV=1`) de l'autre SuperAdmin.

---

## 3. Cloisonnement PostgreSQL et compatibilité Supabase (Étape D)

### 3.1 Matrice complète des permissions PostgreSQL
`Composant → Rôle → Ressource → Permission → Justification`

| Composant | Rôle PostgreSQL | Ressource SQL (Schéma / Table / Fonction) | Permission accordée / révoquée | Justification de sécurité |
|---|---|---|---|---|
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Schéma `yziow_refund_auth` | `GRANT USAGE` | Permet d'appeler les fonctions de gestion des challenges WebAuthn du schéma isolé. |
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Table `yziow_refund_auth.webauthn_challenges` et Table `yziow_refund_auth.consumed_enrollment_tokens` | `GRANT SELECT` *(uniquement)* ; `REVOKE INSERT, UPDATE, DELETE` | Permet à l'autorité de vérifier les challenges `enroll_approve` et les nonces consommés ; toute création ou consommation passe obligatoirement par les RPC `SECURITY DEFINER`. |
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Fonctions `yziow_refund_auth.store_webauthn_challenge`, `get_webauthn_challenge_for_update`, `consume_webauthn_challenge`, `consume_enrollment_approval_token`, `check_superadmin_active`, `inspect_authoritative_refund_dossier` | `GRANT EXECUTE` | Permet de créer/verrouiller/consommer les challenges (`1..300s`), de consommer atomiquement à usage unique les jetons `oob_bootstrap` et `hardware_co_auth`, et de contre-vérifier l'état réel du dossier dans PostgreSQL. |
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Table `public.superadmin_webauthn_credentials` | `GRANT SELECT, INSERT, UPDATE` ; `REVOKE DELETE, TRUNCATE` | Permet d'enregistrer une nouvelle clé publique vérifiée, de mettre à jour `sign_count` et de révoquer une clé (`is_active = false`), sans jamais pouvoir effacer l'historique d'audit (`DELETE` interdit). |
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Tables `yziow_refund_auth.authority_config` et `consumed_action_proofs` | `REVOKE ALL` | L'autorité n'a pas besoin de lire `authority_config` en SQL (elle détient sa propre clé en variable d'environnement) ni de modifier la table d'anti-rejeu des preuves finales. |
| **Autorité WebAuthn Isolée** | `yziow_webauthn_authority` | Tables financières (`payment_intents`, `parent_pack_subscriptions`, `parent_pack_refund_reconciliations`, `parent_pack_refund_security_gate`) et RPC de remboursement | `REVOKE ALL` | Si le serveur d'autorité était compromis, il ne pourrait déclencher aucun remboursement ni modifier la security gate. |
| **Backend Applicatif YZIOW** | `yziow_refund_executor` | RPC `public.admin_create_parent_pack_refund_reconciliation`, `admin_approve_parent_pack_refund_reconciliation`, `admin_get_parent_pack_refund_reconciliation` | `GRANT EXECUTE` | Permet au backend de soumettre une demande ou une approbation accompagnée d'une preuve signée par l'autorité, que PostgreSQL vérifie lui-même. |
| **Backend Applicatif YZIOW** | `yziow_refund_executor` | Schéma `yziow_refund_auth` (toutes tables et fonctions) & Table `public.superadmin_webauthn_credentials` | `REVOKE ALL` (`42501`) | Empêche un backend compromis de lire `secret_key`, d'injecter un challenge, de modifier une clé publique WebAuthn ou d'appeler directement `verify_and_consume_refund_action_proof`. |
| **Backend Applicatif YZIOW (PostgREST)** | `service_role`, `authenticated`, `anon`, `PUBLIC` | Schéma `yziow_refund_auth` (toutes tables et fonctions) & Table `public.superadmin_webauthn_credentials` | `REVOKE ALL` (`42501`) | Empêche absolument l'utilisation de `SUPABASE_SERVICE_ROLE_KEY` pour lire/modifier les clés WebAuthn, les challenges ou la configuration d'autorité. |
| **Moteur PostgreSQL interne** | Propriétaire (`postgres`) via `SECURITY DEFINER` | `yziow_refund_auth.verify_and_consume_refund_action_proof` | Appelable **uniquement** en interne par les 2 RPC `admin_create_...` et `admin_approve_...` (`REVOKE EXECUTE` pour tous les rôles applicatifs) | Vérifie en transaction atomique la signature HMAC, le challenge WebAuthn consommé (`UP=1, UV=1`), la clé publique active non révoquée et l'unicité anti-rejeu avant toute écriture de rapprochement. |

### 3.2 Compatibilité avec Supabase (Connexion directe vs Pooler Supavisor)
Dans `migration_p28c_parent_pack_refund.sql`, les rôles `yziow_webauthn_authority` et `yziow_refund_executor` sont créés avec `NOLOGIN` par défaut afin qu'aucune connexion ne soit active tant que l'infrastructure n'est pas provisionnée.

Lors de l'activation contrôlée sur un environnement Supabase :
1. **Activation du droit de connexion (`LOGIN`) et d'accès à la base (`CONNECT`) :**
   ```sql
   ALTER ROLE yziow_webauthn_authority WITH LOGIN PASSWORD '<MOT_DE_PASSE_FORT_SCRAM_SHA_256>';
   GRANT CONNECT ON DATABASE postgres TO yziow_webauthn_authority;
   ```
2. **Mode de connexion réseau vers Supabase :**
   - **Voie A — Pooler Supavisor en mode Session (Port `5432`, IPv4 compatible) :**
     - Format d'utilisateur requis par Supavisor : `yziow_webauthn_authority.<PROJECT_REF>`
     - Hôte : `aws-0-<region>.pooler.supabase.com:5432`
     - Avantage : Compatible avec tous les hébergeurs IPv4 (Cloud Run sans VPC IPv6, Railway, Fly.io).
     - Point de vérification obligatoire en Phase B : vérifier que l'instance Supavisor du projet Supabase authentifie bien le rôle personnalisé `yziow_webauthn_authority.<PROJECT_REF>`.
   - **Voie B — Connexion directe PostgreSQL (Port `5432`, IPv6 ou IPv4 Add-on) :**
     - Format d'utilisateur : `yziow_webauthn_authority`
     - Hôte : `db.<PROJECT_REF>.supabase.co:5432`
     - Avantage : Contourne totalement Supavisor et se connecte directement à PostgreSQL. Nécessite soit la connectivité sortante IPv6 sur l'hébergeur (disponible nativement sur Fly.io), soit l'option IPv4 Add-on sur Supabase.
