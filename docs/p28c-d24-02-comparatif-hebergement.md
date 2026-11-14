# YZIOW P28c — Chantier D.2.4 (Volet 2)
# Comparatif des Solutions d'Hébergement de l'Autorité WebAuthn (Étape B)

> **Statut :** Document de préparation technique D.2.4 — **Aucun service créé ni souscrit**.
> **Règle de tarification :** Tous les tarifs ci-dessous proviennent des documentations publiques officielles des fournisseurs. Tout coût dépendant d'une option contractuelle non publique ou du plan exact déjà souscrit par le propriétaire est signalé par `COÛT À CONFIRMER`.

---

## 1. Analyse détaillée des trois options d'hébergement

### Option A — Projet Vercel indépendant
Consiste à déployer l'autorité WebAuthn comme un second projet Vercel distinct du projet `yzo-school`.

- **Compatibilité technique avec `webauthnAuthorityServer.js` :**
  - `webauthnAuthorityServer.js` démarre un serveur `http.createServer(...).listen(port)`. Sur Vercel Serverless Functions, le runtime n'exécute pas `server.listen()` de manière persistante : il nécessite un adaptateur Serverless (`api/authority.js`) exportant le handler `(req, res) => ...` et une règle `vercel.json` dédiée.
  - Les limites de durée d'exécution Vercel Pro avec *Fluid Compute* (300 s par défaut, jusqu'à 800 s) sont largement suffisantes pour une vérification WebAuthn (< 200 ms), mais chaque cold start réinitialise le pool PostgreSQL et l'ensemble en mémoire `consumedEnrollmentTokens` (ce qui oblige à persister aussi les nonces de jetons `oob_bootstrap` en base si plusieurs instances Serverless coexistent).
- **Séparation des comptes, rôles et secrets (Point critique) :**
  - **Deux projets Vercel dans la même équipe Vercel Pro ne sont PAS isolés administrativement :** tout membre ayant le rôle *Member* ou *Owner* sur l'équipe Vercel ou détenant un token API Vercel d'équipe peut lire/modifier les variables d'environnement des deux projets.
  - Pour obtenir une séparation réelle sur Vercel, il faut **obligatoirement** créer un **second compte/équipe Vercel distinct** (détenu exclusivement par le propriétaire sécurité) et déployer depuis un dépôt ou artefact séparé (afin qu'un push sur le dépôt principal ne puisse pas modifier le code de l'autorité).
- **Restrictions réseau :**
  - Les fonctions Serverless Vercel sortent uniquement en **IPv4**. Or, les connexions directes Supabase (`db.<project_ref>.supabase.co:5432`) résolvent uniquement en **IPv6** par défaut (sauf souscription à l'option payante Supabase IPv4 Add-on). Depuis Vercel, le rôle `yziow_webauthn_authority` doit donc obligatoirement passer par le pooler Supavisor (`aws-0-<region>.pooler.supabase.com` avec l'identifiant `yziow_webauthn_authority.<project_ref>`).

---

### Option B — Service Node.js conteneurisé isolé (Google Cloud Run / Fly.io / Railway)
Consiste à exécuter `node backend/authority/webauthnAuthorityServer.js` dans un conteneur Docker minimal non-root hébergé sur une plateforme dédiée (ex. Google Cloud Run dans un projet GCP séparé, Fly.io ou Railway dans un espace séparé).

- **Environnement d'exécution et compatibilité (après correctifs préalables D.2.4) :**
  - Suite aux correctifs D.2.4, `webauthnAuthorityServer.js` écoute sur `0.0.0.0` et prend en charge `process.env.PORT` (requis par Google Cloud Run), tandis que `pg` et `@simplewebauthn/server` figurent dans les dépendances de production (`dependencies`).
  - L'usage unique des jetons d'amorçage (`oob_bootstrap`) et de co-autorisation (`hardware_co_auth`) est désormais garanti par la table PostgreSQL `yziow_refund_auth.consumed_enrollment_tokens` (via `consume_enrollment_approval_token`), et ne dépend plus de la mémoire RAM ni du réglage `max-instances = 1` (ce dernier reste recommandé uniquement pour borner le nombre de connexions PostgreSQL du pool `pg`).
- **Isolation des secrets et identité de service :**
  - Le projet Cloud Run / Fly.io / Railway appartient exclusivement au propriétaire YZIOW (aucun accès accordé aux comptes de développement courants ni au compte Vercel).
  - Les secrets (`YZIOW_WEBAUTHN_AUTHORITY_SECRET`, `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET`, `YZIOW_AUTH_AUTHORITY_DATABASE_URL`, `YZIOW_BACKEND_TO_AUTHORITY_TOKEN`) sont injectés via le gestionnaire de secrets de la plateforme (ex. Secret Manager GCP ou secrets chiffrés Fly.io).
- **Contrôle d'accès réseau et authentification inter-services :**
  - Exposition HTTPS (TLS 1.2/1.3) uniquement sur les routes `/v1/*`.
  - Double barrière possible sur Cloud Run : authentification IAM d'invocation Cloud Run (`roles/run.invoker`) + vérification applicative `Authorization: Bearer <YZIOW_BACKEND_TO_AUTHORITY_TOKEN>` en temps constant (`crypto.timingSafeEqual`).

---

### Option C — Autorité indépendante (Option B) avec gestion de clés renforcée (KMS / HSM)
Combine le service isolé de l'Option B avec un service de gestion de clés matériel ou cloud (**Google Cloud KMS** ou **AWS KMS**) pour protéger les clés de signature HMAC.

- **Répartition exacte des opérations (ce que fait le KMS vs ce que fait l'autorité) :**
  - **Un KMS ne vérifie PAS les assertions WebAuthn :** un KMS ne sait ni parser le `clientDataJSON`, ni décoder le CBOR `attestationObject`, ni vérifier les flags `UP=1` / `UV=1`, ni contrôler la monotonie du `signCount`, ni interroger PostgreSQL (`inspect_authoritative_refund_dossier`). Toutes ces vérifications restent exécutées par le code de l'autorité (`superAdminWebAuthnAuthority.js`).
  - **Ce que fait le KMS :** au lieu de détenir une clé HMAC en mémoire pour signer les jetons `oob_bootstrap` ou les preuves d'action, l'autorité appelle l'API `MacSign` (`GenerateMac` HMAC-SHA256) du KMS pour que la clé secrète ne soit jamais extractible hors du KMS.
- **Contrainte de compatibilité avec PostgreSQL (Supabase) :**
  - Actuellement, la fonction SQL `yziow_refund_auth.verify_and_consume_refund_action_proof` recalcule localement dans PostgreSQL `hmac(v_canonical, v_secret_key, 'sha256')` à partir de `yziow_refund_auth.authority_config.secret_key`.
  - PostgreSQL sur Supabase ne pouvant pas appeler directement un KMS externe de manière synchrone sans extension réseau, deux architectures KMS sont possibles :
    1. **KMS pour `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` et les jetons internes d'enrôlement** (vérifiés uniquement par l'autorité via `VerifyMac` KMS), tandis que la clé de preuve SQL reste un secret partagé uniquement entre le Secret Manager de l'autorité et la table verrouillée `yziow_refund_auth.authority_config`.
    2. **Passage à une signature asymétrique ECDSA P-256 / Ed25519 dans KMS** pour la preuve d'action (nécessiterait une évolution future de la fonction SQL pour vérifier une signature asymétrique au lieu d'un HMAC symétrique).

---

## 2. Tableau comparatif obligatoire

| Critère | Option A : Projet Vercel indépendant (dans un compte/équipe Vercel séparé) | Option B : Service Node.js conteneurisé isolé (Cloud Run / Fly.io / Railway) | Option C : Autorité isolée (Option B) + KMS (Google Cloud KMS / AWS KMS) |
|---|---|---|---|
| **Sécurité réelle** | **Moyenne à Élevée** (Conditionnelle à un compte Vercel distinct ; **Faible** si placé dans la même équipe Vercel Pro que `yzo-school`). | **Élevée** (Sous réserve d'un projet cloud dédié sans comptes partagés avec l'équipe Vercel). | **Très élevée** (Clés maîtresses d'amorçage/signature non extractibles, journalisées dans Cloud Audit Logs / CloudTrail). |
| **Isolation des secrets** | Partagée au niveau de l'équipe si même organisation Vercel Pro ; isolée uniquement avec un second compte Vercel séparé. | **Élevée (conditionnelle à l'IAM)** : les secrets résident dans un projet cloud dédié inaccessible depuis Vercel et GitHub Actions du dépôt principal. | **Maximale** : les clés HMAC hébergées dans KMS ne quittent jamais le module cryptographique du fournisseur cloud. |
| **Compatibilité avec YZIOW (`D.2.3` + correctifs `D.2.4`)** | **Partielle sans adaptation** : nécessite un wrapper Serverless Vercel et impose le pooler IPv4 Supavisor. | **Complète après les correctifs D.2.4** : écoute sur `0.0.0.0` via `process.env.PORT`, `pg` en `dependencies`, et anti-rejeu PostgreSQL persistant (`consumed_enrollment_tokens`). | **Partielle pour les preuves SQL** : compatible immédiatement pour `oob_bootstrap` ; nécessiterait d'adapter `refundActionProofAuthority.js` pour appeler l'API KMS. |
| **Complexité d'installation** | Moyenne (création d'un 2e compte Vercel + wrapper Serverless + configuration Supavisor). | **Faible à Moyenne** (`Dockerfile` Node 22 Alpine de 15 lignes + déploiement Cloud Run / Fly.io). | **Élevée** (Provisionnement IAM KMS + modification du code de signature vers SDK KMS). |
| **Maintenance** | Faible (géré par Vercel, mais surveillance des cold starts et du pooler). | **Faible** (Conteneur sans état persistant local, redémarrage automatique, image Node LTS). | Moyenne (Gestion du cycle de vie des versions de clés KMS et des politiques IAM). |
| **Estimation conditionnelle de coût mensuel** | - **Hobby (non commercial) :** 0 $/mois (usage commercial interdit par les CGU Vercel).<br>- **Vercel Pro :** estimation **~20 $ / mois / siège** (inclut 20 $ de crédit d'usage, hors dépassements). | *Estimations conditionnelles selon région, trafic et mode d'allocation :*<br>- **Google Cloud Run :** **~0 $ à 5 $ / mois** si facturé à la requête dans la limite du Free Tier mensuel, ou **~15 à 25 $ / mois** si 1 instance est maintenue active 24h/24.<br>- **Fly.io :** **~2,19 $ à 6,70 $ / mois** (`shared-cpu-1x` 256 Mo à 1 Go RAM) + egress (~0,02 $/Go).<br>- **Railway :** **~5 $ à 10 $ / mois** selon consommation CPU/RAM réelle. | Estimation Option B **+** :<br>- **Google Cloud KMS :** **~0,09 $ / mois** (0,06 $/version de clé HMAC + 0,03 $/10 000 opérations).<br>- **AWS KMS :** **~1,00 $ / mois / clé** (+ 0,03 $/10 000 requêtes au-delà du quota gratuit de 20 000 req./mois).<br>- HSM matériel dédié : `COÛT À CONFIRMER`. |
| **Dépendances externes** | Vercel + Supabase (Supavisor IPv4 obligatoire). | Fournisseur conteneur (GCP Cloud Run, Fly.io ou Railway) + Supabase. | Fournisseur conteneur + Cloud KMS + SDK KMS + Supabase. |
| **Risques résiduels** | - Compromission croisée si même équipe Vercel.<br>- Dépendance au pooler IPv4 Supavisor. | - Un administrateur disposant des droits *Owner* sur le projet Cloud Run peut lire les variables d'environnement du conteneur (d'où la restriction stricte au seul propriétaire). | - Si le conteneur d'autorité lui-même est compromis en mémoire, l'attaquant peut appeler `MacSign` tant que son accès IAM n'est pas révoqué (mais ne peut pas exfiltrer la clé KMS). |

---

## 3. Synthèse de la recommandation

- **Architecture retenue pour D.2.4 :** **Option B — Service Node.js conteneurisé isolé** (avec préférence pour **Google Cloud Run** dans un projet GCP dédié ou **Fly.io** dans une organisation dédiée), s'appuyant sur l'anti-rejeu persistant PostgreSQL (`yziow_refund_auth.consumed_enrollment_tokens`) et sur une séparation administrative stricte vis-à-vis de Vercel.
- **Décision requise du propriétaire :** Choisir le fournisseur cible de l'Option B (Google Cloud Run, Fly.io ou Railway) avant toute exécution de la Phase B (validation sur infrastructure isolée non productive).
