# Contrat de Données de la File Interne de Revue Manuelle (SaaS Hérité)

## 1. Finalité et périmètre
- **Finalité :** La file interne permet aux opérateurs de YZIOW d'être alertés et de statuer sur tout flux inattendu relatif à l'ancien modèle économique SaaS facturé aux écoles.
- **Périmètre exclusif :** La file concerne exclusivement les événements historiques liés au type de paiement `saas_subscription`. Les flux `tuition`, `donation` et le futur `parent_pack` en sont strictement exclus.
- **Limites :** Ce système ne crée ni paiement, ni devis, ni dette. Ce n'est pas un outil général de support client, mais un mécanisme d'isolation technique et d'audit.
- **Protection contre les automatismes :** Aucun événement de la file interne, y compris un doublon ou un ancien webhook SaaS, ne doit automatiquement activer, expirer, suspendre, limiter, supprimer ou rembourser une école. Toute décision ayant un effet sur une école ou un paiement doit être prise et tracée par un utilisateur interne YZIOW autorisé.

## 2. Événement d’entrée
L'ajout d'une notification à la file s'opère selon l'ordre conceptuel obligatoire suivant dans le contrôleur backend :
1. **Vérification de signature :** La signature du webhook FedaPay doit d'abord être validée de manière standard.
2. **Identification :** Le type de paiement cible doit être explicitement reconnu comme `saas_subscription`.
3. **Recherche :** Interrogation de la base de données pour localiser une éventuelle entrée de revue existante à l'aide de l'identifiant réel de l'événement ou de la transaction.
4. **Persistance :** Création ou réutilisation atomique de l'entrée dans la table de la file interne.
5. **Accusé de réception :** Réponse `200 OK` au prestataire FedaPay **seulement après** cette prise en compte durable, garantissant qu'aucune donnée n'est perdue.

*(L'identifiant exact fourni par FedaPay est un identifiant réel de l'événement ou de la transaction, à confirmer dans le contrôleur existant).*

## 3. Proposition de modèle de données
La table interne sera nommée de manière conceptuelle claire, par exemple :
`legacy_saas_manual_reviews`

**Champs conceptuels :**
- `id` (UUID, clé primaire) : identifiant interne unique.
- `provider_event_ref` (Chaîne) : référence opaque et idempotente de l’événement prestataire (l'identifiant FedaPay).
- `payment_intent_id` (UUID, nullable) : référence à l'intention de paiement d'origine, uniquement si le schéma réel permet d'associer cet UUID en toute sécurité.
- `school_slug` (Chaîne, nullable) : identifiant du client final (l'école), uniquement si disponible de manière fiable depuis le payload ou l'intention de paiement.
- `status` (Enum) : statut actuel de la revue.
- `reason` (Chaîne) : motif explicite de mise en revue (ex: "Legacy webhook received").
- `received_at` (Timestamp) : date de première réception de l'événement.
- `assigned_to` (UUID, nullable) : utilisateur interne assigné, si applicable.
- `decision_action` (Chaîne, nullable) : décision manuelle prise.
- `decided_by` (UUID, nullable) : utilisateur ayant pris la décision.
- `decided_at` (Timestamp, nullable) : date de décision.
- `decision_note` (Texte, nullable) : note de décision, obligatoirement limitée et non sensible.
- `created_at` / `updated_at` (Timestamp) : dates de création et mise à jour.

**Statuts sans automatisme :**
- `OPEN` : Nouvelle revue à traiter.
- `IN_REVIEW` : Analyse en cours par un opérateur.
- `RESOLVED_NO_ACTION` : Dossier clos sans action requise.
- `REFUND_REVIEW` : Remboursement à l'étude.
- `REFUND_COMPLETED` : Remboursement acté.
- `CLOSED` : Dossier définitivement fermé.

*Chaque transition de statut et action doit être effectuée par un humain et dûment auditée.*

## 4. Idempotence et intégrité
- **Unicité :** Une même notification FedaPay (sur la base de `provider_event_ref`) ne doit créer qu’une seule revue dans la base.
- **Ré-entrance :** Une notification répétée doit retrouver la revue existante, sans altérer l'historique décisionnel, et permettre de répondre 200 OK.
- **Indépendance :** Le modèle de données ne doit pas supposer le format ou le nom exact de l'identifiant prestataire, il doit le stocker comme une clé abstraite.
- **Contraintes :** Une contrainte d'unicité `UNIQUE (provider_event_ref)` est un prérequis conceptuel à confirmer avant migration.
- **Sanétisation :** Ne jamais utiliser les données brutes du webhook comme clé primaire ou journal lisible.

## 5. Confidentialité et droits d’accès
- **Absence de charge utile :** Aucun payload brut FedaPay n'est enregistré.
- **Minimalisme :** Aucun secret, clé d'API, numéro de téléphone, email ou donnée bancaire non nécessaire au traitement n'est stocké.
- **Invisibilité client :** Aucune visibilité n'est permise pour le rôle public (`anon`), les utilisateurs connectés de l'application (`authenticated`), les écoles ou les parents.
- **Accès restreint :** L'accès est strictement réservé à un rôle interne YZIOW explicitement autorisé (à confirmer selon le modèle de rôles internes existants).
- **Sécurité Supabase :** Des politiques Row-Level Security (RLS) strictes seront obligatoires dans la future migration.
- **Audit :** L'identité du décideur et ses notes sont journalisées.

## 6. Remboursement
- **Aucun automatisme :** La file interne n'initie, ne valide, ni n'exécute de remboursement automatiquement.
- **Signalement :** Elle peut seulement indiquer (par son statut `REFUND_REVIEW` et ses notes) qu’un dossier exige un remboursement éventuel.
- **Action humaine :** Le remboursement réel dépend d'une politique de l'entreprise validée, des capacités FedaPay et d'une décision humaine appliquée manuellement.

## 7. Conditions indispensables avant migration SQL
Avant toute exécution ou création de code/migration SQL, les validations suivantes sont requises :
- **Inventaire Staging :** Inventaire réel du schéma sur l'environnement Staging.
- **Intégrité intention :** Structure confirmée de la table `payment_intents`.
- **Preuve webhook :** Clé d'identifiant réel garanti à recevoir dans le webhook FedaPay.
- **Sécurité accès :** Définition exacte du rôle interne autorisé dans le modèle RLS actuel.
- **Conservation :** Validation légale et technique de la durée de conservation de ces enregistrements.
- **Processus humain :** Procédure opérationnelle documentée décrivant qui et comment l'équipe interne traite ces revues.
- **Processus financier :** Politique de remboursement clairement définie.
- **Garantie technique :** Existence de tests d’idempotence, de validation des RLS et d'absence totale d'action automatique avant déploiement.
