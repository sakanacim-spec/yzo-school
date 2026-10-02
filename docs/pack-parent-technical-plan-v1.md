# YZIOW — Plan Technique Pack Parent V1

> **Version :** 1.0
> **Date :** 2026-09-29
> **Statut :** Finalisé

---

## 1. Objectifs et Non-Objectifs

### Objectifs
- Implémenter le modèle économique « Pack Parent V1 » avec facturation par enfant (mensuel/annuel).
- Isoler strictement les fonctionnalités libres des fonctionnalités payantes du Pack Parent.
- Gérer le cycle de vie de l'abonnement avec la notion de période de grâce.
- Automatiser le calcul des commissions (Etablissement et Ambassadeur) à partir de la part nette.
- Sécuriser l'accès aux données côté backend, pour prévenir toute fuite de données si l'enfant n'est pas couvert.

### Non-Objectifs (Hors V1)
- L'intégration de prestataires de paiement autres que FedaPay.
- Les abonnements groupés « famille ».
- Les prélèvements automatiques récurrents (renouvellement strictement manuel en V1).
- La modification de l'actuelle logique de gratuité pour la gestion de l'établissement.

---

## 2. Composants existants à réutiliser

- **Authentification & Profils** : L'infrastructure de rôles actuelle sera préservée, tout parent authentifié continuera d'utiliser `POST /api/auth/login`.
- **Modèle `payment_intents` existant** : L'utilisation de la table `payment_intents` pour initier les transactions avec une colonne `payment_type` permettra de séparer les abonnements des autres paiements (tuition, donation).
- **Le `affiliate_ledger`** : Le journal immuable des ambassadeurs sera utilisé pour inscrire la part des ambassadeurs selon les règles strictes de contrepassation (`refund_reversal`) déjà établies.
- **Le Session Pooler & Supabase Client** : Toute intégration base de données réutilisera le client Supabase backend existant avec JWT sécurisés.

---

## 3. Nouveaux Objets de Données (Concepts)

*Ces concepts devront être modélisés en Phase 2 sans altérer les structures existantes non liées.*

- **Abonnements Parents (`parent_subscriptions`)** : Entité centrale liant un parent, un enfant, une date de début, une date de fin, un statut (`ACTIVE`, `EXPIRED`, `REFUNDED`, etc.) et une référence de paiement.
- **Exonérations (`parent_exemptions`)** : Entité gérant les gratuités accordées par la Direction avec motif, horodatage, et auteur. Ne génère aucun flux financier.
- **Journal des Reversements (`school_payouts`)** : Trace les reversements mensuels (>= 2 000 FCFA) vers l'établissement avec le canal utilisé (`payout_momo_number`), horodatage, et statut.
- **Audit des canaux de reversement (`payout_channel_audits`)** : Trace les modifications du canal de reversement par la Direction, pour la validation requise.

---

## 4. Séparation : Dons, Ecolage, et Pack Parent

La logique backend et frontend existante gérant les paiements devra impérativement traiter le Pack Parent comme un flux distinct.
- Le champ `payment_type` dans `payment_intents` différenciera un paiement de Pack Parent.
- Les rapports d'écolage et de dons de l'établissement ne devront pas inclure le paiement Pack Parent (ex: 100 FCFA) dans leurs totaux bruts. Seule la commission (20%) apparaîtra dans les revenus école.

---

## 5. Gestion de l'abonnement par Enfant

Le modèle repose sur le principe **multi-enfants strict** :
- La table pivot `parent_student` n'est pas suffisante pour valider l'accès.
- L'accès aux fonctionnalités (notes, présences, badges) pour le *Child A* exige une subscription ou exonération valide spécifique à *Child A*.
- Si un parent a deux enfants et ne paie que pour un seul, l'interface et l'API devront masquer les données payantes du second enfant.

---

## 6. Sécurité Backend et Accès Pack Parent

### La sécurisation absolue du Backend
Aucun contrôle de type `if (!hasSubscription) return <Navigate to="/dashboard"/>` côté frontend n'est suffisant.
Un middleware ou un contrôle strict dans les contrôleurs (`parentController.js`) doit vérifier le statut de l'abonnement (ou l'exonération) *avant* toute requête en base de données.

### Stratégie pour `/api/parent/data`
Actuellement, cet endpoint agrégé retourne l'intégralité des données (annonces, devoirs, présences, notes) pour tous les enfants.
- **Séparation nécessaire :** Les données du Pack Parent (notes, devoirs, présences, e-learning) doivent être filtrées de la réponse si l'enfant concerné n'est pas couvert.
- Les données libres (annonces, infos école) seront toujours retournées.
- L'API devra enrichir la réponse avec un objet d'autorisation décrivant pour quel enfant le Pack Parent est actif, afin que le frontend désactive les boutons ou affiche un "paywall".

### Correction de l'écart `parent_messages`
La sécurité frontend diverge de l'intention métier concernant le chat. L'écart identifié entre `ROLE_PAGES.parent` (qui inclut `parent_messages`) et la variable `parentPages` (qui l'exclut) dans `App.tsx` devra être résolu en harmonisant la liste des pages Pack Parent pour empêcher les redirections bloquantes.

---

## 7. Le Cycle FedaPay (Intention, Webhook, Idempotence)

Le cycle de paiement sera immuable :
1. **Intention** : Création d'une entrée `PENDING` avec référence locale.
2. **Webhook Signé** : La confirmation de paiement ne doit provenir que du Webhook FedaPay. La signature du webhook doit être systématiquement validée. **Phase 3 étendra ce webhook existant pour gérer le Pack Parent ; aucun second webhook ne sera créé.**
3. **Rapprochement** : Vérification stricte du montant payé vs montant attendu. **Toute vérification manuelle d’une transaction doit être réservée à un processus interne sécurisé côté backend, interrogeant FedaPay, contrôlant la référence et le montant, journalisée et idempotente.**
4. **Idempotence** : La référence FedaPay validée sera stockée avec une contrainte d'unicité pour interdire toute double-activation et double-commissionnement. **Ne jamais activer un abonnement à partir d’un statut fourni par le navigateur ou par un parent.**

- **Responsabilités** : Les responsabilités contractuelles, réglementaires, de protection des parents et de traçabilité de YZIOW et des établissements doivent être validées avec un conseil compétent et selon les exigences applicables avant la mise en production.

---

## 8. Politique Tarifaire, Commissions et Reversements

### Matrice Tarifaire et Modalités V1
- **Tarifs V1 actifs XOF :**
  - Maternelle / Primaire : 100 FCFA par mois ; 1 000 FCFA annuels.
  - Collège / Secondaire : 150 FCFA par mois ; 1 500 FCFA annuels.
  - Supérieur / Formation : 200 FCFA par mois ; 2 000 FCFA annuels.
- **Formule Annuelle :** Couvre 10 mois scolaires, payée en une seule tranche, sans remise annuelle supplémentaire.
- **Formule Mensuelle :** Renouvellement par paiement manuel uniquement ; aucune reconduction ou prélèvement automatique en V1.
- **Paiements et Rapports :** Les paiements sont encaissés d'abord par YZIOW via le prestataire, jamais directement par l'établissement. Les paiements Pack Parent ne doivent pas être assimilés ni agrégés aux rapports d'écolage.
- **Futures devises :** Les montants USD/EUR sont des références futures non actives ; la V1 reste limitée au XOF.

### Commissions Etablissement et Ambassadeur
- **Taux :** Commission établissement = 20 % du montant brut payé. Commission ambassadeur = 10 % du montant brut payé.
- **Acquisition annuelle :** Pour un paiement annuel, les deux commissions sont acquises à raison de 1/10 chaque mois scolaire. Ne jamais verser la totalité dès le paiement initial.
- **Frais :** YZIOW absorbe les frais de collecte et de reversement, sans réduire les commissions établissement ou ambassadeur.
- **Ambassadeur à vie :** L’ambassadeur attribué de manière unique et traçable à un établissement reçoit sa commission sans date d’expiration arbitraire, uniquement sur les acquisitions mensuelles effectivement encaissées. Aucun montant n’est dû pour un paiement annulé, remboursé, contesté ou frauduleux ; une contrepassation traçable est obligatoire. Toute réattribution rétroactive est interdite, sauf procédure interne anti-fraude documentée et auditée.

### Reversement Etablissement (>= 2 000 FCFA)
- Le reversement mensuel dépend de :
  a) l’activation explicite de la fonctionnalité Payouts chez FedaPay ;
  b) la validation du compte marchand ;
  c) un test concluant en sandbox ;
  d) la disponibilité des fonds ;
  e) la validation opérationnelle et réglementaire avant Production.
- Un lot mensuel de reversements est d’abord calculé et audité en interne avant tout envoi effectif au prestataire.
- Si le cumul des commissions est < 2 000 FCFA, le solde est reporté au mois suivant.
- Le canal de reversement (ex : Mobile Money) doit être **vérifié**.

### Remboursements et Contrepassations
- Remboursement éligible si doublon (signalé dans les 7 jours) ou erreur technique.
- Toute commission (établissement et ambassadeur) reversée sur un paiement remboursé doit générer une écriture inverse (contrepassation) dans les ledgers. Les commissions futures d'un abonnement annuel remboursé sont annulées.

---

## 9. Tests Nécessaires

- **Tests unitaires de calcul** : Validation des formules de part nette, prorata annuel, et calcul des 20 % / 10 %.
- **Tests d'idempotence Webhook** : Simulation de double livraison du même webhook FedaPay.
- **Tests de sécurité API** : Tentative d'accès aux notes d'un enfant non couvert (doit retourner 403 ou objet vide).
- **Scénario parent multi‑enfants** : paiement pour l’enfant A sans accès Pack Parent pour l’enfant B.
- **Appel API direct** : requête de l’endpoint sans passer par le frontend, pour valider les contrôles d’accès serveur.
- **Vérification `/api/parent/data`** : s’assurer que les données payantes d’un enfant non couvert ne sont jamais retournées.
- **Webhook reçu deux fois** : s’assure que la logique reste idempotente.
- **Remboursement avant/après commission acquise** : valide la contrepassation correcte dans les deux cas.
- **Changement de canal de reversement avec audit** : vérifie la traçabilité du changement.
- **Seuil de 2 000 FCFA** : solde reporté lorsqu’inférieur, aucun reversement envoyé.
- **Échec ou délai de reversement** : aucune double‑envoi du reversement.

---

## 10. Plan de Réalisation en Phases

### Phase 1 : Validation Métier (Terminée)
- Formalisation et validation du modèle économique, des tarifs et des règles.

### Phase 2 : Modélisation des Données
- Conception des tables SQL, politiques RLS, et contraintes.
- *Critère de sortie : Script de migration SQL validé sans exécution en production.*

### Phase 3 : Développement Backend (Sécurité & APIs)
- Modification de `/api/parent/data`.
- Ajout du middleware d'abonnement.
- Implémentation du webhook FedaPay.
- *Critère de sortie : Backend fonctionnel et tests de sécurité API validés.*

### Phase 4 : Développement Frontend (Interfaces Parent & Direction)
- Intégration du paywall et des vues enfants.
- Interface Direction pour les exonérations et déclaration de canal.
- *Critère de sortie : Démo UI complète sur environnement de staging.*

### Phase 5 : Déploiement et Reversement
- Implémentation du batch de reversement mensuel et des journaux d'audit.
- **Critères de sortie obligatoires** :
  - Test de paiement et de payout concluant en sandbox.
  - Revue de sécurité API.
  - Validation juridique, contractuelle et opérationnelle.
  - Procédure écrite de rapprochement, remboursement et gestion des incidents.
  - Autorisation explicite avant toute activation en Production.
- Mise en production après validation réglementaire de FedaPay.

---

## 11. Risques et Dépendances Externes

- **Dépendance FedaPay** : Tout dysfonctionnement des webhooks FedaPay bloquera l'activation automatique des abonnements. Une route de synchronisation manuelle "Vérifier le statut de la transaction" est recommandée.
- **Responsabilités** : Les responsabilités contractuelles, réglementaires, de protection des parents et de traçabilité de YZIOW et des établissements doivent être validées avec un conseil compétent et selon les exigences applicables avant la mise en production.
- **Taux de conversion** : Le modèle reposant sur la participation volontaire, le design du paywall frontend devra être particulièrement soigné.
