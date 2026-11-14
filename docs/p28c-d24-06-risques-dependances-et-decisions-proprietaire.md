# YZIOW P28c — Chantier D.2.4 (Volet 6)
# Risques Résiduels, Dépendances Ouvertes et Décisions Soumises au Propriétaire

> **Statut :** Document de synthèse décisionnelle D.2.4 — **Aucune action exécutée sans accord du propriétaire**.

---

## 1. Décisions d'infrastructure nécessitant l'accord du propriétaire

Avant de pouvoir engager la **Phase B** (validation sur infrastructure isolée non productive), le propriétaire de YZIOW doit trancher les quatre points suivants :

| # | Décision attendue du propriétaire | Option recommandée | Alternatives étudiées | Estimation conditionnelle de coût mensuel |
|---|---|---|---|---|
| **D1** | **Choix de l'hébergeur du service isolé `webauthnAuthorityServer.js`** | **Google Cloud Run** (dans un projet GCP dédié à la sécurité) ou **Fly.io** (dans une organisation dédiée) | Railway (Plan Hobby/Pro) ou 2e compte Vercel indépendant | *Estimations conditionnelles selon trafic et mode d'allocation :*<br>- **Cloud Run :** ~0 $ à 5 $/mois (à la requête, dans la limite du Free Tier) ou ~15–25 $/mois (instance permanente).<br>- **Fly.io :** ~2,19 $ à 6,70 $/mois (+ egress).<br>- **Railway :** ~5 $ à 10 $/mois. |
| **D2** | **Mode de connexion PostgreSQL du rôle `yziow_webauthn_authority` vers Supabase** | **Pooler Supavisor Session Mode (`:5432`)** en IPv4 (`yziow_webauthn_authority.<project_ref>`) ou **Connexion directe IPv6** (`db.<project_ref>.supabase.co:5432`) si Fly.io / VPC IPv6 est retenu | Option payante Supabase IPv4 Add-on pour connexion directe IPv4 | - Supavisor Session Mode ou IPv6 direct : **0 $ supplémentaire**.<br>- Supabase IPv4 Add-on : `COÛT À CONFIRMER` selon le plan Supabase actuel. |
| **D3** | **Équipement matériel FIDO2/WebAuthn des deux SuperAdmins physiques** | **2 clés de sécurité matérielles FIDO2** (ex. YubiKey 5 Series avec code PIN configuré pour `UV=1`) + 1 clé de secours hors ligne par SuperAdmin | Passkeys matérielles liées à l'enclave sécurisée (TPM / Secure Enclave) de deux postes distincts dédiés | Aucun coût récurrent d'abonnement (matériel physique acquis une seule fois si non déjà détenu). |
| **D4** | **Autorisation de lancer la Phase B (environnement de test/staging isolé)** | **Autoriser uniquement la Phase B** (hors production) après validation des choix D1 et D2 | Différer la Phase B jusqu'à l'achèvement des chantiers FedaPay et WORM | Aucun impact sur la production. |

---

## 2. Prérequis techniques à fournir par le propriétaire (uniquement lorsque la Phase B sera autorisée)

1. Un projet ou espace isolé sur l'hébergeur retenu en **D1** (sans aucun secret de production).
2. Une instance PostgreSQL / projet Supabase de **pré-production (staging)** distincte de la base de production, permettant d'appliquer `migration_p28c_parent_pack_refund.sql` et de tester la connexion Supavisor/directe des rôles `yziow_webauthn_authority` et `yziow_refund_executor`.
3. Le sous-domaine ou l'origine HTTPS de pré-production pour le Relying Party WebAuthn (`YZIOW_WEBAUTHN_RP_ID` et `YZIOW_WEBAUTHN_ORIGIN`).

---

## 3. Risques résiduels identifiés et mesures de réduction

| Risque résiduel | Gravité | Cause technique | Mesure d'atténuation prévue dans le plan D.2.4 |
|---|---|---|---|
| **R1 — Présence accidentelle d'un `DATABASE_URL` propriétaire (`postgres`) dans Vercel** | Critique | Si le backend applicatif sur Vercel détient le mot de passe du rôle propriétaire `postgres`, un attaquant compromettant le backend peut contourner tous les `REVOKE ALL` SQL. | **Interdiction absolue** de `DATABASE_URL` (rôle `postgres`) dans Vercel ; le backend ne doit détenir que `SUPABASE_SERVICE_ROLE_KEY` (`service_role`) et `YZIOW_REFUND_DATABASE_URL` (`yziow_refund_executor`). |
| **R2 — Accès humain partagé entre Vercel et l'hébergeur de l'Autorité** | Élevée | Si un même compte développeur ou un même jeton CI/CD a accès aux secrets de Vercel et à ceux du conteneur d'autorité, la séparation tombe en cas de vol de ce compte. | Héberger l'autorité dans un compte/projet cloud distinct accessible **exclusivement** au propriétaire avec MFA matériel FIDO2, sans déploiement automatique depuis le dépôt principal. |
| **R3 — Dépendance de `pg` en production (`dependencies`)** | Résolu en D.2.4 | `pg` figurait initialement dans `devDependencies` du `package.json` racine. | **Corrigé en D.2.4 :** `pg` et `@simplewebauthn/server` sont désormais déclarés dans `dependencies` de `package.json`, `backend/package.json` et `package-lock.json` (vérifié par le test d'intégration 90). |
| **R4 — Anti-rejeu des jetons `oob_bootstrap` et `enrollment_approval` en cas de redémarrage ou multi-instances** | Résolu en D.2.4 | L'ensemble `consumedEnrollmentTokens` était initialement en mémoire du processus. | **Corrigé en D.2.4 :** Consommation atomique et persistante dans `yziow_refund_auth.consumed_enrollment_tokens` via `yziow_refund_auth.consume_enrollment_approval_token`, survivant aux redémarrages et aux requêtes concurrentes. |

---

## 4. Dépendances globales restantes avant toute activation des remboursements Parent Pack (P28c)

Le chantier P28c repose sur **trois piliers de sécurité indépendants** matérialisés par `public.parent_pack_refund_security_gate` :

1. **Pilier 1 — Authentification forte personnelle indépendante des 2 SuperAdmins (`independent_admin_auth_ready = false`) :**
   - *Code et SQL :* Terminés et validés en D.2.1, D.2.2 et D.2.3 (`203/203 PASS`).
   - *Plan d'infrastructure :* Préparé en D.2.4 (présent dossier).
   - *Reste à faire :* Exécution autorisée de la Phase B puis de la Phase C (hébergement isolé + enrôlement matériel des 2 SuperAdmins).
2. **Pilier 2 — Preuve fournisseur FedaPay certifiée indépendante (`independent_fedapay_proof_ready = false`) :**
   - *Reste à faire :* Garantir que la preuve de remboursement FedaPay ne repose pas sur une simple déclaration ou sur un appel backend falsifiable, mais sur une preuve cryptographique / vérification fournisseur indépendante certifiée.
3. **Pilier 3 — Stockage privé immuable WORM des justificatifs (`private_worm_storage_ready = false`) :**
   - *Reste à faire :* Connecter et valider un stockage privé réel doté de verrouillage d'objet immuable (WORM / Object Lock) pour les pièces justificatives de remboursement.

Tant que ces trois piliers ne sont pas tous opérationnels et validés :
- `independent_admin_auth_ready = false`
- `independent_fedapay_proof_ready = false`
- `private_worm_storage_ready = false`
- `SECURITY_BLOCKER` actif en base de données
- `SAFE_DISABLED` (`503`) actif sur la route HTTP de remboursement direct
- `READY_FOR_PRODUCTION = NO`
