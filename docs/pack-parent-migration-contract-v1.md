# Pack Parent V1 – Migration Contract (Phase 2B)

---

## 1. Règle d’accès Pack Parent

- **Définition conceptuelle** : l’accès Pack Parent est accordé lorsqu’un parent **est actuellement lié à l’enfant** **ET** que l’enfant est **couvert** par :
  - une période d’abonnement active,
  - une période de grâce active,
  - ou une exonération active.
- **Accès aux données pédagogiques** : le champ `subscriber_parent_id` (parent payeur) **ne doit jamais** être utilisé comme condition unique d’accès ; l’autorisation repose sur le lien réel parent‑enfant stocké dans les tables dynamiques de l’établissement (`parent_student_<school_slug>`).
- **Accès multi‑parents** : plusieurs parents liés à un même enfant bénéficient chacun des fonctions pédagogiques du Pack Parent tant que le lien parent‑enfant est actif.

---

## 2. Proposition corrigée – `parent_subscriptions`

| Colonne proposée | Description |
|---|---|
| `id` | PK UUID. |
| `subscriber_parent_id` | UUID du parent payeur (facturation, remboursement, traçabilité). Relation conceptuelle, vérifiée côté backend dans `profiles_<school_slug>`. |
| `student_id` | UUID de l’enfant couvert. Relation conceptuelle, vérifiée dans `students_<school_slug>`. |
| `school_slug` | Slug de l’établissement (référence unique à `public.schools.slug`). |
| `plan_type` | Enum `MONTHLY` (paiement manuel d’un mois), `ANNUAL` (tranche unique de 10 mois, sans remise supplémentaire). |
| `amount_minor` | Montant payé en valeur entière FCFA (jamais de flottants ni de centimes). |
| `currency` | Texte, toujours `'XOF'`. Les montants USD/EUR sont des références futures non actives nécessitant une évolution additive. |
| `payment_provider_ref` | Référence du prestataire FedaPay. |
| `start_date` | Date de début de l’abonnement. |
| `end_date` | Date de fin prévue de l’abonnement. |
| `grace_end_date` | Fin de la période de grâce (exactement 7 jours calendaires après `end_date`, uniquement lorsqu’aucune période suivante valide ne reprend avant ou pendant cette période). |
| `status` | Enum `PENDING_PAYMENT` (n’accorde jamais l’accès), `ACTIVE`, `GRACE`, `EXPIRED`, `CANCELED`, `REFUNDED`. |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

- **Contraintes d’unicité** : après validation du schéma Staging, aucune double couverture active ou en grâce ne doit exister pour le même `student_id` au sein d’un même `school_slug`. Les statuts `PENDING_PAYMENT`, `EXPIRED`, `CANCELED` et `REFUNDED` n’empêchent pas un renouvellement ultérieur.
- **Index** : index composés sur `student_id`, `status` pour les requêtes d’accès.

---

### 2.b. Proposition corrigée – `parent_subscription_periods`

| Colonne proposée | Description |
|---|---|
| `id` | PK UUID. |
| `parent_subscription_id` | FK → `parent_subscriptions.id`. |
| `payer_parent_id` | UUID du parent qui effectue le paiement (facturation, traçabilité). Relation conceptuelle, vérifiée dans les tables dynamiques de l’établissement. |
| `payment_intent_id` | FK → `public.payment_intents.id`. |
| `plan_type` | Enum `MONTHLY` (paiement manuel d’un mois), `ANNUAL` (tranche unique de 10 mois, sans remise supplémentaire). |
| `amount_minor` | Montant payé en valeur entière FCFA (jamais de flottants ni de centimes). |
| `currency` | Texte, toujours `'XOF'`. Les montants USD/EUR sont des références futures non actives nécessitant une évolution additive. |
| `status` | Enum `pending_payment`, `scheduled`, `active`, `grace`, `expired`, `canceled`, `refunded`. |
| `start_date` | Date de début de la période. |
| `end_date` | Date de fin prévue de la période. |
| `grace_end_date` | Fin de la période de grâce (exactement 7 jours calendaires après `end_date`, uniquement lorsqu’aucune période suivante valide ne reprend). |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

- **Statut `scheduled`** : utilisé pour les renouvellements payés avant l’expiration de la période précédente.
- **Statut `pending_payment`** : aucune période n’est active tant que le paiement n’est pas confirmé.

---

## 3. Proposition corrigée – `parent_exemptions`

| Colonne proposée | Description |
|---|---|
| `id` | PK UUID. |
| `student_id` | UUID de l’enfant concerné (conceptuel, vérifié dans `students_<school_slug>`). |
| `school_slug` | Slug de l’établissement (référence `public.schools.slug`). |
| `issuer_parent_id` | UUID du parent (ou administrateur) qui accorde l’exonération. Aucun FK déclaré ; vérifié côté backend. |
| `valid_from` | Date de début. |
| `valid_to` | Date de fin. |
| `reason` | Texte libre (motif). |
| `created_at` | Timestamp. |
| `revoked_at` | Nullable Timestamp (date de révocation). |
| `revocation_reason` | Nullable texte. |

- **Effet** : lorsqu’une exonération est valide (`valid_from ≤ today ≤ valid_to`) et non révoquée, l’accès Pack Parent de l’enfant est considéré comme **ACTIF**, sans génération de commission, de reversement ou de paiement.

---

## 4. Proposition corrigée – `school_commission_ledger`

| Colonne proposée | Description |
|---|---|
| `id` | PK UUID. |
| `school_slug` | Slug de l’établissement (référence `public.schools.slug`). |
| `period_id` | FK → `parent_subscription_periods.id`. |
| `month` | CHAR(7) `YYYY‑MM`. |
| `gross_amount` | Montant brut de l’abonnement (BIGINT, valeur entière FCFA). |
| `provider_fees` | Frais FedaPay (BIGINT). |
| `net_amount` | `gross_amount - provider_fees`. |
| `commission_etablissement` | 20 % du `gross_amount`. |
| `commission_ambassadeur` | 10 % du `gross_amount`. |
| `status` | Enum `PENDING`, `POSTED`, `REVERSED`. |
| `source_reference` | Référence transaction (`payment_intents.id` ou `payment_provider_ref`). |
| `reversal_reference` | Nullable FK → même table (entrée de contre‑passation). |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

- **Unicité** : combinaison `(school_slug, period_id, month)` doit être unique ; cela empêche deux enregistrements de commission identiques pour la même période de souscription, tout en autorisant plusieurs périodes d’une même école dans le même mois.
- **Index** : index sur `school_slug`, `month`, `period_id`.

---

## 5. Proposition corrigée – Reversements (`school_payouts` + sous‑tables)

### 5.1 Table principale – `school_payouts`

| Colonne | Description |
|---|---|
| `id` | PK UUID. |
| `school_slug` | Slug de l’établissement (référence `public.schools.slug`). |
| `month` | CHAR(7) `YYYY‑MM`. |
| `payout_amount` | Montant total (BIGINT, valeur entière FCFA) ≥ 2 000 FCFA. |
| `status` | Enum `DRAFT`, `APPROVED`, `SENDING`, `SENT`, `FAILED`, `CANCELED`. |
| `provider_reference` | Référence unique du prestataire (FedaPay). |
| `channel` | Canal actif (ex. `Mobile Money`). |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

- **Règle métier** : un reversement regroupe **plusieurs lignes de commission** provenant de `school_commission_ledger`. Chaque ligne de commission ne doit être liée qu’à un seul `school_payout` (FK → `school_payout_items`).
- **Seuil** : le reversement n’est créé que si le total cumulé ≥ 2 000 FCFA ; le solde inférieur est reporté au mois suivant.

### 5.2 Table de liaison – `school_payout_items`

| Colonne | Description |
|---|---|
| `id` | PK UUID. |
| `payout_id` | FK → `school_payouts.id`. |
| `commission_id` | FK → `school_commission_ledger.id`. |
| `amount` | Montant de la commission affectée (BIGINT). |
| `created_at` | Timestamp. |

- **Contraintes** : `commission_id` ne peut apparaître qu’une fois dans `school_payout_items` (unicité). Cela garantit qu’une commission ne soit payée qu’une seule fois.

### 5.3 Table d’audit des tentatives – `school_payout_attempts`

| Colonne | Description |
|---|---|
| `id` | PK UUID. |
| `payout_id` | FK → `school_payouts.id`. |
| `attempt_timestamp` | Timestamp. |
| `status` | Enum `STARTED`, `SUCCESS`, `ERROR`. |
| `provider_response` | JSON (Libellé ou code retour FedaPay). |
| `log` | Texte libre (debug). |

- **Objectif** : tracer chaque appel au prestataire, rendre l’opération audit‑able et détecter les doublons.

---

## 6. Canal de reversement

- **Canal actif** : le canal de paiement (`payout_momo_number`, `payout_method`, …) doit être **validé** avant tout reversement. La validation inclut :
  - contrôle d’appartenance à l’établissement,
  - vérification de la conformité du format,
  - masquage du numéro dans toutes les interfaces non autorisées.
- **Historique immuable** : chaque modification du canal est enregistrée dans `payout_channel_audits` (voir audit du modèle). Les champs `old_channel` et `new_channel` sont stockés chiffrés ou masqués, l’entrée comporte `changed_by`, `changed_at`.

---

## 7. Frontières financières et confidentialité

- **Montants** : tous les montants sont stockés **en entier** (valeur entière FCFA/XOF). Aucun champ flottant ni concept de "centimes" ne doit être introduit.
- **Politique V1 validée (Matrice XOF)** :
  - Maternelle / Primaire : 100 FCFA par mois ; 1 000 FCFA annuels.
  - Collège / Secondaire : 150 FCFA par mois ; 1 500 FCFA annuels.
  - Supérieur / Formation : 200 FCFA par mois ; 2 000 FCFA annuels.
- **Formule annuelle/mensuelle** :
  - acquisition : pour une période annuelle payée d’avance, inscrire chaque mois une acquisition de 1/10 des commissions ; toute annulation, fraude, contestation ou remboursement doit déclencher une contrepassation traçable.
  - commission établissement : 20 % du `gross_amount`.
  - frais prestataire : répartis mensuellement sur le montant brut, absorbés par YZIOW.
  - commission ambassadeur : 10 % du `gross_amount`. L’ambassadeur attribué de manière unique et traçable à un établissement reçoit sa commission sans date d’expiration arbitraire, uniquement sur les acquisitions mensuelles effectivement encaissées. Aucun montant n’est dû pour un paiement annulé, remboursé, contesté ou frauduleux ; une contrepassation traçable est obligatoire. Toute réattribution rétroactive est interdite, sauf procédure interne anti-fraude documentée et auditée.
  - part nette YZIOW = Brut - commission établissement - commission ambassadeur - (frais prestataire répartis).
- **Accès pédagogique** : les fonctions Pack Parent (notes, présences, ressources, badges, messagerie, notifications ciblées) sont accessibles à **tout parent lié à l’enfant**, indépendamment du parent payeur.
- **Facturation / remboursement** : les données de paiement, factures et historiques de remboursement sont **rattachées uniquement au `subscriber_parent_id`** (parent payeur).

---

## 8. `payment_intents`

- **Stratégie d’intégration conditionnelle** :
  - Ne pas affirmer l’existence actuelle de la colonne `payment_type`.
  - Avant toute migration, vérifier le schéma réel du staging / production :
    - la table `payment_intents` existe‑t‑elle ?
    - quels champs sont déjà présents ?
  - Si la table existe, envisager d’ajouter une colonne `payment_type` (enum `PACK_PARENT`, `DONATION`, `TUITION`) **après validation** afin de pouvoir filtrer les paiements Pack Parent.
  - La séparation entre les flux Pack Parent, écolage et dons doit rester stricte ; aucune logique métier existante ne doit être modifiée tant que la vérification du schéma n’est pas confirmée. Aucune modification rétroactive de P14 ni de l’historique XOF n'est autorisée. Les noms des colonnes techniques proposés ou présents dans les migrations ne doivent pas être renommés.

---

## 9. Conditions indispensables avant rédaction de la migration SQL

- **Inventaire réel du schéma Staging** : extraire la liste exhaustive des tables, colonnes et vues présentes dans l’environnement Staging (Supabase). Vérifier l’existence de `payment_intents`, `schools`, les tables dynamiques (`profiles_<slug>`, `students_<slug>`, `parent_student_<slug>`).
- **Confirmation du modèle parent‑enfant** : s’assurer que le lien `parent_student_<slug>` (ou équivalent) expose une contrainte d’intégrité référentielle.
- **Confirmation du mécanisme de paiement existant** : valider que le webhook FedaPay, la création d’intention de paiement et la logique d’idempotence fonctionnent et que les champs `payment_gateway`, `payment_public_key`, `payment_secret_key` sont disponibles.
- **Décision sur la visibilité des reçus** : déterminer si les reçus et l’historique de paiement du Pack Parent sont visibles par les parents non payeurs liés à l’enfant.
- **Validation du modèle de reversement et exigences FedaPay** :
  - canal de reversement renseigné et vérifié ;
  - seuil minimal de 2 000 FCFA confirmé ;
  - processus d’audit des changements de canal (table `payout_channel_audits`).

---

*Ce document constitue le contrat de migration : il regroupe les propositions à valider avant la création des scripts SQL définitifs. Aucun code, migration ou modification de base de données n’est réalisé à ce stade.*

---

PACK_PARENT_MIGRATION_CONTRACT_READY: true
REPOSITORY_UNCHANGED_EXCEPT_DOCS: true
