# Plan de déploiement et de test Staging - Webhook Legacy SaaS (v1)

## 1. État initial prouvé
- **Endpoint webhook concerné** : `POST /api/payment/webhook` (géré par `fedapayWebhook`).
- **Comportement SaaS attendu** : Pour une intention `saas_subscription`, le webhook bloque les devis (HTTP 410) et place l'événement FedaPay dans la file d'attente manuelle (P16) sans déclencher la RPC d'activation d'école.
- **P16 déjà appliquée sur YZIOW Staging** : Oui, la migration de la structure P16 a été déployée sur Supabase Staging.
- **YZIOW Staging est hébergé sur Vercel** : L'infrastructure s'appuie sur Vercel pour servir le frontend (Vite) et le backend (Express). Le point d'entrée `api/index.js` charge `backend/server.js`, confirmant que Vercel gère le backend en Serverless. Le fichier `render.yaml` est une configuration historique non utilisée.
- **Cible de test** : Le déploiement Vercel Preview de la branche `feat/pack-parent-v1-migration` est le candidat de test Staging exclusif. Il peut techniquement recevoir un appel à `POST /api/payment/webhook`.

## 2. Conditions bloquantes avant exécution

### Prévols Vercel obligatoires
Avant tout appel ou déploiement, vous devez confirmer visuellement les points suivants sur le tableau de bord Vercel (sans jamais révéler de secrets) :
1. Confirmer visuellement le bon projet Vercel et le bon déploiement (Preview/Staging).
2. Confirmer que la branche (`feat/pack-parent-v1-migration`) et le commit cible sont bien déployés dans ce Preview.
3. Confirmer la présence, dans la portée Preview de ce déploiement, des variables d'environnement suivantes :
   - `FEDAPAY_WEBHOOK_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET` (si le backend l’exige)
4. Confirmer humainement que les variables d'environnement `SUPABASE_*` du Preview visent bien YZIOW Staging, distinct de la Production.
5. **Arrêt obligatoire** si ces confirmations visuelles ne sont pas obtenues ou si le backend pointe vers la Production.

### Données de test
- **Intention de paiement de test Staging** avec `payment_type = saas_subscription` prête.
- **Événement FedaPay Sandbox/test** signé, avec transaction cohérente (montant, devise) et sans argent réel.
- **Référence d’événement unique** dans le payload de test.

### Blocage de cible
- Ne jamais utiliser Production comme solution de remplacement.
- Ne jamais supposer qu’un Preview Vercel est le backend Staging sans avoir vérifié les variables d'environnement listées aux prévols Vercel.
- Si le backend Staging distinct n’est pas confirmé, arrêter la procédure sans appel FedaPay et sans modification de données.

## 3. Procédure de déploiement futur
- **Aucune migration de base de données P14/P15/P16 ne doit être rejouée**.
- Attendre la fin du build Vercel et l'obtention de l'URL Preview générée pour la branche.
- Utiliser l'URL Preview Vercel générée comme endpoint pour tester la logique webhook.

## 4. Protocole de test Staging
- Appeler le webhook SaaS signé de test sur l'URL Preview Vercel (URL complète `/api/payment/webhook`).
- Vérifier que le backend retourne le statut HTTP 200.
- Vérifier en base Staging qu'une seule revue P16 a été insérée avec `provider = 'fedapay'`, la référence de l'événement et l'identifiant d'intention de paiement.
- Vérifier qu’aucune action P16 automatique n’est créée dans `legacy_saas_manual_review_actions`.
- Vérifier que l’école liée n’a subi aucun changement de statut (pas de passage en abonnement actif, d’essai, etc.).
- Rejouer **exactement le même événement** (payload identique) et vérifier l’idempotence : la réponse doit être 200 mais le backend n'insère pas de doublon, il doit réutiliser la même revue.
- Appeler la route de devis SaaS (`POST /api/payment/saas/schools/:slug/quotes`) sur l'URL Preview et vérifier qu'elle retourne HTTP 410.
- Ne pas provoquer volontairement d’erreur P16 (ex. altérer les privilèges) sur Staging.
- Confirmer que `tuition` et `donation` restent hors de ce test manuel, et qu'ils sont toujours protégés par les tests backend (Node) déjà validés.
- **Parent Pack :** il est strictement hors périmètre de ce déploiement et de ce test. Le correctif Legacy SaaS ne doit ni créer, ni modifier, ni bloquer un flux `parent_pack`. Aucun paiement Parent Pack ne doit être utilisé comme donnée de test.

## 5. Critères de succès et critères d’arrêt
- **Arrêt immédiat** si : échec de signature inexpliqué, erreur HTTP 500, activation indésirable d'une école, création multiple/doublons d'un événement, ou doute sur la base cible (Production vs Staging).
- **Aucune correction improvisée** sur Staging. Si échec, remonter le point.

## 6. Passage Production
- **Interdit** tant que le rapport Staging complet n’est pas validé.
- Exigera une **nouvelle autorisation explicite distincte**.

---

### Modèle de rapport d’exécution
STAGING_BACKEND_DEPLOYED: [ ]
STAGING_WEBHOOK_SAAS_QUEUED: [ ]
STAGING_SAAS_DUPLICATE_IDEMPOTENT: [ ]
STAGING_SCHOOL_UNCHANGED: [ ]
STAGING_SAAS_QUOTE_RETURNS_410: [ ]
PRODUCTION_TOUCHED: false
