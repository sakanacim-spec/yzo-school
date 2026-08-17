# Plan de Correction Avant ("Forward Fix") - Sécurité des Futures Tables P1-A

> [!CAUTION]
> Un retour en arrière automatique rétablissant les accès publics permissifs ou supprimant la fonction `create_school_tables` est STRICTEMENT INTERDIT.
> Ne jamais utiliser `DROP FUNCTION` ni `GRANT ALL TO PUBLIC`. Suivre impérativement le plan de correction avant documenté ci-dessous.

---

## 1. Objectif et Périmètre Réel
Corriger la sécurité des futures tables créées dans le schéma `public` et sécuriser la fonction de création des tables de l'école `create_school_tables` afin d'empêcher les accès globaux non autorisés.

* **Rôles et DEFAULT PRIVILEGES ciblés** : Révocation des DEFAULT ACL sur les tables, séquences et fonctions créées par le rôle `postgres` uniquement (le rôle `supabase_admin` est expressément exclu).
* **Privilèges PostgreSQL 17** : Avec PostgreSQL 17, `GRANT ALL ON TABLES` inclut le privilège `MAINTAIN`. La migration SQL et le verify P1-A attendent explicitement ce privilège pour `service_role`.
* **Couverture des tables de l'école** : Redéploiement sécurisé de `create_school_tables` assurant l'activation de RLS et les permissions restreintes sur l'intégralité des **18 familles de tables** :
  `profiles_`, `students_`, `parent_student_`, `payments_`, `presences_`, `devoirs_`, `notes_`, `matieres_`, `classe_matieres_`, `activity_logs_`, `app_settings_`, `resources_`, `payrolls_`, `personnels_`, `expenses_`, `seances_`, `campaigns_`, `donations_`.

---

## 2. Fichiers canoniques et intégrité
* **Migration canonique** : `backend/scripts/migration_p1a_future_tables_security.sql`
* **SHA-256 approuvé** : `67C53BD2891133CF5BF448C8A2010ACA8495316F24AA0A183B237433BB4005CF`
* **Préflight lecture seule** : `backend/scripts/preflight_p1a_read_only.cjs`
* **SHA-256 du préflight** : `C7BFDA2F8DCA7D660F09165154EB4F605422D8ECF65ADE159E4FEC36C3CAB007`
* **Vérification lecture seule** : `backend/scripts/verify_p1a_read_only.cjs`
* **SHA-256 du verify** : `0A572724E20EF0EA11831354A5881C9225565EB85E3D362F2B4C6813C1FE317B`

---

## 3. Préconditions obligatoires
Avant toute opération sur la base de données :
* **Branche attendue** : `feature/e164-auth`
* **Gel opérationnel** : Aucune création d'école en cours.
* **Capacité du rôle courant** : Le rôle PostgreSQL utilisé doit pouvoir modifier les `DEFAULT PRIVILEGES` du rôle `postgres`. Aucun changement de DEFAULT ACL ne concerne `supabase_admin`.
* **Environnement cible** : Vérification formelle de la correspondance entre le projet Supabase et les paramètres de connexion PostgreSQL (`PGHOST`, `PGUSER`, `PGDATABASE`).
* **Variables d'environnement requises** : `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLROOTCERT` (sans divulgation de secrets).
* **Mode SSL** : `PGSSLMODE=verify-full` avec certificat CA existant et non vide.
* **Validation Préflight** : Exécution obligatoire du préflight en lecture seule avant migration :
  ```bash
  node backend/scripts/preflight_p1a_read_only.cjs --capture-read-only
  ```
  - Le script effectue une capture d'instantané (JSON/Markdown) en lecture seule sans modifier la base.
  - Tout code de sortie non nul ou échec interdit l'exécution de la migration.

---

## 4. Commande de migration
Commande générique sécurisée :
```bash
psql -X -w -v ON_ERROR_STOP=1 -f backend/scripts/migration_p1a_future_tables_security.sql
```

Détails opérationnels :
* `-X` : Ignore les fichiers de configuration psql locaux (`.psqlrc`).
* `-w` : Interdit les invites interactives de mot de passe.
* `ON_ERROR_STOP=1` : Arrête immédiatement l'exécution en cas d'erreur.
* Transaction atomique unique `BEGIN` / `COMMIT` : tout échec ou assertion non satisfaite déclenche un `ROLLBACK` automatique.

---

## 5. Vérification post-migration
Commande de vérification en lecture seule :
```bash
node backend/scripts/verify_p1a_read_only.cjs --verify-read-only
```

Exigences :
* Exécution après un code de sortie `0` de la migration.
* Session vérifiant `transaction_read_only = on` avec `ROLLBACK` systématique en `finally`.
* Valide les 6 DEFAULT ACL sur `postgres` (avec `MAINTAIN`), la signature exacte de `create_school_tables` (5 arguments), la présence des 18 familles et le confinement des privilèges d'exécution.

---

## 6. État actuel validé
* **Exécution de la migration** : La migration P1-A a déjà été exécutée avec succès.
* **Validation transactionnelle** : Le `COMMIT` SQL a été observé.
* **Audit post-migration** : Le verify strictement en lecture seule a réussi.
* **Couverture des familles** : Les 18 familles ont été validées.
* **DEFAULT ACL** : Les DEFAULT ACL du rôle `postgres` ont été validées.
* **Intégrité de la fonction** : La fonction `create_school_tables` est unique et sécurisée.
* **Non-réexécution** : La migration ne doit pas être réexécutée automatiquement.
* **Consigne de diagnostic** : En cas de doute, effectuer uniquement un diagnostic ou le verify en lecture seule avant toute décision.

---

## 7. Gestion des incidents et Forward Fix
* **État déjà appliqué** : Si le préflight ou le verify confirme que les DEFAULT ACL et la fonction à 18 familles sont déjà déployés de manière conforme, ne pas réexécuter la migration.
* **Rollback automatique** : Aucune commande `ROLLBACK` manuelle n'est nécessaire si la migration échoue avant `COMMIT`.
* **Interdictions strictes** :
  - Ne jamais exécuter `DROP FUNCTION public.create_school_tables`.
  - Ne jamais exécuter de `GRANT ALL TO PUBLIC`.
* **Procédure de restauration ciblée (Forward Fix)** :
  - En cas de nécessité de restauration, s'appuyer sur l'instantané capturé par le préflight et appliquer une mise à jour ciblée par `CREATE OR REPLACE FUNCTION` et réattribution explicite des privilèges (`TO service_role, postgres`).
  - Toute correction doit être ciblée et exécutée dans une nouvelle transaction contrôlée.
  - Après la correction, exécuter obligatoirement :
    ```bash
    node backend/scripts/verify_p1a_read_only.cjs --verify-read-only
    ```

---

## 8. Risque de mauvaise cible
* La modification des DEFAULT PRIVILEGES et de la fonction de création des tables scolaires impacte directement l'isolation multi-tenant de la plateforme.
* Toute opération sur une mauvaise base ou un mauvais projet constitue un incident critique et impose un arrêt immédiat, sans poursuivre la migration ni effectuer de correction improvisée.
* Toujours contrôler la branche, le projet cible et les variables de connexion avant toute intervention.
