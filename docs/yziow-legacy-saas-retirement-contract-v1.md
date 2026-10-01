# Contrat de Retrait Sécurisé de l'Abonnement SaaS Hérité (V1)

## 1. Décisions Métier Validées
- La gestion Direction/établissement est **gratuite pour toujours**.
- Aucune nouvelle facture, devis ou intention de paiement `saas_subscription` ne doit être créée pour une école.
- Une école ne doit **jamais** être bloquée, suspendue ou limitée à cause d’un essai, d’une expiration ou d’un ancien abonnement SaaS.
- Les écolages, dons et le futur Pack Parent restent des flux distincts.
- Les anciens paiements, devis et intentions SaaS sont conservés pour historique, audit, rapprochement et remboursement éventuel.
- Revue manuelle validée : si un ancien paiement SaaS apparaît ou si un webhook ancien arrive, **aucune activation, expiration, suppression ou remboursement automatique ne doit avoir lieu**. Le cas doit être identifié pour traitement manuel.

## 2. Frontières Financières
Il est impératif de ne jamais confondre les quatre flux financiers :
- `saas_subscription` : ancien flux d'abonnement établissement, **fermé aux nouvelles créations**.
- `tuition` : écolage payé à l'école, **conservé**.
- `donation` : dons et levées de fonds, **conservé**.
- `parent_pack` : futur flux payé par les parents, **conservé**.

## 3. Stratégie Sûre en Phases
Le plan de retrait s'articule autour des propositions suivantes avant tout développement :
- **Phase A :** Empêcher toute nouvelle création de devis, transaction ou intention SaaS, sans supprimer les données existantes.
- **Phase B :** Retirer de l’interface Direction les prix, catégories de facturation et appels à l’abonnement SaaS.
- **Phase C :** Conserver le webhook FedaPay général, mais orienter tout événement SaaS historique vers une revue manuelle, sans action automatique sur l’accès de l’école.
- **Phase D :** Ne retirer tables, fonctions RPC, contrôleurs ou tests SaaS qu’après un inventaire réel des données, une vérification des remboursements éventuels et une validation explicite.

## 4. Garanties Obligatoires
- Ne pas retirer `saas_subscription` de la contrainte CHECK sur `payment_intents` tant que l’historique existe.
- Ne pas supprimer globalement le webhook FedaPay (indispensable pour l'écolage, les dons et le Pack Parent).
- Ne pas supprimer directement la table `saas_subscription_quotes`.
- Ne pas confondre la nouvelle table `school_commission_ledger` du Pack Parent avec d’éventuels objets historiques.
- Ne jamais modifier l’accès Direction selon un statut `trial` ou `expired`.

## 5. Comportement Cible Futur de la Route SaaS
- La route SaaS obsolète ne devra créer ni devis, ni intention, ni transaction FedaPay.
- Le choix exact entre la suppression pure et simple de la route ou le renvoi d'une réponse explicite de type « service retiré » reste à valider avant d'écrire le code.
- **Aucun code applicatif ou SQL ne doit être écrit ou décidé dans le présent document.**

## 6. Liste des Vérifications Indispensables Avant Implémentation
Avant tout développement lié à ce retrait, les vérifications suivantes sont obligatoires :
- Inventaire sur Staging (et Production) des intentions SaaS et devis historiques.
- Politique de remboursement des anciens paiements validée.
- Liste exacte des consommateurs existants de la route SaaS.
- Validation des messages d'erreur ou d'information affichés aux écoles.
- Stratégie de tests de non-régression pour garantir l'intégrité des flux d'écolage, de dons et du Pack Parent.
