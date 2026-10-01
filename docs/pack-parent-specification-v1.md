# YZIOW — Spécification Métier Pack Parent V1

> **Version :** 1.0
> **Date :** 2026-09-29
> **Statut :** Toutes les décisions métier V1 sont validées
> **Avertissement :** Ce document est une spécification métier interne. Il ne constitue pas un avis juridique, fiscal ou réglementaire.

---

## 1. Objectif et périmètre

### 1.1 Objectif
Ce document formalise les règles métier du modèle commercial « Pack Parent V1 » de la plateforme YZIOW. Il sert de référence unique pour la conception du modèle de données, des règles de gestion et des interfaces utilisateur liées à l'abonnement parent payant.

### 1.2 Périmètre de la V1
Le Pack Parent V1 couvre :
- la définition du service optionnel payant pour les parents ;
- les formules tarifaires (mensuelle et annuelle) ;
- le cycle de vie complet de l'abonnement ;
- les règles d'exonération et de délai de grâce ;
- le flux financier et la répartition des encaissements ;
- la politique de commissions (établissement et ambassadeur) ;
- la politique de remboursement et de reversement ;
- le rôle de FedaPay comme prestataire unique ;
- les exigences de traçabilité et d'audit.

### 1.3 Hors périmètre V1
- Tout autre prestataire de paiement (Paystack, Stripe, espèces, virement manuel).
- Toute fonctionnalité payante destinée à la Direction ou au personnel.
- La gestion des litiges contractuels avec FedaPay.
- La facturation B2B inter-établissements.

---

## 2. Définitions

| Terme | Définition |
|:---|:---|
| **Etablissement** | Ecole inscrite sur YZIOW, identifiée par un slug unique. Entité juridique distincte de la plateforme. |
| **Parent** | Utilisateur inscrit sur YZIOW avec le rôle `parent`, rattaché à au moins un élève via la table `parent_student_<slug>`. |
| **Enfant actif** | Elève dont le champ `statut` vaut `Actif` dans la table `students_<slug>` de son établissement. Un élève inactif ou radié n'est pas comptabilisé pour la facturation. |
| **Pack Parent** | Ensemble de services optionnels accessibles aux parents via un abonnement mensuel ou annuel payant. L'absence de souscription ne bloque jamais la gestion de l'établissement. |
| **Abonnement confirmé** | Abonnement dont le paiement a été confirmé par FedaPay via webhook, dont le statut dans `payment_intents` est `completed`, et qui n'a pas été annulé ni remboursé. |
| **Exonération** | Décision explicite de l'établissement permettant à un parent de bénéficier du Pack Parent sans payer, pour une période bornée, avec motif enregistré. Une exonération ne génère aucune commission. |
| **Commission établissement** | 20 % du montant de chaque abonnement confirmé, non annulé et non remboursé, reversé automatiquement à l'établissement chaque mois. |
| **Commission ambassadeur** | 10 % de la part nette YZIOW calculée après déduction des frais FedaPay et de la commission établissement, versée uniquement si l'école est active et si le statut de l'ambassadeur a été renouvelé. |
| **Reversement** | Virement automatique mensuel de la commission accumulée vers l'établissement, déclenché après rapprochement. |

---

## 3. Règles d'accès

### 3.1 Gestion Direction / établissement
La gestion de l'établissement (élèves, paiements, notes, présences, personnel, analyses) est **gratuite et illimitée à vie** pour la Direction. Aucun abonnement n'est requis pour accéder à ces fonctionnalités.

### 3.2 Accès parent — fonctionnalités libres
Les fonctionnalités suivantes restent accessibles aux parents **sans abonnement** :
- Connexion et identification.
- Tableau de bord limité à la liste des enfants rattachés.
- Informations générales de l'établissement.
- Annonces institutionnelles générales.
- Alertes générales urgentes.

### 3.3 Accès parent — fonctionnalités Pack Parent (contrôlé enfant par enfant)
Les fonctionnalités suivantes constituent le **Pack Parent payant**, et leur accès est contrôlé individuellement pour chaque enfant couvert par un abonnement (ou exonération) en état `ACTIVE` ou en période de grâce :
- Notes et bulletins.
- Présences, devoirs et action « devoir fait ».
- Emploi du temps.
- Ressources pédagogiques.
- Historique des paiements d'écolage et reçus.
- Badges.
- Chat, messagerie et messages individuels.
- Notifications ciblées liées au paiement, à la présence, aux devoirs ou aux messages.

Dès que la période de grâce expire sans renouvellement pour un enfant, **seuls ces services lui sont suspendus**. La gestion de l'établissement par la Direction reste inchangée.

---

## 4. Formules tarifaires

### 4.1 Formule mensuelle

| Elément | Valeur |
|:---|:---|
| Tarif | 1 000 FCFA / enfant actif / mois |
| Période de facturation | Mensuelle calendaire |
| Renouvellement | Manuel en V1 (aucun prélèvement automatique) |

### 4.2 Formule annuelle (optionnelle)

| Elément | Valeur |
|:---|:---|
| Tarif | 10 800 FCFA / enfant actif / an |
| Réduction | 10 % par rapport au tarif mensuel cumulé (12 000 FCFA) |
| Période de facturation | Annuelle |
| Activation | Immédiate dès confirmation du paiement par FedaPay |

Les commissions sur abonnement annuel sont acquises **mensuellement au prorata**, et non en totalité dès le paiement initial. Base de calcul mensuelle :
- Base mensuelle annuelle : 900 FCFA (10 800 / 12)
- Commission établissement acquise par mois : 180 FCFA (900 x 20 %)
- Frais FedaPay annuels répartis au prorata sur 12 mois pour déterminer la part nette mensuelle YZIOW
- Commission ambassadeur mensuelle : 10 % de la part nette mensuelle YZIOW

> **Règle stricte :** Le versement intégral et définitif des commissions annuelles dès le paiement initial est **interdit**. En cas de remboursement, seules les commissions des mois déjà écoulés et acquis sont contrepassées ; les commissions futures ne sont jamais versées.

### 4.3 Base de facturation
La facturation est calculée sur le nombre d'**enfants actifs** au moment de la souscription. Un enfant dont le statut passe à inactif en cours de période ne génère pas de remboursement prorata en V1.

### 4.4 Identification parent / enfants et Règle multi-enfants
Chaque abonnement ou exonération doit identifier explicitement :
- le **parent souscripteur** (identifiant unique) ;
- le ou les **enfants couverts** par cet abonnement (identifiant unique par enfant).

En V1, la tarification est strictement **par enfant**. Aucun tarif groupé famille (abonnement couvrant plusieurs enfants à tarif réduit) n'est prévu.

**Règle multi-enfants :** Un abonnement ou une exonération doit être associé à un enfant précis. Un parent ayant plusieurs enfants n'obtient l'accès Pack Parent que pour les enfants ayant chacun un abonnement actif, une période de grâce ou une exonération valide. L'accès aux fonctionnalités (notes, présences, etc.) sera bloqué pour l'enfant non couvert.

### 4.5 Devise
Toutes les transactions V1 sont libellées en **FCFA (XOF)**.

---

## 5. Cycle de vie de l'abonnement

| Etat | Description |
|:---|:---|
| `PENDING_PAYMENT` | Intention créée, en attente de confirmation FedaPay |
| `ACTIVE` | Abonnement confirmé, services Pack Parent accessibles |
| `GRACE_PERIOD` | 7 jours après expiration — accès maintenu |
| `EXPIRED` | Abonnement expiré, services Pack Parent suspendus |
| `REFUNDED` | Abonnement remboursé (doublon, erreur technique ou non activation) |
| `CANCELLED` | Abonnement annulé avant activation |

Séquence principale :
1. Parent initie une souscription → `PENDING_PAYMENT`
2. Webhook FedaPay confirmé → `ACTIVE`
3. Date de fin atteinte sans renouvellement → `GRACE_PERIOD` (7 jours). Des rappels peuvent être prévus avant expiration et pendant cette période de grâce.
4. Aucun renouvellement dans le délai → `EXPIRED` — services Pack Parent suspendus
5. Remboursement validé (cas éligible) → `REFUNDED` — commissions reprises

---

## 6. Règles d'exonération et de délai de grâce

### 6.1 Exonération
- Seul un utilisateur de l'établissement disposant d'un **droit explicitement autorisé par les règles finales de gestion** peut créer, révoquer ou consulter une exonération. Le détail exact des rôles et permissions est à vérifier et à décider avant l'implémentation.
- Une exonération est bornée dans le temps : **date de début** et **date de fin** obligatoires.
- Un **motif** doit être saisi et conservé dans le journal d'audit.
- Une exonération **ne génère aucune commission** pour l'établissement ni pour l'ambassadeur.
- Une exonération ne peut pas être rétroactive.
- Une exonération active peut être révoquée avant sa date de fin, avec motif enregistré.

### 6.2 Délai de grâce post-expiration
- Durée : **7 jours calendaires** après la date de fin de l'abonnement.
- Durant ce délai, l'accès aux services Pack Parent est **maintenu**.
- Aucun frais de pénalité n'est appliqué durant la période de grâce.
- Si le parent renouvelle dans ce délai, l'abonnement est réactivé sans interruption visible.
- A l'issue des 7 jours sans renouvellement, le statut passe à `EXPIRED`.

---

## 7. Flux financier et formule de répartition

### 7.1 Parties prenantes du flux

```
Parent
  |  1 000 FCFA / enfant / mois (ou 10 800 FCFA / an)
  v
FedaPay  (prestataire sélectionné pour la V1 — voir section 11)
  |  Déduit ses frais de transaction (F)
  v
YZIOW  (plateforme)
  |  Reçoit le montant net N = B - F
  |--- 20 %  -->  Etablissement (commission acquise mensuellement)
  |--- 10 % de la part YZIOW nette  -->  Ambassadeur (si éligible)
  +--- Solde  -->  YZIOW (revenus plateforme)
```

### 7.2 Formule de répartition

Notations :
- `B` = montant brut encaissé
- `F` = frais FedaPay déduits
- `N` = montant net YZIOW = `B - F`
- `C_etab` = commission établissement = `B x 20 %`
- `P_yziow` = part nette YZIOW avant commission ambassadeur = `N - C_etab`
- `C_amb` = commission ambassadeur = `P_yziow x 10 %` (si ambassadeur éligible)
- `R_yziow` = revenu YZIOW final = `P_yziow - C_amb`

> **Base de calcul ambassadeur :** 10 % de la part nette YZIOW, après déduction des frais FedaPay et de la commission établissement.

### 7.3 Idempotence
Chaque transaction est associée à une **référence unique** non réutilisable. Aucune commission ne peut être créditée deux fois pour la même transaction.

---

## 8. Politique de commissions

### 8.1 Commission Etablissement

| Règle | Détail |
|:---|:---|
| Taux | 20 % du montant brut de l'abonnement confirmé |
| Déclencheur | Confirmation du paiement par webhook FedaPay |
| Exclusions | Exonérations, abonnements annulés, abonnements remboursés |
| En cas de remboursement | Commission déjà créditée reprise par contrepassation |
| En cas d'annulation avant activation | Aucune commission générée |

### 8.2 Commission Ambassadeur

| Règle | Détail |
|:---|:---|
| Taux | 10 % de la part nette YZIOW |
| Déclencheur | Paiement confirmé + école active + ambassadeur éligible |
| Eligibilité | Statut ambassadeur renouvelé annuellement et actif |
| Exclusions | Exonérations, remboursements, annulations, ambassadeur inactif ou suspendu |
| En cas de remboursement | Commission annulée ou reprise via entrée `refund_reversal` |
| Durée | Non inconditionnelle — conditionnée au renouvellement annuel du statut |

---

## 9. Politique de remboursement

### 9.1 Cas éligibles en V1
Les remboursements sont strictement limités aux trois cas suivants :
1. **Doublon de paiement** : deux transactions confirmées pour le même abonnement dans la même période. Signalement autorisé dans les **7 jours calendaires** suivant la confirmation.
2. **Erreur technique** : paiement confirmé par FedaPay mais abonnement non activé en raison d'une défaillance technique de la plateforme. Corrigée ou remboursée dès sa détection, **même après 7 jours**.
3. **Abonnement non activé** : paiement reçu sans activation effective de l'abonnement. Corrigée ou remboursée dès sa détection, **même après 7 jours**.

### 9.2 Cas exclus du remboursement en V1
- Changements d'avis.
- Départ de l'enfant ou enfant devenu inactif en cours de période.
- Oubli de résiliation avant renouvellement.
- Désaccord commercial du parent avec le tarif.
- Insatisfaction fonctionnelle.

Ces cas ne donnent droit à **aucun remboursement**.

### 9.3 Effets d'un remboursement
- Le statut de l'abonnement passe à `REFUNDED`.
- La commission établissement associée est **reprise** (contrepassation enregistrée).
- La commission ambassadeur associée est **annulée ou reprise** via une entrée `refund_reversal`. Toute commission liée à un remboursement est impérativement contrepassée ou annulée.
- Le remboursement est tracé avec son motif, son initiateur et sa date.

---

## 10. Politique de reversement

### 10.1 Mécanisme
Les commissions accumulées par l'établissement sont reversées **automatiquement chaque mois** après rapprochement des transactions de la période.

Le **seuil minimal de reversement** est fixé à **2 000 FCFA**.
- À partir de 2 000 FCFA, le reversement mensuel automatique est éligible.
- En dessous de ce seuil, le solde est reporté au mois suivant.

### 10.2 Conditions de reversement
- Uniquement pour des abonnements `ACTIVE` confirmés sans litige ni remboursement en cours.
- Seules les commissions **définitivement acquises** sont reversées.
- Avant tout premier reversement, l'établissement doit avoir déclaré et fait **vérifier** un canal de paiement actif (`payout_momo_number` / `payout_method`). Aucun reversement ne peut être déclenché si ce canal est absent ou non vérifié.
- Toute modification du canal de reversement doit être **auditée** (horodatage, identifiant de l'auteur, ancien et nouveau canal masqué) et **validée** avant d'être utilisée pour un reversement.

### 10.3 Traçabilité
Chaque reversement est associé à une référence unique et à la liste des transactions sources.

---

## 11. Rôle de FedaPay et principe de rapprochement

### 11.1 FedaPay comme prestataire unique V1
FedaPay est le **prestataire de paiement sélectionné pour la V1**. Sa disponibilité contractuelle et sa conformité réglementaire doivent être validées hors du dépôt avant mise en production. Aucun paiement en espèces, aucun virement manuel et aucune conservation de fonds dans YZIOW ne sont autorisés.

### 11.2 Principe de rapprochement
- Chaque intention de paiement est créée dans `payment_intents` avant toute sollicitation de FedaPay.
- La confirmation n'est prise en compte qu'à réception du **webhook FedaPay** avec signature vérifiée.
- Toute discordance entre le montant attendu et le montant reçu est placée en `reconciliation_required` : ni commission ni activation.
- L'idempotence est garantie : une même référence FedaPay ne peut activer qu'un seul abonnement.

### 11.3 Traçabilité des frais
Les frais FedaPay doivent être tracés par transaction pour calculer correctement la base de la commission ambassadeur. En l'absence de la valeur certifiée, la transaction est placée en `reconciliation_required`.

---

## 12. Cas exclus de la V1

| Cas exclu | Raison |
|:---|:---|
| Paystack, Stripe ou autre prestataire | FedaPay uniquement en V1 |
| Paiement en espèces ou virement manuel | Non traçable, interdit par les règles de la plateforme |
| Facturation Direction / personnel | Gestion école gratuite à vie |
| Abonnement famille (tarif groupé multi-enfants) | Non défini en V1 |
| Remboursement prorata pour enfant devenu inactif | Non applicable en V1 |
| Commissionnement ambassadeur inconditionnel à vie | Conditionné au renouvellement annuel du statut |
| Gestion des litiges contractuels FedaPay | Hors périmètre YZIOW |
| Facturation B2B inter-établissements | Hors périmètre YZIOW |

---

## 13. Règles de traçabilité et d'audit

| Elément | Exigence |
|:---|:---|
| Référence unique | Une référence non réutilisable par transaction FedaPay |
| Initiateur | Identifiant de l'utilisateur ou du système à l'origine de l'action |
| Horodatage | Timestamp en UTC |
| Motif | Obligatoire pour exonérations, remboursements et annulations |
| Contrepassation | Toute commission reprise génère une entrée distincte liée à l'originale |
| Immutabilité | Le grand livre financier ne peut être ni modifié ni supprimé |
| Rapprochement | Chaque reversement liste les transactions sources |

Les exonérations sont auditées séparément avec : date de début, date de fin, motif, identifiant de l'utilisateur autorisé, et éventuelle révocation.

---

## 14. Prérequis techniques obligatoires avant implémentation

- Le contrôle d'accès Pack Parent doit être appliqué **côté backend**.
- Aucun contrôle frontend seul n'est considéré comme une sécurité.
- L'endpoint agrégé `/api/parent/data` doit être **filtré ou séparé** afin de ne jamais renvoyer de données Pack Parent (notes, ressources, etc.) à un enfant non couvert.
- L'écart d'accès identifié entre `parent_messages` et les listes de pages Parent (`ROLE_PAGES.parent` vs garde interne `parentPages`) doit être corrigé avant l'activation du Pack Parent.

---

## 15. Critères d'acceptation métier

Le Pack Parent V1 est considéré comme correct si et seulement si :

1. Un parent **sans abonnement** peut se connecter et accéder aux fonctionnalités libres sans erreur.
2. Un parent **avec abonnement actif** accède à toutes les fonctionnalités Pack Parent de l'enfant couvert.
3. Un parent **en période de grâce** (J+1 à J+7 après expiration) accède encore aux services Pack Parent de l'enfant concerné.
4. Un parent **expiré depuis plus de 7 jours** voit les services Pack Parent suspendus pour cet enfant, sans impact sur la Direction.
5. Un parent de plusieurs enfants ne voit les données Pack Parent que pour les enfants couverts ; les enfants non couverts sont limités à l'accès libre.
6. Les données des fonctionnalités Pack Parent ne fuient jamais via les appels API pour un enfant non couvert.
7. Un doublon de paiement génère un remboursement, une contrepassation de commission et l'état `REFUNDED`, sans double crédit.
8. Une exonération n'alimente aucun solde de commission (établissement ou ambassadeur).
9. Chaque reversement mensuel liste les transactions sources et respecte le seuil minimal défini.
10. Un ambassadeur dont le statut n'est pas renouvelé ne perçoit aucune commission sur les nouveaux abonnements.
11. Aucune transaction n'est confirmée sans webhook FedaPay signé et rapproché.
12. Aucun montant n'est reversé si une transaction source est en état `reconciliation_required`.

---

## 16. Décisions reportées après V1

Toutes les décisions bloquantes pour la V1 ont été validées. Les évolutions futures (telles que le renouvellement automatique avec prélèvement récurrent, ou un tarif groupé famille) feront l'objet de spécifications ultérieures (V2).

---

*Fin de la spécification Pack Parent V1 — toute modification de ce document doit être versionnée et soumise à validation.*
