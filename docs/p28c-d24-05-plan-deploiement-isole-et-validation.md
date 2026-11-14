# YZIOW P28c — Chantier D.2.4 (Volet 5)
# Plan de Déploiement Isolé, de Validation et de Retour à l'État Sécurisé (Étape F)

> **Statut :** Plan d'exécution préparatoire D.2.4 — **Phases B et C strictement interdites sans nouvelle autorisation explicite du propriétaire**.

---

## 1. Découpage en trois phases séparées par des portes d'autorisation

| Phase | Périmètre | Statut actuel | Autorisation requise |
|---|---|---|---|
| **Phase A — Préparation locale et documentaire** | Code D.2.3 validé (`203/203 PASS`), matrices des secrets/rôles, procédures et plans D.2.4 dans `docs/`. | **TERMINÉE** | Couverte par D.2.3 / D.2.4 |
| **Phase B — Validation sur infrastructure isolée non productive (Staging)** | Déploiement de `webauthnAuthorityServer.js` sur un conteneur isolé de test + base PostgreSQL/Supabase de pré-production (hors production). | **NON EXÉCUTÉE** | **Autorisation explicite du propriétaire requise après choix de l'hébergeur** |
| **Phase C — Mise en production future de l'autorité WebAuthn** | Déploiement de l'autorité de production, enrôlement matériel des 2 SuperAdmins réels, sans activer les remboursements tant que FedaPay certifié et WORM privé ne sont pas prêts. | **BLOQUÉE (`READY_FOR_PRODUCTION = NO`)** | **Autorisation explicite distincte + achèvement des chantiers FedaPay et WORM** |

---

## 2. Phase A — Préparation locale (Accomplie)

1. Serveur autonome `backend/authority/webauthnAuthorityServer.js` et client sans clé `backend/services/webauthnAuthorityClient.js` publiés sur `feat/p28c-parent-pack-refund` (commit `7f70fd2c5fba4e728c191546e3635b241767f48a`).
2. Rôles SQL `yziow_webauthn_authority` et `yziow_refund_executor` définis avec privilèges minimaux dans `backend/scripts/migration_p28c_parent_pack_refund.sql`.
3. Vérification en CI GitHub Actions (run `43607819616` : `SUCCESS`).

---

## 3. Phase B — Procédure de déploiement et de validation sur infrastructure isolée non productive (À exécuter uniquement après autorisation)

### Étape B.1 — Prérequis d'hébergement et conteneurisation de l'autorité
1. Créer un projet/espace dédié à l'autorité sur l'hébergeur retenu (ex. projet GCP dédié pour Cloud Run ou organisation Fly.io dédiée), accessible uniquement au compte du propriétaire protégé par MFA matériel.
2. Construire une image conteneur minimale (Node.js 22 LTS Alpine, utilisateur non-root `node`) incluant uniquement :
   - `backend/authority/webauthnAuthorityServer.js` (écoute sur `0.0.0.0` et `process.env.PORT`)
   - `backend/services/superAdminWebAuthnAuthority.js`
   - `backend/services/refundActionProofAuthority.js`
   - `package.json` / `package-lock.json` avec `@simplewebauthn/server` et `pg` déclarés dans `dependencies` de production.
   - Commande de démarrage : `node backend/authority/webauthnAuthorityServer.js`.
3. Configurer le service conteneur avec :
   - Plafond de connexions PostgreSQL maîtrisé (`max-instances = 1` recommandé pour limiter l'empreinte de connexions `pg`, tandis que l'anti-rejeu des jetons `oob_bootstrap` / `enrollment_approval` est garanti de façon persistante dans `yziow_refund_auth.consumed_enrollment_tokens`).
   - HTTPS obligatoire (TLS 1.2/1.3).

### Étape B.2 — Configuration PostgreSQL sur la base de pré-production (hors production)
1. Appliquer `backend/scripts/migration_p28c_parent_pack_refund.sql` sur la base de pré-production isolée.
2. Activer les deux rôles applicatifs avec des mots de passe distincts à haute entropie (SCRAM-SHA-256) :
   ```sql
   ALTER ROLE yziow_webauthn_authority WITH LOGIN PASSWORD '<SECRET_DB_AUTHORITY_STAGING>';
   GRANT CONNECT ON DATABASE postgres TO yziow_webauthn_authority;

   ALTER ROLE yziow_refund_executor WITH LOGIN PASSWORD '<SECRET_DB_EXECUTOR_STAGING>';
   GRANT CONNECT ON DATABASE postgres TO yziow_refund_executor;
   ```
3. Configurer la clé de signature d'autorité dans `yziow_refund_auth.authority_config` :
   ```sql
   UPDATE yziow_refund_auth.authority_config
   SET secret_key = '<SECRET_HMAC_AUTHORITY_STAGING>',
       require_webauthn_confirmation = true,
       updated_at = clock_timestamp()
   WHERE id = true;
   ```
4. Vérifier que les trois drapeaux de `public.parent_pack_refund_security_gate` restent à `false`.

### Étape B.3 — Configuration des variables d'environnement (Noms uniquement)

#### Sur le service isolé de l'Autorité WebAuthn :
| Variable | Description |
|---|---|
| `NODE_ENV` | `staging` (en Phase B) ou `production` (en Phase C) |
| `YZIOW_WEBAUTHN_AUTHORITY_PORT` | Port TCP d'écoute du conteneur (ex. `8080`) |
| `YZIOW_WEBAUTHN_AUTHORITY_SECRET` | Secret HMAC-SHA256 identique à `yziow_refund_auth.authority_config.secret_key` |
| `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` | Secret HMAC-SHA256 hors bande (présent uniquement pendant la cérémonie d'enrôlement initial, puis supprimé) |
| `YZIOW_AUTH_AUTHORITY_DATABASE_URL` | URI PostgreSQL utilisant le rôle `yziow_webauthn_authority` (via Supavisor Session `:5432` ou connexion directe IPv6) |
| `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` | Jeton Bearer partagé pour authentifier les requêtes HTTP entrantes du backend YZIOW |
| `YZIOW_WEBAUTHN_RP_ID` | Domaine Relying Party WebAuthn (ex. `staging.yziow.com` en Phase B, `yziow.com` en Phase C) |
| `YZIOW_WEBAUTHN_ORIGIN` | Origine HTTPS exacte (ex. `https://staging.yziow.com` en Phase B, `https://yziow.com` en Phase C) |

#### Sur le Backend Applicatif YZIOW (Vercel) :
| Variable | Description |
|---|---|
| `YZIOW_WEBAUTHN_AUTHORITY_URL` | URL HTTPS interne/privée du service d'autorité isolé (sans slash final) |
| `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` | Jeton Bearer d'appel vers l'autorité |
| `YZIOW_ENFORCE_EXTERNAL_AUTHORITY` | `true` |
| `YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION` | `true` |
| `YZIOW_REFUND_DATABASE_URL` | URI PostgreSQL utilisant le rôle `yziow_refund_executor` |

> **Contrôle négatif impératif sur Vercel :** Vérifier que `YZIOW_WEBAUTHN_AUTHORITY_SECRET`, `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET`, `YZIOW_AUTH_AUTHORITY_DATABASE_URL` et `DATABASE_URL` (rôle `postgres`) sont **totalement absents** des variables d'environnement Vercel.

### Étape B.4 — Protocole de tests de validation sur l'environnement isolé (Recette Phase B)
1. **Test 1 — Connectivité et authentification inter-services :**
   - `GET /v1/health` répond `200 OK` (`{"status":"ok","authority":"yziow-refund-auth-authority"}`).
   - `POST /v1/actions/challenge` sans en-tête `Authorization: Bearer ...` ou avec un mauvais jeton répond `401 UNAUTHORIZED_BACKEND_CALLER`.
2. **Test 2 — Enrôlement initial hors bande et co-autorisation matérielle :**
   - Avec `0` clé en base, tentative d'appel `POST /v1/credentials/register/verify` avec `requireEnrollmentApproval: false` → rejet `403 ENROLLMENT_CO_AUTHORIZATION_REQUIRED`.
   - Enrôlement du SuperAdmin de test #1 avec un jeton `oob_bootstrap` lié à son `credentialId` → succès `200 OK`.
   - Enrôlement du SuperAdmin de test #2 co-autorisé par la clé matérielle du SuperAdmin #1 (`enroll_approve`, `UP=1, UV=1`) → succès `200 OK`.
   - Suppression de `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` sur l'autorité.
3. **Test 3 — Simulation de compromission du backend :**
   - Depuis l'environnement du backend, tenter de générer une preuve locale (`generateRefundActionProof`) → échec `AUTHORITY_SECRET_NOT_CONFIGURED`.
   - Tenter d'appeler l'autorité avec un montant ou `providerTransactionId` altéré → rejet `403 AUTHORITATIVE_DOSSIER_MISMATCH` par `inspect_authoritative_refund_dossier`.
   - Tenter de lire `yziow_refund_auth.authority_config` ou d'insérer dans `public.superadmin_webauthn_credentials` via `YZIOW_REFUND_DATABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` → rejet PostgreSQL `42501 (insufficient_privilege)`.
4. **Test 4 — Arrêt de l'autorité (Fail-Closed) :**
   - Stopper le conteneur de l'autorité WebAuthn et déclencher une demande de rapprochement sur le backend → rejet immédiat `503 AUTHORITY_UNAVAILABLE` sans aucun fallback local.
5. **Test 5 — Maintien du verrouillage financier (`SECURITY_BLOCKER`) :**
   - Vérifier qu'une initiation par SuperAdmin #1 suivie d'une approbation par SuperAdmin #2 avec deux vraies clés matérielles aboutit bien au refus `SECURITY_BLOCKER` tant que les 3 drapeaux de `parent_pack_refund_security_gate` sont à `false`.

---

## 4. Supervision, journalisation et alertes

1. **Événements donnant lieu à une alerte immédiate au propriétaire :**
   - Toute réponse `401 UNAUTHORIZED_BACKEND_CALLER` sur l'autorité (tentative d'accès réseau non autorisé ou jeton désynchronisé).
   - Tout rejet `AUTHORITATIVE_DOSSIER_MISMATCH`, `DUAL_CUSTODY_VIOLATION`, `SIGN_COUNT_REGRESSION_DETECTED` ou `BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED`.
   - Tout enregistrement (`INSERT`) ou révocation (`UPDATE is_active = false`) dans `public.superadmin_webauthn_credentials`.
   - Toute indisponibilité de `GET /v1/health` pendant plus de 60 secondes.

---

## 5. Procédure de révocation et de retour immédiat à l'état sécurisé (Rollback / Kill-Switch)

En cas d'anomalie ou de suspicion d'incident sur l'environnement isolé ou futur :
1. **Coupe-circuit réseau immédiat (< 30 s) :**
   - Stopper le conteneur `webauthnAuthorityServer.js` (ou révoquer `YZIOW_BACKEND_TO_AUTHORITY_TOKEN`). Le backend YZIOW passe instantanément en rejet `503 AUTHORITY_UNAVAILABLE` (fail-closed).
2. **Coupe-circuit base de données (< 30 s) :**
   ```sql
   -- 1. Maintenir ou forcer la fermeture des 3 drapeaux de la security gate
   UPDATE public.parent_pack_refund_security_gate
   SET independent_admin_auth_ready = false,
       independent_fedapay_proof_ready = false,
       private_worm_storage_ready = false,
       updated_at = clock_timestamp()
   WHERE id = true;

   -- 2. Désactiver la connexion réseau des rôles dédiés si nécessaire
   ALTER ROLE yziow_webauthn_authority NOLOGIN;
   ALTER ROLE yziow_refund_executor NOLOGIN;
   ```
3. **Invalider toutes les preuves en circulation :**
   - Remplacer `yziow_refund_auth.authority_config.secret_key` par une nouvelle valeur aléatoire de 64 octets.

---

## 6. Phase C — Conditions cumulatives strictes avant toute mise en production future

Aucune activation financière en production (`READY_FOR_PRODUCTION = YES`) ne pourra avoir lieu tant que **toutes** les conditions suivantes ne seront pas réunies et validées par écrit par le propriétaire :
1. Validation complète de la **Phase B** sur l'infrastructure isolée non productive.
2. Déploiement de l'autorité WebAuthn de production dans un compte/projet cloud isolé et cérémonie d'enrôlement matériel des deux SuperAdmins physiques.
3. Achèvement et validation du chantier de **preuve fournisseur FedaPay indépendante certifiée** (`independent_fedapay_proof_ready`).
4. Achèvement et validation du chantier de **stockage privé immuable WORM** (`private_worm_storage_ready`).
5. Autorisation écrite explicite du propriétaire pour la migration Supabase Production et l'ouverture contrôlée de `parent_pack_refund_security_gate`.
