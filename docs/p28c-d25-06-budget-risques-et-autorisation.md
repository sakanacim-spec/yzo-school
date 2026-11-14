# YZIOW P28c — Chantier D.2.5 (Volet 6)
# Budget, Limites de Facturation, Risques Ouverts et Portes d'Autorisation

> **Statut :** Dossier de planification stricte D.2.5 / Durcissement D.2.5b — **Aucune facturation activée, aucun moyen de paiement utilisé, aucune ressource payante créée**.
> **Verdict global :** `D2_5B_READY_FOR_REVIEW` | `D2_5_PROVIDER_COST_CONFIRMATION_REQUIRED` | `READY_FOR_PRODUCTION = NO`.

---

## 1. Estimation Budgétaire Documentée et Quotas Gratuits (Étape G)

Les coûts ci-dessous sont établis à partir des grilles tarifaires publiques officielles de Google Cloud (région `europe-west1` — Tier 1) et de Supabase.

### 1.1 Tableau récapitulatif : Coûts fixes, coûts variables et Free Tier mensuel

| Poste / Service | Modèle tarifaire & Quotas gratuits mensuels (Free Tier) | Consommation estimée pour l'Autorité WebAuthn YZIOW (Préproduction) | Coût mensuel estimé (sous Free Tier) | Condition déclenchant une facturation (> 0 $) |
|---|---|---|---|---|
| **1. Google Cloud Run** (`europe-west1`, facturation à la requête, `min-instances = 0`, `1 vCPU`, `512 MiB`) | **Inclus gratuitement chaque mois par compte de facturation :**<br>- `180 000 vCPU-secondes`<br>- `360 000 GiB-secondes`<br>- `2 000 000 requêtes`<br>Au-delà : `$0.000024 / vCPU-s`, `$0.0000025 / GiB-s`, `$0.40 / million req.` | `< 5 000` requêtes/mois en recette (`< 500 vCPU-s` et `< 250 GiB-s`, soit `< 0,3 %` du quota gratuit) | **`0,00 $ / mois`** *(conditionnel au maintien de `min-instances = 0` et à l'absence d'autre service GCP consommant le Free Tier)* | Passage à `min-instances >= 1` (~`13–35 $ / mois` si 1 instance reste allumée 24h/24) ou dépassement de `180 000 vCPU-s` sur le compte de facturation. |
| **2. Google Secret Manager** | **Inclus gratuitement chaque mois :**<br>- `6 versions de secrets actives`<br>- `10 000 opérations d'accès`<br>Au-delà : `$0.06 / version active / mois` et `$0.03 / 10 000 accès`. | `3 à 4 versions actives` (`authority-secret`, `db-url`, `backend-token`, + `bootstrap-secret` désactivé après enrôlement) et `< 500` lectures/mois au démarrage de révision | **`0,00 $ à 0,24 $ / mois`** | Plus de 6 versions de secrets laissées à l'état `Enabled` sur le même compte de facturation (ex. anciennes versions non détruites après rotation). |
| **3. Google Artifact Registry** (`europe-west1`) | **Inclus gratuitement chaque mois :**<br>- `0,5 Go (500 Mo)` de stockage<br>- Transfert gratuit vers Cloud Run dans la même région (`europe-west1`)<br>Au-delà : `$0.10 / Go / mois`. | 1 à 2 images `node:22-bookworm-slim` sans Chromium (~`90 à 140 Mo` compressées par image, soit `< 300 Mo` au total avec politique de nettoyage automatique) | **`0,00 $ à 0,05 $ / mois`** | Accumulation de plus de `500 Mo` d'images anciennes sans politique de nettoyage (*Cleanup Policy*) ou téléchargement d'images hors de `europe-west1`. |
| **4. Google Cloud Build** *(Optionnel)* | **Inclus gratuitement :** `2 500 minutes de build / mois` sur machine `e2-medium` (au-delà : `$0.003 / min`).<br>*Alternative à `0 $` : build Docker local ou via GitHub Actions puis `docker push`.* | `< 20 minutes / mois` (ou `0 min` si l'image est construite localement ou dans GitHub Actions) | **`0,00 $ / mois`** | Utilisation d'un pool de workers privés Cloud Build ou dépassement de 2 500 minutes/mois. |
| **5. Cloud Logging & Cloud Monitoring** | **Inclus gratuitement chaque mois par projet :**<br>- `50 Gio` d'ingestion de logs (rétention 30 jours)<br>- Métriques système Cloud Run et Admin Activity Audit Logs gratuits<br>Au-delà : `$0.50 / Gio`. | `< 0,1 Gio / mois` (journaux JSON légers d'authentification et d'audit) | **`0,00 $ / mois`** | Ingestion supérieure à `50 Gio / mois` ou activation d'exportations BigQuery / rétention longue durée payante. |
| **6. Transfert de données & Réseau (Egress)** | Échange HTTPS direct Cloud Run ↔ Vercel et Cloud Run ↔ Supavisor IPv4 sans Serverless VPC Connector.<br>Egress Internet depuis l'Europe : `~0,12 $ / Go` dès le 1er Go hors Amérique du Nord. | `< 10 Mo / mois` de charges utiles JSON (challenges et preuves WebAuthn de quelques Ko) | **`< 0,01 $ / mois`** | Création d'un *Serverless VPC Access Connector* (facturé `~15–20 $ / mois` en fixe pour les VM `e2-micro` du connecteur) — **c'est pourquoi l'architecture retenue n'utilise PAS de VPC Connector**. |
| **7. Supabase Staging** (Base PostgreSQL de préproduction) | - **Option 1 (Plan Free Supabase) :** `0 $ / mois` dans la limite de **2 projets gratuits actifs** par organisation (mise en pause automatique après 7 jours d'inactivité).<br>- **Option 2 (Sous organisation Pro existante `25 $ / mois`) :** Chaque projet additionnel (Staging) consomme du Compute (`Micro` à `~10 $ / mois`, ou couvert par les `10 $` de crédits Compute inclus si aucun autre projet payant ne les utilise). | 1 projet Supabase Staging dédié avec connexion Supavisor Session Mode IPv4 (`:5432`, gratuit) | **`0,00 $ / mois`** *(si projet Free disponible)* ou **`~10,00 $ / mois`** *(si instance Micro additionnelle sous plan Pro)* — **`COÛT À CONFIRMER` selon le quota de projets actifs du compte propriétaire** | Dépassement de la limite de 2 projets gratuits Supabase, ou activation de l'option inutile *Dedicated IPv4 Add-on* (`$4 / mois`). |
| **8. Domaine HTTPS pour Cloud Run** | L'URL native `https://yziow-webauthn-authority-stg-<hash>-ew.a.run.app` fournit automatiquement un certificat TLS 1.3 géré par Google **sans frais**. | Utilisation de l'URL native `*.a.run.app` (appelée uniquement serveur-à-serveur par Vercel, jamais exposée aux utilisateurs finaux) | **`0,00 $ / mois`** | Utilisation d'un *Global External Application Load Balancer* pour domaine personnalisé (`~18 $ / mois` fixes) — **non requis et déconseillé ici**. |

### 1.2 Synthèse budgétaire

- **Estimation mensuelle totale côté Google Cloud (Préproduction) :** **`0,00 $ à < 0,50 $ / mois`** dans les conditions nominales (`min-instances = 0`, `max-instances = 2`, pas de VPC Connector, pas de Load Balancer externe, ≤ 4 versions de secrets actives, nettoyage automatique Artifact Registry à 3 images max).
- **Point d'attention contractuel Google Cloud :** Même lorsque la consommation reste à `0,00 $` dans les quotas gratuits (Free Tier), Google Cloud exige qu'un **compte de facturation valide (*Cloud Billing Account*)** soit lié au projet pour déployer Cloud Run et utiliser Secret Manager.

---

## 2. Stratégie de Maîtrise des Coûts et Limites des Alertes Budgétaires

### 2.1 Différence critique entre alerte budgétaire et plafond bloquant
> **Avertissement explicite au propriétaire :**
> Dans Google Cloud Billing, **une alerte budgétaire (*Budget Alert*) n'est PAS un plafond de dépense bloquant (*Hard Cap*)**. Par défaut, franchir le seuil d'un budget envoie uniquement des notifications par e-mail (ou sur un topic Pub/Sub) sans arrêter le service Cloud Run.

### 2.2 Quatre garde-fous techniques pour empêcher tout dépassement de coût

1. **Plafonnement matériel au niveau de Cloud Run (garde-fou principal) :**
   - `minScale: "0"` (aucune facturation hors requête).
   - `maxScale: "2"` (ou `"1"` en préproduction) : même en cas d'attaque ou de boucle infinie, jamais plus de 1 à 2 vCPU ne peuvent tourner simultanément.
   - `timeoutSeconds: 15` : aucune requête ne peut bloquer un vCPU plus de 15 secondes.
   - Avec `--no-allow-unauthenticated`, les requêtes non authentifiées par IAM sont rejetées par le Google Front End **avant** d'allouer du CPU au conteneur et **ne sont pas facturées** par Cloud Run.
2. **Politique de nettoyage automatique Artifact Registry (*Cleanup Policy*) :**
   - Configurer dès la création du dépôt une règle conservant uniquement les **2 dernières images** (`keepCount: 2`) et supprimant automatiquement toute image non taguée de plus de 7 jours, garantissant que le stockage reste toujours sous les `500 Mo` gratuits.
3. **Destruction systématique des anciennes versions Secret Manager :**
   - Lors de toute rotation d'un secret, exécuter `gcloud secrets versions destroy <OLD_VERSION>` afin de maintenir le nombre total de versions actives à `≤ 4` (sous le seuil gratuit de 6 versions).
4. **Budget d'alerte Google Cloud Billing :**
   - Configurer un budget mensuel fixé à **`2,00 USD`** avec seuils d'alerte e-mail immédiats à **`50 %` (`1,00 $`)**, **`90 %` (`1,80 $`)** et **`100 %` (`2,00 $`)**.
   - *(Optionnel)* Raccorder le budget à une notification Pub/Sub déclenchant la révocation de `roles/run.invoker` en cas de franchissement du seuil de `5,00 USD`.

---

## 3. Résolution des Dépendances Techniques de Sécurité en Chantier D.2.5b

Les trois dépendances techniques identifiées lors de la planification D.2.5 ainsi que la revue IAM du compte de déploiement ont été intégralement résolues dans le code et la documentation lors du chantier **D.2.5b** :

| Réf. | Dépendance / Risque initialement identifié | Fichier(s) mis à jour en D.2.5b | Statut D.2.5b | Garantie de sécurité implémentée |
|---|---|---|---|---|
| **DEP-1** | **`CLOUD_RUN_PRIVATE_INVOCATION_DEPENDENCY`** : Acquisition d'un OIDC ID Token Google Cloud Run et envoi de `X-Serverless-Authorization`. | [webauthnAuthorityClient.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/webauthnAuthorityClient.js), [webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js) | **RÉSOLU (Code & Tests locaux)** | Validation des claims OIDC Vercel (`iss` Team/Global, `sub`, `exp`), échange STS WIF, `generateIdToken` avec `aud` exacte, rejet strict des jetons STS opaques utilisés comme ID token (`STS_ACCESS_TOKEN_NOT_ALLOWED_AS_ID_TOKEN`), double en-tête `X-Serverless-Authorization` + `Authorization`, zéro journalisation de jeton, rejet **fail-closed** (`503 AUTHORITY_UNAVAILABLE`) sans fallback. *(Validation Cloud Run réelle attendue lors du provisionnement autorisé).* |
| **DEP-2** | **Verrouillage autoritaire de `rpId` et `origin` côté serveur d'autorité** | [superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js), [webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js) | **RÉSOLU (Code & Tests locaux)** | `resolveAuthoritativeRpConfig` impose `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` depuis la configuration propre de l'autorité, rejette toute valeur divergente fournie par le backend (`INVALID_RP_ID` / `INVALID_ORIGIN`), vérifie `challengeRecord.rp_id` et `challengeRecord.origin`, et refuse de démarrer hors mode test jetable si `WEBAUTHN_RP_ID` ou `WEBAUTHN_ORIGIN` manque (`WEBAUTHN_RP_CONFIG_MISSING`). |
| **DEP-3** | **Protection de `/v1/credentials/revoke` et arrêt gracieux `SIGTERM`** | [superAdminWebAuthnAuthority.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/services/superAdminWebAuthnAuthority.js), [webauthnAuthorityServer.js](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/backend/authority/webauthnAuthorityServer.js) | **RÉSOLU (Code & Tests locaux)** | `/v1/credentials/revoke` impose inconditionnellement `requireRevocationAuthorization: true` (co-autorisation matérielle du 2e SuperAdmin ou jeton hors bande `oob_bootstrap` à usage unique lié au `credentialId`, tracé dans `yziow_refund_auth.consumed_enrollment_tokens`). Interception de `SIGTERM` refusant les nouvelles requêtes (`503 AUTHORITY_SHUTTING_DOWN`), drainant les connexions et fermant proprement le pool PostgreSQL (`closeAuthorityDbPool()`). |
| **IAM-T0** | **Escalade indirecte via le compte de déploiement (`sa-authority-deployer`)** | [p28c-d25-01-architecture-cloud-run.md](file:///C:/Users/acer/Downloads/D-ambassador-fix/worktrees/p28c-clean/docs/p28c-d25-01-architecture-cloud-run.md) | **RÉSOLU (Modèle IAM D.2.5b)** | `sa-authority-deployer` (`roles/run.developer` + `roles/iam.serviceAccountUser` sur `sa-webauthn-authority-run`) est classé **identité critique Tier-0** : (1) zéro privilège permanent (compte désactivé par défaut), (2) autorisation explicite et temporaire bornée dans le temps, (3) contrôle des déploiements par digest SHA-256 + Binary Authorization, (4) journalisation et alertes Cloud Audit Logs. |

---

## 4. Liste Séquentielle des Opérations Nécessitant une Nouvelle Autorisation Explicite du Propriétaire

Aucune des opérations ci-dessous n'est couverte par les chantiers D.2.5 / D.2.5b. Chacune devra faire l'objet d'une autorisation explicite :

1. **Autorisation #1 (Publication Git de D.2.5 / D.2.5b) :**
   - Autoriser la création du commit et le push sur `origin/feat/p28c-parent-pack-refund` (PR #83) des fichiers de durcissement D.2.5b et des 6 documents `docs/p28c-d25-*.md`.
2. **Autorisation #2 (Infrastructure Google Cloud & Facturation) :**
   - Autoriser la création du projet GCP `yziow-sec-auth-staging` (`europe-west1`), l'association du compte de facturation avec budget d'alerte à `2,00 USD`, la création des 3 Service Accounts (avec `sa-authority-deployer` désactivé au repos selon le modèle Tier-0), du Workload Identity Pool OIDC Vercel, du dépôt Artifact Registry et des 4 secrets Secret Manager de test.
3. **Autorisation #3 (Base de données Supabase Staging) :**
   - Autoriser la création ou désignation du projet Supabase Staging isolé, l'application des migrations jusqu'à `migration_p28c_parent_pack_refund.sql` et l'activation des rôles `yziow_webauthn_authority` et `yziow_refund_executor` avec mots de passe de préproduction.
4. **Autorisation #4 (Déploiement Cloud Run Staging & Configuration Vercel Preview) :**
   - Autoriser la construction de l'image Docker, son envoi sur Artifact Registry, le déploiement de `yziow-webauthn-authority-stg` (`--no-allow-unauthenticated`), l'activation d'OIDC Federation sur Vercel et l'ajout des variables de préproduction sur Vercel Preview.
5. **Autorisation #5 (Exécution des 16 scénarios de recette préproduction) :**
   - Autoriser l'exécution effective du plan de recette (`p28c-d25-05-plan-recette-preproduction.md`) avec identités fictives et collecte des preuves.

---

## 5. Références Officielles

- Google Cloud Run Pricing : https://cloud.google.com/run/pricing
- Google Cloud Free Program (Always Free Quotas) : https://cloud.google.com/free/docs/free-cloud-features#cloud-run
- Google Secret Manager Pricing : https://cloud.google.com/secret-manager/pricing
- Google Artifact Registry Pricing : https://cloud.google.com/artifact-registry/pricing
- Google Cloud Billing — Créer des budgets et des alertes : https://cloud.google.com/billing/docs/how-to/budgets
- Supabase Pricing & Manage Compute : https://supabase.com/pricing
