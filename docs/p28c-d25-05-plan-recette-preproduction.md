# YZIOW P28c — Chantier D.2.5 (Volet 5)
# Plan de Recette Préproduction (16 Scénarios Obligatoires, Preuves et Retour Arrière)

> **Statut :** Dossier de planification stricte D.2.5 — **Aucun scénario n'a été exécuté contre un service cloud réel à cette étape**.
> **Règle de données :** La recette de préproduction utilise **exclusivement** deux comptes SuperAdmins fictifs (`SA_TEST_1`, `SA_TEST_2`), des paires de clés FIDO2/WebAuthn de test et des intentions de paiement synthétiques. Aucune donnée personnelle ou financière réelle n'est utilisée.

---

## 1. Prérequis d'Entrée en Recette Préproduction

Avant de lancer le Scénario 1, l'opérateur (propriétaire) vérifie que :
1. Les durcissements applicatifs préalables identifiés en D.2.5 (verrouillage `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` côté autorité et support `X-Serverless-Authorization` dans `webauthnAuthorityClient.js`) ont été validés et publiés.
2. Le projet Supabase Staging est initialisé avec les migrations jusqu'à `migration_p28c_parent_pack_refund.sql`, et la requête suivante retourne `false, false, false` :
   ```sql
   SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
   FROM public.parent_pack_refund_security_gate WHERE id = true;
   ```
3. Deux profils SuperAdmins fictifs actifs existent dans `public.profiles` sur Supabase Staging :
   - `SA_TEST_1` (`11111111-1111-4111-8111-111111111111`)
   - `SA_TEST_2` (`22222222-2222-4222-8222-222222222222`)

---

## 2. Matrice des 16 Scénarios Obligatoires de Recette Préproduction (Étape F)

| # | Scénario de validation | Action / Protocole de test | Critère mesurable de réussite (`PASS`) | Preuve à collecter |
|---|---|---|---|---|
| **1** | **Démarrage Cloud Run avec secrets de test** | Déployer la révision Cloud Run `yziow-webauthn-authority-stg` avec les 4 secrets Secret Manager de test et inspecter la sonde de démarrage ainsi que un appel authentifié `GET /v1/health`. | Révision à l'état `Ready = True` ; `GET /v1/health` (avec `X-Serverless-Authorization` valide) retourne `HTTP 200` et `{"status":"ok","authority":"yziow-refund-auth-authority"}`. | Capture JSON de `gcloud run revisions describe` + réponse HTTP `200` de `/v1/health`. |
| **2** | **Refus d'un appel sans authentification IAM** | Envoyer une requête `POST /v1/actions/challenge` ou `GET /v1/health` vers l'URL `*.a.run.app` **sans** en-tête `X-Serverless-Authorization` (même en fournissant un `Authorization: Bearer <YZIOW_BACKEND_TO_AUTHORITY_TOKEN>` valide). | Rejet immédiat en périphérie par le Google Front End avec **`HTTP 401` ou `HTTP 403`** ; aucune ligne d'exécution applicative dans le conteneur Node.js. | En-têtes de réponse HTTP (`403 Forbidden` / `server: Google Frontend`) + extrait Cloud Logging montrant le blocage IAM en amont. |
| **3** | **Refus d'un appel avec jeton applicatif invalide** | Envoyer une requête `POST /v1/actions/challenge` munie d'un jeton OIDC IAM valide dans `X-Serverless-Authorization`, mais avec un `Authorization: Bearer mauvais_jeton` (ou sans en-tête `Authorization`). | Le conteneur `webauthnAuthorityServer.js` rejette l'appel avec **`HTTP 401`** et `{"success":false,"valid":false,"code":"UNAUTHORIZED_BACKEND_CALLER"}`. | Corps JSON `401 UNAUTHORIZED_BACKEND_CALLER` + log d'audit. |
| **4** | **Refus d'un appel depuis un backend non autorisé** | Tenter d'échanger un jeton OIDC provenant d'un projet ou environnement non autorisé auprès du Workload Identity Pool `vercel-yziow-pool/providers/vercel-oidc-stg`. | Google Cloud STS rejette l'échange de jeton avec **`HTTP 400/403` (`invalid_grant` / condition d'attribut `assertion.sub` non satisfaite)** ; aucun ID Token Cloud Run n'est émis. | Réponse d'erreur JSON de `https://sts.googleapis.com/v1/token`. |
| **5** | **Création d'un challenge WebAuthn valide** | Appeler `POST /v1/credentials/register/challenge` pour `SA_TEST_1` avec `rpId = "staging.yziow.com"` et `origin = "https://staging.yziow.com"`. | Réponse **`HTTP 200`** contenant `challengeId` (UUID), `challenge` (base64url ≥ 32 octets), `rp.id = "staging.yziow.com"`, `timeout = 300000` ; ligne créée dans `yziow_refund_auth.webauthn_challenges` avec `consumed_at IS NULL`. | Réponse JSON `200` + `SELECT challenge_id, action_type, rp_id, origin, consumed_at FROM yziow_refund_auth.webauthn_challenges`. |
| **6** | **Rejet d'une origine ou d'un RP ID incorrect** | Soumettre une attestation ou assertion WebAuthn dont `clientDataJSON.origin` vaut `https://evil.example` ou dont `authenticatorData.rpIdHash` correspond à `evil.example` (ou envoyer `body.rpId = "evil.example"`). | Rejet immédiat avec **`HTTP 403`** et code **`INVALID_ORIGIN`** ou **`INVALID_RP_ID`** ; le challenge n'est pas consommé et aucune clé ni preuve n'est émise. | Réponse JSON `403` (`INVALID_ORIGIN` / `INVALID_RP_ID`). |
| **7** | **Première inscription avec amorçage hors bande (`oob_bootstrap`)** | Avec `0` clé active dans `superadmin_webauthn_credentials` :<br>1) Tenter d'inscrire `SA_TEST_1` sans jeton hors bande → vérifier le refus.<br>2) Générer hors bande un jeton `oob_bootstrap` signé avec `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` lié à `SA_TEST_1`, co-autorisé par `SA_TEST_2` et lié à `cred_test_1`.<br>3) Soumettre `POST /v1/credentials/register/verify`. | 1) Sans jeton : rejet **`403 ENROLLMENT_CO_AUTHORIZATION_REQUIRED` / `BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED`**.<br>2) Avec `oob_bootstrap` valide : **`HTTP 200` (`valid: true`)**, clé insérée dans `public.superadmin_webauthn_credentials` et nonce inséré dans `yziow_refund_auth.consumed_enrollment_tokens`. | Réponses JSON `403` puis `200` + lignes SQL dans `superadmin_webauthn_credentials` et `consumed_enrollment_tokens`. |
| **8** | **Inscription du second administrateur avec co-autorisation matérielle** | Maintenant que `SA_TEST_1` possède une clé active :<br>1) Tenter d'inscrire `SA_TEST_2` avec un jeton `oob_bootstrap` → vérifier le rejet.<br>2) Demander un challenge `enroll_approve` pour `SA_TEST_1`, le signer matériellement (`UP=1, UV=1`) avec la clé de `SA_TEST_1`, obtenir l'`enrollmentApprovalToken`, puis inscrire la clé `cred_test_2` de `SA_TEST_2`.<br>3) Retirer `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` de Cloud Run. | 1) `oob_bootstrap` rejeté avec **`403 HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED`**.<br>2) Avec co-autorisation matérielle de `SA_TEST_1` : **`HTTP 200` (`valid: true`)**, `cred_test_2` active avec `registered_by_approver_id = SA_TEST_1`. | Réponses JSON `403` puis `200` + vérification SQL des 2 clés actives. |
| **9** | **Refus d'une preuve falsifiée** | Forger côté backend une preuve `actionProof` signée avec une fausse clé HMAC ou modifier un caractère de `signature` / `webauthn_signature`, puis appeler la RPC `admin_create_parent_pack_refund_reconciliation`. | Rejet immédiat avec **`INVALID_ACTION_PROOF_SIGNATURE`** ; aucune ligne créée dans `parent_pack_refund_reconciliations`. | Sortie d'erreur RPC `INVALID_ACTION_PROOF_SIGNATURE` + `COUNT(*) = 0` sur le dossier. |
| **10** | **Refus d'un montant ou d'une transaction incohérente** | Appeler `POST /v1/actions/challenge` ou `POST /v1/actions/confirm` en déclarant un `verifiedAmountMinor` (ex. `5000`) ou un `providerTransactionId` différent de celui stocké dans `public.payment_intents` (ex. `10000`). | L'autorité interroge directement PostgreSQL via `inspect_authoritative_refund_dossier` et rejette l'appel avec **`HTTP 403`** et code **`AUTHORITATIVE_DOSSIER_MISMATCH`** avant toute signature. | Réponse JSON `403 AUTHORITATIVE_DOSSIER_MISMATCH`. |
| **11** | **Refus d'un rejeu de nonce après redémarrage** | Forcer un redémarrage d'instance Cloud Run (nouvelle révision ou scale à 0 puis 1), puis rejouer : (a) le jeton `oob_bootstrap` déjà utilisé au Scénario 7, (b) le jeton `enrollmentApprovalToken` du Scénario 8, et (c) un challenge d'action déjà consommé. | Les 3 tentatives sont rejetées par PostgreSQL avec **`INVALID_ENROLLMENT_APPROVAL_TOKEN` (« déjà consommé »)** et **`CHALLENGE_ALREADY_CONSUMED`**, prouvant que l'anti-rejeu survit au redémarrage du conteneur. | Réponses JSON `403` pour les 3 tentatives de rejeu post-redémarrage. |
| **12** | **Refus d'une transaction sans véritable preuve personnelle** | Appeler `createParentPackRefundReconciliationRequest` ou `approveAndExecuteParentPackRefundReconciliation` sans `actionProof` ni assertion matérielle (`UP=1, UV=1`), ou avec le même SuperAdmin pour l'initiation et l'approbation. | Sans preuve : rejet **`ACTION_PROOF_REQUIRED`** / **`WEBAUTHN_CONFIRMATION_REQUIRED`**.<br>Même SuperAdmin : rejet **`DUAL_CUSTODY_VIOLATION`** à la fois par l'autorité (`inspect_authoritative_refund_dossier`) et par PostgreSQL. | Réponses JSON `400/403` (`ACTION_PROOF_REQUIRED`, `DUAL_CUSTODY_VIOLATION`). |
| **13** | **Indisponibilité de l'autorité : `AUTHORITY_UNAVAILABLE`** | Fixer temporairement `max-instances` ou couper l'accès réseau vers Cloud Run (ou définir une URL d'autorité injoignable), puis déclencher un appel WebAuthn depuis le backend Vercel Preview. | `webauthnAuthorityClient.js` échoue en mode fail-closed en moins de `5 s` et retourne **`HTTP 503`** avec code **`AUTHORITY_UNAVAILABLE`** ; aucun fallback local n'est exécuté. | Réponse HTTP `503` (`code: "AUTHORITY_UNAVAILABLE"`). |
| **14** | **Indisponibilité PostgreSQL : rejet sécurisé** | Révoquer temporairement `CONNECT` pour `yziow_webauthn_authority` (ou pointer vers un port PostgreSQL fermé) et appeler `POST /v1/actions/challenge` et `POST /v1/actions/confirm`. | L'autorité rejette la demande en mode fail-closed (`403/500`, aucune preuve signée n'est retournée, aucune exception non gérée ne fait fuiter la chaîne de connexion). | Réponse JSON d'échec sans fuite d'URI SQL dans le message d'erreur. |
| **15** | **Tentative de remboursement réel : toujours bloquée (`SECURITY_BLOCKER`)** | Exécuter le parcours complet à 2 SuperAdmins fictifs (`SA_TEST_1` initie avec sa clé matérielle #1 → dossier `pending_approval` créé ; `SA_TEST_2` approuve avec sa clé matérielle #2). | L'étape d'approbation finale est **bloquée par PostgreSQL** avec **`SECURITY_BLOCKER`** (`parent_pack_refund_security_gate` ayant ses 3 drapeaux à `false`). Le statut de `payment_intents` reste `completed`, la période reste `active`, et aucun mouvement financier n'a lieu. | Réponse `403 SECURITY_BLOCKER` + requête SQL prouvant `payment_intents.status = 'completed'`. |
| **16** | **Vérification que les secrets de l'autorité ne sont pas accessibles depuis Vercel** | 1) Inspecter les variables d'environnement Vercel (`vercel env ls` ou interface Vercel).<br>2) Depuis une connexion utilisant `YZIOW_REFUND_DATABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, tenter `SELECT * FROM yziow_refund_auth.authority_config` et `INSERT INTO public.superadmin_webauthn_credentials`. | 1) `YZIOW_WEBAUTHN_AUTHORITY_SECRET`, `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET`, `YZIOW_AUTH_AUTHORITY_DATABASE_URL` et `DATABASE_URL` sont absents de Vercel.<br>2) PostgreSQL rejette les deux requêtes avec **`ERROR 42501: permission denied`**. | Capture de la liste des noms de variables Vercel + trace d'erreur PostgreSQL `42501`. |

---

## 3. Procédure de Retour Arrière Immédiat (Kill-Switch Préproduction < 30 secondes)

En cas d'anomalie pendant ou après la recette de préproduction :

1. **Neutralisation immédiate des appels vers Cloud Run (< 15 secondes) :**
   ```bash
   gcloud run services remove-iam-policy-binding yziow-webauthn-authority-stg \
     --region=europe-west1 \
     --member="serviceAccount:sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com" \
     --role="roles/run.invoker"
   ```
   *(Tout appel issu de Vercel est immédiatement bloqué par le Google Front End et retourne `503 AUTHORITY_UNAVAILABLE` côté backend).*

2. **Désactivation de la connexion SQL des rôles dédiés sur Supabase Staging (< 15 secondes) :**
   ```sql
   ALTER ROLE yziow_webauthn_authority NOLOGIN;
   ALTER ROLE yziow_refund_executor NOLOGIN;
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE usename IN ('yziow_webauthn_authority', 'yziow_refund_executor');
   ```

3. **Révocation cryptographique des preuves :**
   ```sql
   UPDATE yziow_refund_auth.authority_config
   SET secret_key = encode(gen_random_bytes(64), 'hex'),
       updated_at = clock_timestamp()
   WHERE id = true;
   ```
