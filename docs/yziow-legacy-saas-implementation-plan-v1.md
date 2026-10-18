# Plan d'Implémentation du Retrait Sécurisé de l'Abonnement SaaS Hérité (V1)

## 1. Objectif et limites
- **Bloquer les nouvelles facturations SaaS école.**
- **Préserver les données historiques** (paiements, intentions, devis existants). La valeur historique saas_subscription ne doit pas être retirée de la contrainte payment_intents pendant les phases A à C. Les anciennes lignes restent lisibles pour audit. La fermeture SaaS interdit uniquement les nouvelles créations.
- **Ne toucher ni au schéma SQL ni à Staging/Production** dans cette phase.
- **Ne pas encore implémenter le Pack Parent** (il fera l'objet de sa propre implémentation).

## 2. État actuel prouvé
*   `backend/routes/payment.js` (Ligne ~35) :
    - **Responsabilité :** Expose la route `POST /saas/schools/:slug/quotes` pour créer des devis d'abonnement école.
    - **Risque :** Risque de création de nouvelles dettes pour des écoles désormais gratuites.
    - **Dépendances :** Appelle `createSubscriptionQuote`.
*   `backend/controllers/paymentController.js` (Lignes 1037+, ~2329) :
    - **Responsabilité :** Contient `createSubscriptionQuote` et traite le webhook FedaPay pour `payment_type = 'saas_subscription'`. Expire les anciennes transactions via `expireStaleIntents`.
    - **Risque :** Modification non désirée du statut de l'école (activation, expiration) sur réception d'anciens webhooks.
    - **Dépendances :** Base de données Supabase, API FedaPay.
*   `src/pages/Parametres.tsx` (Lignes 287, 1020-1040) & `src/data/classConfig.ts` :
    - **Responsabilité :** Définit et stocke `classBillingCategoryInput` (ex: `maternelle_primaire` à 100 FCFA/mois) lié à l'ancien modèle.
    - **Risque :** Poursuite de la définition de catégories payantes obsolètes.
    - **Dépendances :** Backend API création de classes, Types TypeScript.
*   `backend/tests/subscriptionPaymentProcessing.test.js` :
    - **Responsabilité :** Teste le calcul (10 élèves * 100 FCFA) et l'API SaaS.
    - **Risque :** Maintenir des tests sur des flux obsolètes, créant de faux positifs ou bloquant le CI.
    - **Dépendances :** Logique SaaS.

## 3. Changement API proposé
**Comportement futur de la route de création de devis SaaS (`/saas/schools/:slug/quotes`) :**
- L’ancienne route SaaS reste temporairement présente et répond obligatoirement HTTP `410 Gone`.
- **Code stable :** `SCHOOL_BILLING_RETIRED`.
- **Message :** `La facturation école est retirée, la plateforme est gratuite.`
- **Aucune création de devis.**
- **Aucune écriture dans `payment_intents`.**
- **Aucun appel FedaPay.**
- **Aucune modification de statut d’école.**

## 4. Webhook FedaPay
- **Comportement conservé :** Les branches pour `tuition` et `donation` continuent d'opérer normalement et restent strictement séparées. Le retrait SaaS ne doit ni créer, ni modifier, ni empêcher la future branche parent_pack. Cette branche backend n’est pas encore implémentée et sera développée séparément. Les tests de non-régression devront vérifier que le retrait SaaS n’interfère pas avec son implémentation future.
- **Comportement cible pour `saas_subscription` :** Tout webhook historique `saas_subscription`, après vérification normale de sa signature, doit créer ou réutiliser une entrée dans une **file interne de revue manuelle**.
- **Revue manuelle :**
  - Ne jamais activer, expirer, suspendre, rembourser ou supprimer automatiquement une école.
  - Prévoir une protection anti-doublon fondée sur l’identifiant réel de l’événement ou de la transaction FedaPay.
  - Ne pas stocker le payload brut FedaPay ni des données sensibles inutiles.
  - Répondre `200 OK` au prestataire seulement après que le cas de revue manuelle a été durablement pris en compte dans la file.
  - **L'objet technique exact de la file (table, accès interne, statuts et droits) doit être conçu dans une migration additive ultérieure (prérequis technique avant la modification du code webhook).**

## 5. Interface Direction
Modifications futures :
- Retrait des sélecteurs `billingCategory` de `Parametres.tsx`.
- Retrait des prix SaaS par élève dans l'interface et le Kit Ambassadeur (`AmbassadorKitPage.tsx`).
- Suppression des éventuels boutons ou modales d'appel à `/quote`.
- Conservation de l'intégralité des fonctions pédagogiques et de la création de classes.
*Compatibilité :* Le backend et les types (`src/types/index.ts`) devront rendre le champ `billingCategory` *optionnel* (ou l'ignorer silencieusement) afin de ne pas faire crasher l'affichage des anciennes classes qui le possèderaient encore en base de données.

## 6. Tests à créer ou remplacer
Les tests actuels dans `backend/tests/subscriptionPaymentProcessing.test.js` devront être remplacés par :
- **Test de la route SaaS :** Vérifier que l'appel POST retourne un `410 Gone` (avec message validé) sans aucun effet de bord (aucune ligne créée dans `payment_intents` ou `saas_subscription_quotes`).
- **Test de webhook SaaS historique :** Vérifier qu'une notification FedaPay pour `saas_subscription` crée une seule demande de revue dans la file interne, même en cas de webhook en doublon.
- **Test d'accès École :** S'assurer qu'aucune école ne subit de changement d'accès (ni blocage, ni expiration) à cause de la logique SaaS.
- **Test de non-régression (`tuition`, `donation`) :** S'assurer que les autres flux restent inchangés et passent avec succès.

## 7. Plan d’exécution proposé
1. **Fermeture API :** Remplacer le code de `createSubscriptionQuote` par la réponse HTTP `410 Gone`. Critère de sortie : tests d'API passant. Risque : faible (API).
2. **Nettoyage interface :** Retirer les champs `billingCategory` du front. Critère : CI front-end passant. Risque : problème d'affichage sur d'anciennes classes. Retour arrière : revert Git du front.
3. **Prérequis File de Revue :** Migration additive pour créer la table interne de suivi des revues manuelles (modèle de données et RLS).
4. **Comportement Webhook :** Modifier `paymentController.js` pour rediriger `saas_subscription` vers la file de revue. Critère : tests de non-régression validés.
5. **Tests :** Remplacer les anciens tests SaaS par les tests de fermeture.
6. **Déploiement Staging :** Validation sur l'environnement iso-production.
7. **Retrait définitif différé :** Phase ultérieure (nettoyage SQL profond) après période d'observation.

## 8. Points bloquants avant écriture de code
- **Conception de la file interne** : Choix techniques de stockage, de statut et de droits d'accès pour la table de revue manuelle (migration additive à concevoir).
- **Inventaire réel** : Extraire sur Staging les intentions et devis SaaS historiques.
- **Politique de remboursement** : Procédure claire si un ancien abonnement SaaS est débité malgré le retrait.
- **Vérification des consommateurs** : Auditer si une application mobile ou un système externe appelle encore l'API SaaS.
