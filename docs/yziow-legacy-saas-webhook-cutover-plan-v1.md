# Plan de coupure du webhook Legacy SaaS (v1)

## 1. État actuel prouvé

- **Endpoint** : `POST /api/payment/webhook` appelle la fonction `fedapayWebhook` (fichier `backend/controllers/paymentController.js`).
- **Signature** : La signature FedaPay est vérifiée en début de traitement (lignes 2165‑2185). Aucun traitement n’est exécuté si la signature est manquante ou invalide.
- **Corps brut** : `req.rawBody` est obligatoire et vérifié (ligne 2176).
- **Référence d’événement** : Le webhook utilise `event.id` comme `provider_event_ref` lorsqu’il est présent.
- **Secours** : En l’absence d’`event.id`, le code utilise la valeur de secours `uncertified_intent_${intentId}` (lignes 2243‑2245).
- **Appel RPC** : Le webhook exécute `process_fedapay_webhook_event_v2` via `supabase.rpc` (lignes 2292‑2306).
- **Sécurité RPC** : La fonction `process_fedapay_webhook_event_v2` est définie avec `SECURITY DEFINER`.
- **Lecture du type** : Le RPC lit `payment_intents.payment_type` (ligne 152‑160 du RPC).
- **Traitement SaaS** : Pour `payment_type = 'saas_subscription'`, le RPC met à jour `public.schools.subscription_status = 'active'` et, le cas échéant, `first_successful_payment_at` (sections 274‑285 du RPC).
- **Pas d’écriture P16** : Le RPC n’insère **aucune** ligne dans la file P16 (`legacy_saas_manual_reviews`).

## 2. Décision de coupure validée

- La **Direction** ainsi que les **établissements** restent **gratuits pour toujours**.
- Aucun webhook `saas_subscription` ne doit **activer**, **expirer**, **suspendre**, **limiter**, **supprimer** ou **rembourser** automatiquement une école.
- Les **anciens webhooks SaaS** doivent **créer ou réutiliser** un dossier P16 durable **avant** toute réponse `200 OK`.
- Les flux **tuition** et **donation** conservent **strictement** leur comportement actuel.
- Le **parent_pack** reste **hors périmètre** : il ne doit être ni créé, ni modifié, ni bloqué.

## 3. Chemin backend cible

1. **Après la validation de la signature** et la récupération de l’intention (`intentId`) :
   - le contrôle `saas_subscription` intervient seulement après toutes les validations déjà présentes :
     - signature cryptographique ;
     - type d’événement `transaction.approved` ;
     - présence de l’entité distante ;
     - validité de `intentId` ;
     - récupération de la transaction distante ;
     - statut distant `approved` ;
     - cohérence des métadonnées ;
     - validité du montant ;
     - devise XOF.
   - Lire `payment_intents.payment_type`.
   - **Si** la valeur est `saas_subscription` :
     - ne jamais appeler `process_fedapay_webhook_event_v2`.
     - créer ou réutiliser la revue P16 (tentative de création, gestion du doublon comme décrit en section « Écriture P16 idempotente »).
     - répondre `200 OK` seulement après persistance réussie, puis terminer.
   - **Si** la valeur est `tuition` ou `donation` :
     - suivre exactement le chemin existant et appeler le RPC.
2. **Ne pas** modifier le RPC existant dans cette première phase ; les écoles déjà activées par le passé ne seront **pas** rétro‑activement modifiées.

## 4. Écriture P16 idempotente

- **`provider`** doit être exactement la chaîne `"fedapay"`.
- **`provider_event_ref`** :
  - Utiliser `event.id` lorsqu’il est présent.
  - Sinon, utiliser la valeur de secours `uncertified_intent_${intentId}`.
- **Contraintes d’unicité** : la table `legacy_saas_manual_reviews` possède la contrainte unique `(provider, provider_event_ref)`. Le backend tente de créer le dossier P16 ;
  - si la création réussit, le dossier est durablement enregistré ;
  - si la base signale exclusivement le doublon de la contrainte `(provider, provider_event_ref)`, le backend relit le dossier correspondant sans le modifier ;
  - toute autre erreur de base entraîne un retour HTTP 500 ;
  - aucune mise à jour automatique de la revue existante n’est autorisée.
- **Pas de création** dans `legacy_saas_manual_review_actions` : cette table représente les décisions humaines et ne doit pas être remplie automatiquement.
- **`school_slug`** : reste `NULL` tant que le mapping fiable depuis l’intention n’est pas prouvé.
- **En cas d’échec** d’insertion P16 :
  - Retourner une **erreur serveur** (ex. `500 Internal Server Error`).
  - Ne pas appeler le RPC.
  - Ne jamais répondre `200 OK` avant la persistance.

## 5. Retrait de la création de devis SaaS

Modification future prévue de l’endpoint `POST /saas/schools/:slug/quotes` :
- Retourner **HTTP 410 Gone**.
- Corps exact :
  ```json
  {
    "error": "SCHOOL_BILLING_RETIRED",
    "message": "La facturation école est retirée, la plateforme est gratuite."
  }
  ```
- Aucun devis ne doit être créé.
- Aucun enregistrement dans `payment_intents`.
- Aucun appel à FedaPay.
- Aucune modification d’école.

## 6. Fichiers qui seront modifiés lors de l’implémentation future

| Fichier | Statut (à confirmer) |
|---------|----------------------|
| `backend/routes/payment.js` | À confirmer par inspection avant code |
| `backend/controllers/paymentController.js` | À confirmer par inspection avant code |
| Tests backend associés (ex. `backend/tests/...`) | À confirmer par inspection avant code |
| Fichiers frontend affichant encore la facturation école | À confirmer par inspection avant code |

> **Note** : aucune migration P16, P15 ou P14 n’est concernée dans ce plan.

## 7. Tests obligatoires avant Staging

1. **Webhook SaaS valide** : une seule revue P16 créée, réponse `200 OK`, aucun appel au RPC.
2. **Webhook SaaS doublon** : seule la violation d’unicité attendue permet de relire le dossier existant ; toute autre erreur de persistance renvoie HTTP 500.
3. **Webhook SaaS sans `event.id`** : utilisation du secours `uncertified_intent_${intentId}`, création unique du dossier P16.
4. **Échec d’écriture P16** : renvoyer une erreur serveur, aucun appel RPC, aucune activation.
5. **Flux `tuition`** : comportement inchangé (appel RPC, mise à jour école éventuelle).
6. **Flux `donation`** : comportement inchangé.
7. **Signature invalide ou absente** : réponse HTTP 400 existante, sans écriture P16 ni appel RPC.
8. **Route de devis SaaS** : retourne `410 Gone` et aucune modification de données.
9. **Intention non‑SaaS liée à P16** : rejetée par le trigger `trg_legacy_saas_v1_check_payment_type`.
10. **Transaction distante invalide, non approuvée, montant invalide ou devise non XOF** : comportement de rejet existant, sans écriture P16 ni appel RPC.
11. **Aucun impact sur `parent_pack`** : aucune création/modification détectée.

## 8. Hors périmètre

- Aucun accès ou modification de la **vraie Production** YZIOW.
- Aucun **effacement** de données SaaS historiques.
- Aucun **remboursement automatique**.
- Aucun écran ou interface de revue manuelle dans cette étape.
- Aucun développement lié à `parent_pack`.
- Aucune modification rétroactive des migrations **P14**, **P15** ou **P16**.

---

**Plan à faire valider avant toute écriture de code.**
