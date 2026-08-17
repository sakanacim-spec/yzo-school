# Plan de Correction Avant ("Forward Fix") - Confinement RLS P0

> [!CAUTION]
> Un retour en arrière automatique rétablissant les accès PUBLIC permissifs ou désactivant la RLS sur les tables cibles est STRICTEMENT INTERDIT. Il réintroduirait immédiatement les vulnérabilités majeures d'accès aux données scolaires.
>
> En cas de dysfonctionnement applicatif après l'application de la migration P0, ne jamais désactiver la RLS ni redonner d'accès à PUBLIC. Suivre plutôt le plan de correction avant ci-dessous.

---

## 1. Analyse des Comportements Applicatifs Suspects
Si le backend renvoie des erreurs d'accès refusé (401/403) :
* Vérifier que les variables d'environnement `SUPABASE_SERVICE_ROLE_KEY` et `JWT_SECRET` sont correctement chargées et valides dans le fichier `.env` du backend.
* S'assurer que le client Supabase instancié côté serveur utilise bien la clé de service (`service_role_key`) et non la clé anonyme (`anon_key`).

---

## 2. Procédure de Rétablissement Sécurisé
Si un rôle spécifique (par exemple `authenticated` pour les parents) requiert un accès légitime en lecture seule à une table (par exemple `matieres`) :
* NE PAS supprimer ni modifier la politique de service_role.
* Créer une politique additionnelle ciblée, restrictive et documentée.
* Exemple de structure recommandée :
  `CREATE POLICY nom_politique ON table FOR SELECT TO authenticated USING (condition_d_isolation);`

---

## 3. Fichiers canoniques et intégrité
* **Migration canonique** : `backend/scripts/migration_p0_confinement.sql`
* **SHA-256 approuvé** : `013FFA00721FA238C6F5B72FD3130CF585499A814E8360AF99A03EA42F8FA13C`
* **Vérification lecture seule** : `backend/scripts/verify_p0_confinement.cjs`
* **SHA-256 du verify** : `4CD11A1EE5BB5969167383A51648D9BD6EFE4700263000FFACB6799DDFFD2565`
* **Préflight lecture seule** : `backend/scripts/preflight_p0_read_only.cjs`
* **SHA-256 du préflight** : `1046427D7836BA0E6EE5CE5E1A0C667B302D1325657848C03365A9897F717C70`

> [!WARNING]
> Le fichier `backend/scripts/14_fix_supabase_rls_security.sql` est obsolète, dangereux et ne doit jamais être exécuté après la migration P0.

---

## 4. Préconditions obligatoires
Avant toute exécution, s'assurer que l'ensemble des conditions suivantes sont réunies :
* **Branche attendue** : `feature/e164-auth`
* **Environnement cible** : Environnement Supabase/PostgreSQL explicitement vérifié avant exécution.
* **Correspondance de projet** : Correspondance obligatoire entre la référence projet Supabase et la connexion PostgreSQL.
* **Variables d'environnement requises** : `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` et `PGSSLROOTCERT` (sans divulguer leurs valeurs).
* **Certificat SSL** : Fichier certificat CA existant et non vide.
* **Mode SSL** : `PGSSLMODE=verify-full`
* **Intégrité du fichier SQL** : Hash SHA-256 du script SQL vérifié avant exécution.
* **Validation Préflight** : Exécuter obligatoirement le script de contrôle pré-migration :
  ```bash
  node backend/scripts/preflight_p0_read_only.cjs --preflight-read-only
  ```
  - Cette commande doit être exécutée avant toute migration.
  - Elle doit retourner `PREFLIGHT_P0 : SUCCÈS` et un code de sortie `0`.
  - Tout autre résultat interdit l'exécution de la migration.
  - Elle effectue uniquement des lectures DB dans une transaction `READ ONLY` suivie d'un `ROLLBACK`.
* **Blocage** : Aucune exécution si une seule précondition échoue.

---

## 5. Commande de migration
Commande générique à exécuter :
```bash
psql -X -w -v ON_ERROR_STOP=1 -f backend/scripts/migration_p0_confinement.sql
```

Détails des options et de la transaction :
* `-X` : Ignore les fichiers de configuration psql locaux (`.psqlrc`).
* `-w` : Interdit toute demande interactive de mot de passe (échoue immédiatement si l'authentification n'est pas fournie).
* `ON_ERROR_STOP=1` : Arrête immédiatement l'exécution au premier échec rencontré.
* Le script contient une transaction `BEGIN` / `COMMIT` unique.
* Toute erreur ou `RAISE EXCEPTION` survenant avant `COMMIT` provoque l'annulation intégrale (`ROLLBACK` implicite) de la transaction.

---

## 6. Vérification post-migration
Commande de vérification en lecture seule :
```bash
node backend/scripts/verify_p0_confinement.cjs --verify-read-only
```

Exigences :
* Exécution autorisée uniquement après un code de sortie `0` de la commande de migration.
* La session PostgreSQL vérifie impérativement que `transaction_read_only` est `on`.
* Aucune écriture n'est effectuée sur la base de données, l'Auth, le Storage ou le système de fichiers.
* Un code de sortie non nul bloque toute continuation opérationnelle.

---

## 7. Échec, rollback et réexécution
* **Rollback automatique** : Aucune commande `ROLLBACK` manuelle n'est nécessaire si la migration échoue avant `COMMIT`, le blocage transactionnel annulant tout effet.
* **Interdiction de retour permissif** : Ne jamais appliquer un rollback permissif réouvrant les accès publics.
* **Non-réexécution automatique** : Ne jamais réexécuter automatiquement la migration.
* **Idempotence** : La migration est non idempotente.
* **Blocage de sécurité** : Une seconde exécution est volontairement bloquée par le précontrôle vérifiant le nombre initial et la structure des politiques.
* **Procédure d'incident** : Conserver l'intégralité de la sortie d'erreur et préparer un forward fix ciblé.
* **Politiques existantes** : Aucune modification manuelle des politiques avant diagnostic approfondi.

---

## 8. Risque de mauvaise cible
* La migration applique un confinement strict sur les politiques RLS et restreint les privilèges d'exécution de la procédure sensible `drop_school_tables(text)`.
* Cibler une mauvaise base de données ou un mauvais projet constitue un incident critique de production.
* Vérifier formellement la branche Git, le projet cible et la chaîne de connexion avant l'exécution.
* Arrêter immédiatement toute opération si l'environnement détecté ne correspond pas à la cible attendue.
