# YZIOW P28c — Chantier D.2.5 (Volet 4)
# Spécifications du Conteneur Node.js et Configuration du Service Cloud Run

> **Statut :** Dossier de planification stricte D.2.5 — **Modèles non activés, aucune image construite ni poussée, aucun registre Artifact Registry créé, aucun service Cloud Run déployé**.
> **Références internes :** [webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js), [package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/package.json), [backend/package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/package.json).

---

## 1. Analyse Technique des Fichiers du Dépôt pour la Conteneurisation (Étape B)

L'examen croisé de [package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/package.json), [backend/package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/package.json), [package-lock.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/package-lock.json) et [backend/authority/webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js) met en évidence quatre particularités techniques déterminantes pour la construction de l'image :

1. **Résolution de module CommonJS vs ES Module (`"type": "commonjs"` dans `backend/package.json`) :**
   - Le fichier [package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/package.json#L5) à la racine du dépôt déclare `"type": "module"` (pour le frontend Vite), tandis que [backend/package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/package.json#L6) déclare `"type": "commonjs"`.
   - Tous les fichiers de l'autorité (`backend/authority/webauthnAuthorityServer.js`, `backend/services/superAdminWebAuthnAuthority.js`, `backend/services/refundActionProofAuthority.js`, `backend/utils/helpers.js`) utilisent CommonJS (`'use strict'`, `require(...)`, `module.exports`).
   - **Exigence impérative du Dockerfile :** Le fichier `/app/backend/package.json` doit obligatoirement être copié dans l'image finale à son emplacement relatif `/app/backend/package.json` afin que Node.js applique `"type": "commonjs"` à l'arborescence `/app/backend/**`.

2. **Neutralisation du téléchargement Chromium de `puppeteer` lors de `npm ci --omit=dev` :**
   - Le [package.json](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/package.json#L57) racine contient `"puppeteer": "^25.4.0"` dans `dependencies`.
   - Le serveur d'autorité WebAuthn n'utilise que `@simplewebauthn/server` (`^14.1.0`), `pg` (`^8.23.0`), `libphonenumber-js` (requis transitivement par `backend/utils/helpers.js` pour `isValidUUID` si le module complet est chargé) et les modules natifs Node.js (`http`, `crypto`, `url`).
   - En utilisant `ENV PUPPETEER_SKIP_DOWNLOAD=true` et `npm ci --omit=dev --ignore-scripts` lors de l'étape de build, l'installation est strictement reproductible via `package-lock.json` tout en évitant d'exécuter des scripts postinstall tiers et d'alourdir l'image avec un navigateur Chromium inutile (~250 Mo économisés).

3. **Écoute réseau sur `0.0.0.0` et `PORT` :**
   - Dans [backend/authority/webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L89-L117) et [L346-L355](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js#L346-L355), lorsque le fichier est exécuté directement (`node backend/authority/webauthnAuthorityServer.js`), il résout `standalonePort = process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT || process.env.PORT || 8080` et `standaloneHost = process.env.YZIOW_WEBAUTHN_AUTHORITY_HOST || '0.0.0.0'`.
   - Il est donc immédiatement conforme au contrat d'exécution de Google Cloud Run (`PORT=8080` injecté par Cloud Run, écoute sur `0.0.0.0`).

4. **Surface de fichiers minimale dans l'image finale :**
   - L'image finale ne doit contenir **ni le code frontend (`src/`, `index.html`)**, **ni les contrôleurs/routes du backend principal (`backend/server.js`, `backend/controllers/`, `backend/routes/`)**, **ni les scripts de migration ou de test**.
   - Seuls les 4 fichiers JS strictement nécessaires à l'autorité sont copiés dans `/app/backend/` :
     - `backend/authority/webauthnAuthorityServer.js`
     - `backend/services/superAdminWebAuthnAuthority.js`
     - `backend/services/refundActionProofAuthority.js`
     - `backend/utils/helpers.js`
     - `backend/package.json`

---

## 2. Spécifications Techniques du Conteneur et de Cloud Run (Étape B)

| Paramètre | Valeur retenue | Justification technique et sécuritaire |
|---|---|---|
| **Version Node.js** | **Node.js 22 LTS** (`22.14.0`) | Alignée avec `@types/node: ^22.0.0` du dépôt, support LTS actif, API `crypto` et `fetch` natives stables. |
| **Image de base** | `node:22.14.0-bookworm-slim` *(épinglée par digest SHA-256 lors du build)* | Image minimale Debian Bookworm officielle incluant `ca-certificates` et `libssl3`, sans outils de compilation ni compilateurs dans l'étage d'exécution. |
| **Utilisateur d'exécution** | `USER node` (`uid=1000`, `gid=1000`, non-root) | Empêche toute élévation de privilèges locale dans le conteneur. Système de fichiers applicatif en lecture seule (`readOnlyRootFilesystem`). |
| **Secrets dans l'image** | **Aucun (`0`)** | Aucun fichier `.env`, aucune clé, aucun certificat privé n'est copié ni passé en `ARG`/`ENV` de build. |
| **Allocation CPU / Mémoire** | **`1 vCPU` / `512 MiB` RAM** | Suffisant pour le décodage CBOR/COSE `@simplewebauthn/server`, la vérification ECDSA P-256 / RSA et le pool `pg` (`max: 10`), tout en maximisant la durée couverte par le Free Tier Cloud Run. |
| **Allocation CPU** | **CPU alloué uniquement pendant le traitement des requêtes (`cpu-throttling: true`)** | Mode facturation à la requête (*Request-based billing*) permettant de bénéficier des `180 000 vCPU-secondes` et `360 000 GiB-secondes` gratuits par mois. |
| **Nombre d'instances (`minScale` / `maxScale`)** | **`min-instances = 0`**, **`max-instances = 2`** *(ou `1` en recette)* | `min-instances = 0` évite toute facturation au repos en préproduction ; `max-instances = 2` plafonne strictement le nombre de connexions PostgreSQL (`2 × 10 = 20 max`) et bloque tout risque d'emballement financier en cas de pic d'appels. |
| **Concurrence (`containerConcurrency`)** | **`20` requêtes simultanées par instance** | Le serveur WebAuthn effectue des opérations courtes liées à PostgreSQL (`SELECT ... FOR UPDATE`). Limiter la concurrence à `20` évite toute famine sur le pool `pg` (`max: 10`). |
| **Timeout des requêtes (`timeoutSeconds`)** | **`15` secondes** | Le client `webauthnAuthorityClient.js` applique un timeout de `5000 ms` (`DEFAULT_TIMEOUT_MS = 5000`). Un plafond Cloud Run de `15 s` coupe toute requête bloquée sans immobiliser de vCPU. |
| **Sonde de démarrage et de santé (`startupProbe` / `livenessProbe`)** | `HTTP GET /v1/health` sur le port `8080` | `webauthnAuthorityServer.js` vérifie au démarrage la présence et la validité de `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` (`resolveAuthoritativeRpConfig`, DEP-2) et répond `200 OK` sur `GET /v1/health` sans exposer de secret. |
| **Verrouillage `rpId` et `origin` (DEP-2)** | `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` imposés par la configuration propre de l'autorité | Toute valeur divergente envoyée par le backend dans le corps HTTP est rejetée avec `403 Forbidden` (`INVALID_RP_ID` / `INVALID_ORIGIN`). Hors mode test jetable, l'absence de `WEBAUTHN_RP_ID` ou `WEBAUTHN_ORIGIN` bloque le démarrage (`WEBAUTHN_RP_CONFIG_MISSING`). |
| **Sécurisation de la révocation (DEP-3)** | `requireRevocationAuthorization: true` imposé sur `/v1/credentials/revoke` | Empêche un backend compromis détenant seulement `YZIOW_BACKEND_TO_AUTHORITY_TOKEN` de révoquer arbitrairement les authentificateurs SuperAdmin : exige une co-autorisation matérielle du second SuperAdmin ou un jeton d'urgence hors bande `oob_bootstrap` lié au `credentialId`, avec trace d'audit atomique dans `yziow_refund_auth.consumed_enrollment_tokens`. |
| **Journalisation** | Sortie standard `stdout` / `stderr` capturée par Cloud Logging | Aucune donnée sensible (ni `Authorization`, ni `X-Serverless-Authorization`, ni `secretKey`, ni `oob_bootstrap`, ni `actionProof.signature`) n'est écrite sur `stdout`/`stderr`. |
| **Gestion des arrêts (`SIGTERM`, DEP-3) et connexions PostgreSQL** | Interception de `SIGTERM` → `isShuttingDown = true` (`503 AUTHORITY_SHUTTING_DOWN` + `Connection: close`) → drain des requêtes en cours (timeout `8000 ms` < délai Cloud Run `10 s`) → effacement des secrets en mémoire → `closeAuthorityDbPool()` | Ferme proprement le serveur HTTP et les connexions TCP vers Supavisor Session Mode lors du scale-down à `0` d'une instance Cloud Run, évitant toute session PostgreSQL orpheline. |

---

## 3. Modèle de `Dockerfile` (Modèle Documentaire Non Activé)

> **Avertissement :** Ce modèle est fourni uniquement à titre de spécification technique D.2.5. Il ne doit **pas** être construit ni publié tant que le propriétaire n'a pas donné son autorisation explicite pour la phase de déploiement.

```dockerfile
# ==============================================================================
# MODÈLE NON ACTIVÉ — YZIOW P28c D.2.5
# Dockerfile multi-étapes pour l'Autorité Indépendante WebAuthn SuperAdmin
# ==============================================================================

# Étape 1 : Installation reproductible des dépendances de production
FROM node:22.14.0-bookworm-slim AS deps

WORKDIR /app

# Empêcher le téléchargement de Chromium par puppeteer (présent dans package.json racine)
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_LOGLEVEL=warn

COPY package.json package-lock.json ./

# Installation déterministe à partir de package-lock.json sans scripts arbitraires
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Étape 2 : Image d'exécution minimale et durcie
FROM node:22.14.0-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=staging \
    PORT=8080 \
    YZIOW_CONTAINER_MODE=true

# Copier uniquement les dépendances de production installées
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./package.json

# Copier uniquement backend/package.json ("type": "commonjs") et les 4 fichiers de l'autorité
COPY --chown=root:root backend/package.json ./backend/package.json
COPY --chown=root:root backend/authority/webauthnAuthorityServer.js ./backend/authority/webauthnAuthorityServer.js
COPY --chown=root:root backend/services/superAdminWebAuthnAuthority.js ./backend/services/superAdminWebAuthnAuthority.js
COPY --chown=root:root backend/services/refundActionProofAuthority.js ./backend/services/refundActionProofAuthority.js
COPY --chown=root:root backend/utils/helpers.js ./backend/utils/helpers.js

# Exécution sous l'utilisateur non privilégié "node" (UID 1000) sans droit d'écriture sur /app
USER node

EXPOSE 8080

CMD ["node", "backend/authority/webauthnAuthorityServer.js"]
```

---

## 4. Modèle de Configuration Cloud Run Knative (Modèle Documentaire Non Activé)

```yaml
# ==============================================================================
# MODÈLE NON ACTIVÉ — YZIOW P28c D.2.5
# Spécification déclarative du service Cloud Run de préproduction
# ==============================================================================
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: yziow-webauthn-authority-stg
  namespace: "yziow-sec-auth-staging"
  annotations:
    # Accessible par HTTPS depuis Vercel mais protégé en périphérie par IAM (--no-allow-unauthenticated)
    run.googleapis.com/ingress: all
    run.googleapis.com/description: "Autorité WebAuthn isolée des 2 SuperAdmins YZIOW (Préproduction)"
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "2"
        run.googleapis.com/cpu-throttling: "true"
        run.googleapis.com/execution-environment: gen2
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      serviceAccountName: sa-webauthn-authority-run@yziow-sec-auth-staging.iam.gserviceaccount.com
      containerConcurrency: 20
      timeoutSeconds: 15
      containers:
        - image: europe-west1-docker.pkg.dev/yziow-sec-auth-staging/yziow-authority-repo/webauthn-authority@sha256:REPLACE_WITH_VERIFIED_IMAGE_DIGEST
          ports:
            - name: http1
              containerPort: 8080
          resources:
            limits:
              cpu: "1"
              memory: "512Mi"
          env:
            - name: NODE_ENV
              value: "staging"
            - name: YZIOW_CONTAINER_MODE
              value: "true"
            - name: WEBAUTHN_RP_ID
              value: "staging.yziow.com"
            - name: WEBAUTHN_ORIGIN
              value: "https://staging.yziow.com"
            - name: YZIOW_WEBAUTHN_AUTHORITY_SECRET
              valueFrom:
                secretKeyRef:
                  name: yziow-webauthn-authority-secret
                  key: "1"
            - name: YZIOW_AUTH_AUTHORITY_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: yziow-auth-authority-db-url
                  key: "1"
            - name: YZIOW_BACKEND_TO_AUTHORITY_TOKEN
              valueFrom:
                secretKeyRef:
                  name: yziow-backend-to-authority-token
                  key: "1"
          startupProbe:
            httpGet:
              path: /v1/health
              port: 8080
            initialDelaySeconds: 1
            periodSeconds: 3
            timeoutSeconds: 2
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /v1/health
              port: 8080
            periodSeconds: 15
            timeoutSeconds: 2
            failureThreshold: 3
```

> **Note sur `YZIOW_WEBAUTHN_BOOTSTRAP_SECRET` :** Ce secret n'est monté que sur la révision initiale dédiée à la cérémonie d'enrôlement du premier SuperAdmin fictif de test, puis retiré dès la révision suivante.

---

## 5. Références Officielles

- Google Cloud Run — Container Runtime Contract (`PORT`, `0.0.0.0`, `SIGTERM`) : https://cloud.google.com/run/docs/container-contract
- Google Cloud Run — Configuration des sondes de santé (`startupProbe`, `livenessProbe`) : https://cloud.google.com/run/docs/configuring/healthchecks
- Google Cloud Run — Utilisation des secrets Secret Manager avec versions épinglées : https://cloud.google.com/run/docs/configuring/services/secrets
