# YZIOW P28c — Chantier D.2.5 (Volet 3)
# Préparation Supabase Staging, Rôles PostgreSQL, Secrets et Sécurité WebAuthn (`rpId` / `origin`)

> **Statut :** Dossier de planification stricte D.2.5 — **Aucun projet Supabase Staging créé, aucun secret de production généré, aucune migration exécutée sur la production**.
> **Références internes :** [migration_p28c_parent_pack_refund.sql](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/scripts/migration_p28c_parent_pack_refund.sql), [superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js), [webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js).

---

## 1. Architecture et Raccordement de Supabase Staging (Étape D)

### 1.1 Isolement strict vis-à-vis de la production et interdiction des données réelles
- Le projet Supabase de préproduction (`yziow-staging-db`) doit être un **projet Supabase entièrement distinct** du projet de production YZIOW.
- **Interdiction absolue de copie de production :** Aucun dump de la base de production, aucun élève réel, aucun parent réel, aucun numéro de téléphone réel, aucun identifiant de transaction FedaPay réel et aucun SuperAdmin réel ne doivent être importés dans Supabase Staging. Seules des données synthétiques créées par les scripts d'initialisation de test sont autorisées.

### 1.2 Mode de connexion réseau de Cloud Run vers Supabase Staging : Supavisor Session Mode (IPv4, Port `5432`) vs Connexion directe (IPv6)

Par défaut, un service Google Cloud Run sans VPC Connector dual-stack sort vers Internet en **IPv4 uniquement**, tandis que l'hôte direct Supabase (`db.<PROJECT_REF>.supabase.co`) résout uniquement en **IPv6** (sauf souscription à l'option payante *Dedicated IPv4 Add-on* à `$4 / mois`).

| Critère | **Voie recommandée : Pooler Supavisor Session Mode (IPv4, Port `5432`)** | Alternative : Connexion directe PostgreSQL (`db.<PROJECT_REF>.supabase.co:5432`) |
|---|---|---|
| **Protocole IP** | **IPv4 et IPv6 natifs** (compatible immédiatement avec Cloud Run sans surcoût réseau) | **IPv6 uniquement** par défaut (exige Direct VPC Egress dual-stack sur Cloud Run ou l'option payante IPv4 Add-on sur Supabase) |
| **Port TCP** | **`5432`** (Session Mode obligatoire ; ne pas utiliser le port `6543` Transaction Mode afin de préserver la sémantique complète des transactions et verrous de session) | `5432` |
| **Syntaxe exacte du nom d'utilisateur PostgreSQL** | **`yziow_webauthn_authority.<STAGING_PROJECT_REF>`** *(pour l'autorité)*<br>**`yziow_refund_executor.<STAGING_PROJECT_REF>`** *(pour le backend Vercel)* | `yziow_webauthn_authority`<br>`yziow_refund_executor` |
| **Hôte** | `aws-0-<REGION>.pooler.supabase.com` (ex. `aws-0-eu-west-3.pooler.supabase.com` ou `aws-0-eu-central-1.pooler.supabase.com`) | `db.<STAGING_PROJECT_REF>.supabase.co` |
| **Format complet de `YZIOW_AUTH_AUTHORITY_DATABASE_URL`** | `postgres://yziow_webauthn_authority.<STAGING_PROJECT_REF>:<URL_ENCODED_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=verify-full` | `postgres://yziow_webauthn_authority:<URL_ENCODED_PASSWORD>@db.<STAGING_PROJECT_REF>.supabase.co:5432/postgres?sslmode=verify-full` |

> **Confirmation documentaire Supabase :** En mode Supavisor (`*.pooler.supabase.com`), tout rôle PostgreSQL personnalisé doit impérativement être suffixé par `.<PROJECT_REF>` dans le champ utilisateur de l'URI (`[custom_role].[project_ref]`), afin que le routeur multi-locataire Supavisor identifie l'instance PostgreSQL cible avant de déléguer l'authentification SCRAM-SHA-256 du rôle personnalisé.

### 1.3 Chiffrement TLS et vérification du certificat serveur
- Toute connexion entre Cloud Run (`sa-webauthn-authority-run`) et Supabase Staging doit imposer **TLS 1.2 / 1.3 avec validation du certificat serveur** (`sslmode=verify-full` accompagné du certificat racine *Supabase Root CA* monté dans le conteneur ou inclus dans `NODE_EXTRA_CA_CERTS`).
- Ne jamais utiliser `ssl: { rejectUnauthorized: false }` en préproduction ou en production afin d'empêcher toute attaque de type *Man-in-the-Middle* entre le conteneur et le pooler PostgreSQL.

---

## 2. Cloisonnement SQL, Fonctions `SECURITY DEFINER` et Limites de Connexion

### 2.1 Séparation des identifiants de migration et d'exécution

| Type d'identifiant | Rôle PostgreSQL | Où est-il utilisé ? | Présent dans Cloud Run ? | Présent dans Vercel ? |
|---|---|---|---|---|
| **Administration & Migration SQL** | `postgres` (propriétaire des tables et fonctions `SECURITY DEFINER`) | Uniquement hors bande par le propriétaire lors de l'application initiale des migrations SQL | **JAMAIS** | **JAMAIS** |
| **Exécution Autorité WebAuthn** | `yziow_webauthn_authority` | Exclusivement dans `YZIOW_AUTH_AUTHORITY_DATABASE_URL` sur Cloud Run | **OUI (Exclusif)** | **JAMAIS** |
| **Exécution RPC Rapprochement Backend** | `yziow_refund_executor` | Exclusivement dans `YZIOW_REFUND_DATABASE_URL` sur Vercel | **JAMAIS** | **OUI (Exclusif)** |
| **API Applicative Courante** | `service_role` / `authenticated` / `anon` | Dans `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` sur Vercel | **JAMAIS** | **OUI** |

### 2.2 Contrôle strict des fonctions `SECURITY DEFINER` et des tables

Conformément à [migration_p28c_parent_pack_refund.sql](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/scripts/migration_p28c_parent_pack_refund.sql) :
1. **Durcissement `search_path` :** Toutes les fonctions `SECURITY DEFINER` du schéma `yziow_refund_auth` et du schéma `public` fixent explicitement `SET search_path = public, pg_temp` ou `SET search_path = yziow_refund_auth, public, pg_temp`, empêchant tout détournement d'objet SQL.
2. **Droits exclusifs de `yziow_webauthn_authority` :**
   - `USAGE` sur le schéma `yziow_refund_auth`.
   - `SELECT` uniquement sur `yziow_refund_auth.webauthn_challenges` et `yziow_refund_auth.consumed_enrollment_tokens` (aucun `INSERT/UPDATE/DELETE` direct sur ces tables).
   - `EXECUTE` uniquement sur les 6 fonctions :
     - `yziow_refund_auth.store_webauthn_challenge` (impose `p_validity_seconds BETWEEN 1 AND 300`, `p_rp_id` et `p_origin` non vides, et vérifie que `p_admin_id` est un SuperAdmin actif).
     - `yziow_refund_auth.get_webauthn_challenge_for_update` (verrouillage pessimiste `FOR UPDATE`).
     - `yziow_refund_auth.consume_webauthn_challenge` (consommation atomique à usage unique).
     - `yziow_refund_auth.consume_enrollment_approval_token` (insertion atomique du nonce dans `consumed_enrollment_tokens` pour empêcher tout rejeu d'`oob_bootstrap` ou d'`enrollment_approval` même après redémarrage du conteneur).
     - `yziow_refund_auth.check_superadmin_active`.
     - `yziow_refund_auth.inspect_authoritative_refund_dossier` (lecture directe de l'état de référence dans `parent_subscription_periods`, `payment_intents` et `parent_pack_refund_reconciliations`).
   - `SELECT, INSERT, UPDATE` sur `public.superadmin_webauthn_credentials` (`DELETE` et `TRUNCATE` révoqués).
3. **Permissions interdites au backend (`yziow_refund_executor` et `service_role`) :**
   - `REVOKE ALL` sur le schéma `yziow_refund_auth`, sur toutes ses tables (`authority_config`, `webauthn_challenges`, `consumed_action_proofs`, `consumed_enrollment_tokens`), sur toutes ses fonctions et sur `public.superadmin_webauthn_credentials`.
   - Même un backend totalement compromis détenant `SUPABASE_SERVICE_ROLE_KEY` et `YZIOW_REFUND_DATABASE_URL` reçoit `ERROR 42501 (permission denied)` s'il tente de lire `secret_key`, d'injecter un challenge, de modifier une clé publique WebAuthn ou d'appeler `verify_and_consume_refund_action_proof`.

### 2.3 Dimensionnement du pool de connexions et résilience PostgreSQL
- Dans [superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L113-L117), `authorityPool` est configuré avec `max: 10` et `idleTimeoutMillis: 5000`.
- Avec `max-instances = 2` (ou `1` en préproduction) sur Cloud Run, l'empreinte maximale de l'autorité sur Supavisor Session Mode ne dépasse jamais `10` à `20` connexions simultanées, bien en deçà de la limite Supavisor Session Mode (60 connexions sur le plan Free/Pro standard), laissant toute la marge nécessaire au reste de l'application.
- **Comportement en cas d'indisponibilité de PostgreSQL :** Si Supabase Staging est injoignable ou saturé, `inspectAuthoritativeRefundDossier` et les fonctions de challenge échouent immédiatement sans émettre de preuve, et les transactions en cours exécutent `ROLLBACK` avant de libérer le client (`client.release()`). Aucun remboursement ni enregistrement de clé ne peut aboutir hors base.

---

## 3. Inventaire Exact des Variables d'Environnement et Secrets (Étape E)

Le tableau suivant répertorie **exclusivement les noms exacts de variables** réellement lus par le code publié au commit `9adc23b04a05058216ef6ff0b90712d4fe6b71aa` :

| Nom exact dans le code | Composant détenteur | Source d'injection | Portée | Sensibilité | Politique de rotation / cycle de vie |
|---|---|---|---|---|---|
| `YZIOW_WEBAUTHN_AUTHORITY_SECRET` | **Cloud Run uniquement** (`webauthnAuthorityServer.js`) + table SQL `yziow_refund_auth.authority_config.secret_key` | Google Secret Manager (`yziow-webauthn-authority-secret`, version épinglée) | Préproduction (distinct de la prod) | **CRITIQUE (Secret de signature HMAC-SHA256 ≥ 64 octets)** | Rotation trimestrielle ou immédiate sur incident : mise à jour atomique dans `yziow_refund_auth.authority_config` puis déploiement d'une nouvelle version Secret Manager sur Cloud Run. |
| `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` | **Cloud Run uniquement** (uniquement pendant l'enrôlement initial) + CLI hors bande du propriétaire | Google Secret Manager (`yziow-webauthn-bootstrap-secret`, version épinglée) | Cérémonie initiale uniquement | **CRITIQUE (Secret d'amorçage TOFU ≥ 64 octets)** | **Éphémère :** Supprimé de la configuration Cloud Run et version Secret Manager désactivée (`disable`) **immédiatement après** l'enrôlement du premier SuperAdmin. |
| `YZIOW_AUTH_AUTHORITY_DATABASE_URL` | **Cloud Run uniquement** (`webauthnAuthorityServer.js` / `superAdminWebAuthnAuthority.js`) | Google Secret Manager (`yziow-auth-authority-db-url`, version épinglée) | Préproduction (Supabase Staging) | **ÉLEVÉE (Identifiants SQL `yziow_webauthn_authority`)** | Rotation semestrielle : `ALTER ROLE yziow_webauthn_authority WITH PASSWORD '...'` dans Supabase Staging puis nouvelle version Secret Manager. |
| `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` | **Cloud Run** (vérification Bearer) **ET Vercel** (envoi Bearer) | Secret Manager sur Cloud Run + Variable chiffrée `Sensitive` sur Vercel Preview | Inter-service Préproduction | **ÉLEVÉE (Jeton Bearer ≥ 48 octets)** | Rotation trimestrielle : génération d'un nouveau jeton, mise à jour dans Secret Manager et Vercel, redéploiement simultané (< 10 s fail-closed). |
| `YZIOW_REFUND_DATABASE_URL` | **Vercel uniquement** ([refundRpc.cjs](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/refundRpc.cjs#L4)) | Variable chiffrée `Sensitive` sur Vercel Preview | Préproduction (Supabase Staging) | **ÉLEVÉE (Identifiants SQL `yziow_refund_executor`)** | Rotation semestrielle via `ALTER ROLE yziow_refund_executor WITH PASSWORD '...'` et mise à jour Vercel. |
| `WEBAUTHN_RP_ID` | **Cloud Run** ([superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L43)) | Variable d'environnement Cloud Run | Préproduction | Publique (Intégrité critique) | Fixée au domaine Relying Party exact de préproduction (ex. `staging.yziow.com`). |
| `WEBAUTHN_ORIGIN` | **Cloud Run** ([superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L44)) | Variable d'environnement Cloud Run | Préproduction | Publique (Intégrité critique) | Fixée à l'origine HTTPS exacte de préproduction (ex. `https://staging.yziow.com`). |
| `PORT` *(ou `YZIOW_WEBAUTHN_AUTHORITY_PORT`)* | **Cloud Run** ([webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L93-L98)) | Injecté automatiquement par Cloud Run (`PORT=8080`) | Conteneur Cloud Run | Non sensible | Fixé à `8080`. |
| `YZIOW_WEBAUTHN_AUTHORITY_HOST` | **Cloud Run** *(optionnel)* ([webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L106-L116)) | Variable d'environnement Cloud Run | Conteneur Cloud Run | Non sensible | Par défaut `0.0.0.0` automatiquement dès que `K_SERVICE`, `PORT` ou `NODE_ENV=staging` est présent. |
| `YZIOW_WEBAUTHN_AUTHORITY_URL` | **Vercel uniquement** ([webauthnAuthorityClient.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/webauthnAuthorityClient.js#L28)) | Variable d'environnement Vercel Preview | Préproduction | Interne | URL HTTPS du service Cloud Run `yziow-webauthn-authority-stg` (sans slash final). |
| `YZIOW_ENFORCE_EXTERNAL_AUTHORITY` | **Vercel uniquement** ([webauthnAuthorityClient.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/webauthnAuthorityClient.js#L29)) | Variable d'environnement Vercel Preview | Préproduction & Production | Non sensible (Intégrité) | Toujours fixée à `'true'`. |
| `YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION` | **Vercel uniquement** ([refundActionProofAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/refundActionProofAuthority.js#L265)) | Variable d'environnement Vercel Preview | Préproduction & Production | Non sensible (Intégrité) | Toujours fixée à `'true'`. |

---

## 4. Analyse de Sécurité sur le Contrôle de `rpId` et `origin` (Étape E — Point de Durcissement Pré-Déploiement Identifié)

### 4.1 Constat sur le code actuel (`9adc23b04a05058216ef6ff0b90712d4fe6b71aa`)

L'audit du code publié dans [backend/authority/webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L181-L302) et [backend/services/superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L902-L903) met en évidence le comportement suivant :

1. Dans `superAdminWebAuthnAuthority.js` (lignes 43–44) :
   ```javascript
   const DEFAULT_RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
   const DEFAULT_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
   ```
2. Dans `webauthnAuthorityServer.js`, les 6 endpoints WebAuthn (`/v1/credentials/register/challenge`, `/v1/credentials/enroll-approval/challenge`, `/v1/credentials/enroll-approval/confirm`, `/v1/credentials/register/verify`, `/v1/actions/challenge`, `/v1/actions/confirm`) transmettent directement `rpId: body.rpId` et `origin: body.origin` issus du corps JSON envoyé par le backend appelant.
3. Dans `superAdminWebAuthnAuthority.js`, les fonctions utilisent `const rpId = options.rpId || DEFAULT_RP_ID` (ou la valeur par défaut d'argument `rpId = DEFAULT_RP_ID` lorsque `body.rpId` vaut `undefined`).
4. En outre, dans `verifyWebAuthnAssertion` ([superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L1721-L1743)) et `verifyAndRegisterCredential` ([L1093-L1110](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js#L1093-L1110)), la vérification de l'origine et du RP ID compare `parsedClientData.origin` et `rpIdHash` aux paramètres `expectedOrigin` / `expectedRpId` reçus lors de l'appel HTTP, sans imposer qu'ils soient égaux à la fois aux variables `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` configurées sur l'autorité **et** aux colonnes `challengeRecord.rp_id` / `challengeRecord.origin` persistées dans PostgreSQL lors de la création du challenge.

### 4.2 Risque en cas de compromission totale du backend

Si le backend Vercel est totalement compromis :
- Pour un SuperAdmin possédant déjà une clé FIDO2 enregistrée sur le vrai domaine `yziow.com`, un `rpId` falsifié (`attacker.com`) ne permettrait pas de signer avec cette clé (car le navigateur et la clé FIDO2 lient matériellement la paire de clés au `rpId` d'origine).
- **En revanche**, lors d'une opération d'enrôlement ou si un backend compromis tente d'induire un SuperAdmin à utiliser une clé sur un domaine contrôlé par l'attaquant en passant `body.rpId = "evil.example"` et `body.origin = "https://evil.example"` à la fois à `/challenge` et à `/verify`, l'autorité actuelle accepterait ce `rpId` et cet `origin` arbitraires au lieu de les rejeter !
- De même, l'endpoint `/v1/credentials/revoke` ([webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L253-L256)) permettrait à un backend compromis de révoquer unilatéralement les clés actives des SuperAdmins (déni de service nécessitant une nouvelle cérémonie hors bande).

### 4.3 Prérequis de durcissement applicatif consigné avant déploiement Cloud Run

Conformément aux consignes de l'Étape E (*« Si le code nécessite un durcissement, le consigner dans les prérequis de sécurité avant déploiement. Ne pas apporter de modification applicative non demandée dans ce chantier documentaire »*), les 3 durcissements suivants sont consignés comme **prérequis obligatoires avant le déploiement effectif sur Cloud Run** :

1. **Verrouillage autoritaire de `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` dans `webauthnAuthorityServer.js` et `superAdminWebAuthnAuthority.js` :**
   - Lorsque `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` sont définis dans l'environnement du serveur d'autorité (obligatoire hors mode test jetable), `webauthnAuthorityServer.js` doit rejeter avec `403 INVALID_RP_ID` / `403 INVALID_ORIGIN` toute requête dont `body.rpId` ou `body.origin` diffère de la configuration de l'autorité, et `verifyAndRegisterCredential` / `verifyWebAuthnAssertion` doivent vérifier en plus la concordance exacte avec `challengeRecord.rp_id` et `challengeRecord.origin` lus dans PostgreSQL.
2. **Protection de `/v1/credentials/revoke` :**
   - Exiger une co-autorisation matérielle WebAuthn ou désactiver l'exposition HTTP de `/v1/credentials/revoke` au backend applicatif (la révocation d'urgence s'effectuant soit automatiquement lors d'un remplacement co-autorisé dans `verifyAndRegisterCredential`, soit hors bande par le propriétaire).
3. **Configuration explicite de la vérification TLS PostgreSQL (`sslmode=verify-full`) et de l'arrêt gracieux `SIGTERM` :**
   - Intercepter `SIGTERM` dans `webauthnAuthorityServer.js` pour appeler `instance.close()` lors du scale-down Cloud Run.

---

## 5. Références Officielles

- Supabase Docs — Connecting to Postgres & Supavisor Session Mode (port 5432) : https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Docs — Custom Postgres Roles with Supavisor (`role.project_ref`) : https://supabase.com/docs/guides/database/postgres/roles
- W3C WebAuthn Level 2 — Relying Party ID and Origin Verification : https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion
