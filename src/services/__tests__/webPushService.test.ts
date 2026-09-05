// Tests unitaires complets pour webPushService et la rotation VAPID
// Exécution : node --test src/services/__tests__/webPushService.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVapidPublicKey,
  urlBase64ToUint8Array,
  areUint8ArraysEqual,
  doesSubscriptionMatchKey,
  webPushService,
  OWNER_STORAGE_KEY
} from '../webPushService.ts';

const VALID_KEY_A = 'BAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const VALID_KEY_B = 'BAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';

// Créateur d'abonnement push simulé
function createMockSubscription(keyBytes: Uint8Array, endpoint = 'https://push.example.com/sub-1') {
  let unsubscribed = false;
  return {
    endpoint,
    options: {
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer
    },
    toJSON() {
      return {
        endpoint,
        keys: {
          p256dh: 'mock_p256dh',
          auth: 'mock_auth'
        }
      };
    },
    get isUnsubscribed() {
      return unsubscribed;
    },
    unsubscribe: async () => {
      unsubscribed = true;
      return true;
    }
  };
}

describe('Suite de tests : Rotation VAPID & webPushService', () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  const originalNotification = globalThis.Notification;
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  let localStorageMock: Record<string, string> = {};
  let logsList: string[] = [];

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    localStorageMock = {};
    logsList = [];

    console.log = (msg: string) => { logsList.push(msg); };
    console.warn = (msg: string) => { logsList.push(msg); };
    console.error = (msg: string) => { logsList.push(msg); };

    (globalThis as any).localStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => { localStorageMock[key] = val; },
      removeItem: (key: string) => { delete localStorageMock[key]; },
      clear: () => { localStorageMock = {}; }
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;

    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'Notification', { value: originalNotification, configurable: true, writable: true });
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  // 1. Validation préventive de la clé VAPID
  describe('1. Validation préalable de la clé VAPID', () => {
    it('Clé absente ou vide : lève une erreur et ne modifie rien', () => {
      assert.throws(() => parseVapidPublicKey(''), /Cle VAPID absente/);
      assert.throws(() => parseVapidPublicKey(null as any), /Cle VAPID absente/);
    });

    it('Clé malformée (non Base64URL) : lève une erreur', () => {
      assert.throws(() => parseVapidPublicKey('Clé avec espaces & caractères invalides!'), /Format Base64URL invalide/);
      assert.throws(() => parseVapidPublicKey('abc=='), /Format Base64URL invalide/);
    });

    it('Clé décodée non conforme P-256 (longueur != 65 ou premier octet != 0x04) : lève une erreur', () => {
      // 3 octets quelconques en Base64URL
      const shortKey = 'AAAA';
      assert.throws(() => parseVapidPublicKey(shortKey), /Cle VAPID non conforme P-256/);
    });

    it('Clé valide 65 octets P-256 : décodée avec succès sans Buffer', () => {
      const bytes = parseVapidPublicKey(VALID_KEY_A);
      assert.strictEqual(bytes.length, 65);
      assert.strictEqual(bytes[0], 0x04);
      assert.strictEqual(bytes[1], 0x01);
    });
  });

  // 2. Égalité binaire et correspondance d'abonnement
  describe('2. Fonctions pures de comparaison binaire', () => {
    it('areUint8ArraysEqual compare strictement les octets', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      const c = new Uint8Array([1, 2, 4]);
      const d = new Uint8Array([1, 2]);

      assert.strictEqual(areUint8ArraysEqual(a, b), true);
      assert.strictEqual(areUint8ArraysEqual(a, c), false);
      assert.strictEqual(areUint8ArraysEqual(a, d), false);
    });

    it('doesSubscriptionMatchKey identifie correctement la clé', () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const bytesB = parseVapidPublicKey(VALID_KEY_B);
      const subA = createMockSubscription(bytesA) as any;

      assert.strictEqual(doesSubscriptionMatchKey(subA, bytesA), true);
      assert.strictEqual(doesSubscriptionMatchKey(subA, bytesB), false);
      assert.strictEqual(doesSubscriptionMatchKey(null, bytesA), false);
    });
  });

  // 3. Tests comportementaux du service webPushService.init
  describe('3. Cycle de vie webPushService & Scénarios de rotation', () => {
    function setupBrowserEnvironment({
      existingSub = null as any,
      subscribeImpl = null as any
    }) {
      let currentActiveSub = existingSub;
      let unsubscribeCallCount = 0;
      let subscribeCallCount = 0;
      let fetchCalls: Array<{ url: string; body: any }> = [];

      Object.defineProperty(globalThis, 'Notification', {
        value: {
          permission: 'granted',
          requestPermission: async () => 'granted'
        },
        configurable: true,
        writable: true
      });

      Object.defineProperty(globalThis, 'window', {
        value: {
          PushManager: class {},
          location: { origin: 'http://localhost:5000' }
        },
        configurable: true,
        writable: true
      });

      const pushManagerMock = {
        getSubscription: async () => currentActiveSub,
        subscribe: async (opts: any) => {
          subscribeCallCount++;
          let newSub: any;
          if (subscribeImpl) {
            newSub = await subscribeImpl(opts, subscribeCallCount);
          } else {
            const bytes = new Uint8Array(opts.applicationServerKey);
            newSub = createMockSubscription(bytes, `https://push.example.com/sub-${subscribeCallCount}`);
          }
          if (newSub) {
            const origUnsub = newSub.unsubscribe;
            newSub.unsubscribe = async () => {
              unsubscribeCallCount++;
              const res = await origUnsub();
              currentActiveSub = null;
              return res;
            };
          }
          currentActiveSub = newSub;
          return newSub;
        }
      };

      if (currentActiveSub) {
        const origUnsub = currentActiveSub.unsubscribe;
        currentActiveSub.unsubscribe = async () => {
          unsubscribeCallCount++;
          const res = await origUnsub();
          currentActiveSub = null;
          return res;
        };
      }

      const registrationMock = {
        pushManager: pushManagerMock
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: async () => registrationMock
          }
        },
        configurable: true,
        writable: true
      });

      (globalThis as any).fetch = async (url: string, init: any) => {
        fetchCalls.push({ url, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        };
      };

      return {
        getUnsubscribeCount: () => unsubscribeCallCount,
        getSubscribeCount: () => subscribeCallCount,
        getFetchCalls: () => fetchCalls,
        getCurrentActiveSub: () => currentActiveSub
      };
    }

    it('Scénario 1 : Clé absente -> ancien abonnement intact, 0 unsubscribe, 0 subscribe', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      await webPushService.init({ publicKeyOverride: '' });

      assert.strictEqual(env.getUnsubscribeCount(), 0, 'unsubscribe() ne doit pas être appelé');
      assert.strictEqual(env.getSubscribeCount(), 0, 'subscribe() ne doit pas être appelé');
      assert.strictEqual(env.getFetchCalls().length, 0, 'Aucun appel fetch backend ne doit être fait');
      assert.strictEqual(existing.isUnsubscribed, false, 'L’ancien abonnement doit rester intact');
    });

    it('Scénario 2 : Clé malformée -> validation échoue avant tout, ancien abonnement intact', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      await webPushService.init({ publicKeyOverride: 'invalid!base64!!key' });

      assert.strictEqual(env.getUnsubscribeCount(), 0);
      assert.strictEqual(env.getSubscribeCount(), 0);
      assert.strictEqual(existing.isUnsubscribed, false);
    });

    it('Scénario 3 : Même clé VAPID & même propriétaire -> conserve abonnement, 0 unsubscribe, 0 subscribe, et EXACTEMENT 1 POST backend', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      // Enregistrer le propriétaire actuel
      localStorageMock[OWNER_STORAGE_KEY] = 'school1:user1';

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: 'school1:user1'
      });

      assert.strictEqual(env.getUnsubscribeCount(), 0, '0 unsubscribe attendu');
      assert.strictEqual(env.getSubscribeCount(), 0, '0 subscribe attendu');
      assert.strictEqual(env.getFetchCalls().length, 1, 'Exactement 1 POST backend attendu');
      assert.strictEqual(existing.isUnsubscribed, false);
    });

    it('Scénario 4 : Clé VAPID différente (rotation) -> unsubscribe ancien, subscribe nouveau, 1 POST backend', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      localStorageMock[OWNER_STORAGE_KEY] = 'school1:user1';

      await webPushService.init({
        publicKeyOverride: VALID_KEY_B,
        owner: 'school1:user1'
      });

      assert.strictEqual(env.getUnsubscribeCount(), 1, 'L’ancien abonnement doit être désabonné');
      assert.strictEqual(env.getSubscribeCount(), 1, 'Un nouvel abonnement doit être souscrit');
      assert.strictEqual(env.getFetchCalls().length, 1, 'Le nouvel abonnement doit être sauvegardé');
      assert.strictEqual(existing.isUnsubscribed, true);
    });

    it('Scénario 5 : Changement de compte multi-utilisateur (marqueur différent) -> désabonne l’ancien et souscrit le nouveau', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      // Marqueur appartenant à userA
      localStorageMock[OWNER_STORAGE_KEY] = 'school1:userA';

      // Connexion de userB avec la même clé VAPID
      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: 'school1:userB'
      });

      assert.strictEqual(env.getUnsubscribeCount(), 1, 'Doit désabonner l’ancien utilisateur');
      assert.strictEqual(env.getSubscribeCount(), 1, 'Doit créer un nouvel abonnement pour le nouvel utilisateur');
      assert.strictEqual(env.getFetchCalls().length, 1);
      assert.strictEqual(localStorageMock[OWNER_STORAGE_KEY], 'school1:userB', 'Le nouveau propriétaire doit être enregistré après succès');
    });

    it('Scénario 6 : Échec de unsubscribe() avec ancien abonnement toujours actif -> arrêt net et exception contrôlée', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const failingSub = {
        endpoint: 'https://push.example.com/failing',
        options: { applicationServerKey: bytesA.buffer },
        unsubscribe: async () => {
          throw new Error('Network error on push service');
        }
      };

      const env = setupBrowserEnvironment({ existingSub: failingSub });
      localStorageMock[OWNER_STORAGE_KEY] = 'school1:user1';

      // On tente une rotation vers KEY_B
      await webPushService.init({
        publicKeyOverride: VALID_KEY_B,
        owner: 'school1:user1'
      });

      assert.strictEqual(env.getSubscribeCount(), 0, 'subscribe() ne doit pas être appelé si l’ancien abonnement reste actif');
      assert.strictEqual(env.getFetchCalls().length, 0, 'Aucun POST backend ne doit être émis');
    });

    it('Scénario 7 : InvalidStateError avec récupération et un unique réessai réussi', async () => {
      let subscribeAttempts = 0;
      const env = setupBrowserEnvironment({
        existingSub: null,
        subscribeImpl: async (opts: any, count: number) => {
          subscribeAttempts++;
          if (count === 1) {
            const err: any = new Error('A subscription with different key exists');
            err.name = 'InvalidStateError';
            throw err;
          }
          const bytes = new Uint8Array(opts.applicationServerKey);
          return createMockSubscription(bytes, 'https://push.example.com/recovered-sub');
        }
      });

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: 'school1:user1'
      });

      assert.strictEqual(subscribeAttempts, 2, 'Doit effectuer exactement 2 tentatives (1 initiale + 1 réessai)');
      assert.strictEqual(env.getFetchCalls().length, 1, 'L’abonnement récupéré doit être sauvegardé');
    });

    it('Scénario 8 : InvalidStateError persistant -> arrêt immédiat sans boucle infinie', async () => {
      let subscribeAttempts = 0;
      setupBrowserEnvironment({
        existingSub: null,
        subscribeImpl: async () => {
          subscribeAttempts++;
          const err: any = new Error('Corrupted push state');
          err.name = 'InvalidStateError';
          throw err;
        }
      });

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: 'school1:user1'
      });

      assert.strictEqual(subscribeAttempts, 2, 'Exactement 2 tentatives au total, pas de boucle infinie');
    });

    it('Scénario 9 : Appels simultanés (Mutex) -> une seule exécution et un seul POST backend', async () => {
      const env = setupBrowserEnvironment({ existingSub: null });

      const p1 = webPushService.init({ publicKeyOverride: VALID_KEY_A, owner: 'school1:user1' });
      const p2 = webPushService.init({ publicKeyOverride: VALID_KEY_A, owner: 'school1:user1' });

      await Promise.all([p1, p2]);

      assert.strictEqual(env.getSubscribeCount(), 1, 'Un seul subscribe() doit être émis');
      assert.strictEqual(env.getFetchCalls().length, 1, 'Un seul POST backend doit être émis');
    });

    it('Scénario 10 : Annulation par AbortSignal suite à une déconnexion -> 0 POST backend', async () => {
      const env = setupBrowserEnvironment({ existingSub: null });
      const controller = new AbortController();

      // Annulation immédiate (simule une déconnexion immédiate)
      controller.abort();

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        signal: controller.signal,
        owner: 'school1:user1'
      });

      assert.strictEqual(env.getSubscribeCount(), 0, 'subscribe() ne doit pas être appelé si aborté');
      assert.strictEqual(env.getFetchCalls().length, 0, '0 POST backend');
    });

    it('Scénario 11 : Logs 100% fixes (zéro fuite d’endpoint, token, payload ou message d’erreur dynamique)', async () => {
      setupBrowserEnvironment({ existingSub: null });

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: 'school1:user1'
      });

      for (const log of logsList) {
        assert.strictEqual(log.includes('http'), false, 'Aucun endpoint ou URL ne doit être journalisé');
        assert.strictEqual(log.includes(VALID_KEY_A), false, 'La clé VAPID ne doit jamais être journalisée');
        assert.strictEqual(log.includes('mock_'), false, 'Aucun secret d’abonnement ne doit être journalisé');
      }
    });

    it('Scénario 12 : Utilisateur absent (options sans owner) -> arrêt immédiat sans toucher à l’abonnement existant', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: undefined
      });

      assert.strictEqual(env.getUnsubscribeCount(), 0, '0 unsubscribe attendu');
      assert.strictEqual(env.getSubscribeCount(), 0, '0 subscribe attendu');
      assert.strictEqual(env.getFetchCalls().length, 0, '0 POST backend attendu');
      assert.strictEqual(existing.isUnsubscribed, false, 'L’abonnement existant doit rester intact');
    });

    it('Scénario 13 : École absente (owner vide ou incomplet) -> arrêt immédiat sans altération', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existing = createMockSubscription(bytesA);
      const env = setupBrowserEnvironment({ existingSub: existing });

      await webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        owner: ''
      });

      assert.strictEqual(env.getUnsubscribeCount(), 0);
      assert.strictEqual(env.getSubscribeCount(), 0);
      assert.strictEqual(env.getFetchCalls().length, 0);
      assert.strictEqual(existing.isUnsubscribed, false);
    });

    it('Scénario 14 : Changement rapide : A interrompu puis B connecté -> promesses distinctes, 0 sync pour A, init réussie pour B', async () => {
      let pauseRegistrationA = true;
      let registrationStartedA: (() => void) | null = null;
      const registrationStartedPromise = new Promise<void>((r) => {
        registrationStartedA = r;
      });
      let registrationCallCount = 0;

      const env = setupBrowserEnvironment({
        existingSub: null
      });

      const originalRegister = (globalThis as any).navigator.serviceWorker.register;
      (globalThis as any).navigator.serviceWorker.register = async (url: string) => {
        registrationCallCount++;
        if (registrationCallCount === 1) {
          registrationStartedA?.();
          while (pauseRegistrationA) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        return originalRegister(url);
      };

      const controllerA = new AbortController();
      const promiseA = webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        signal: controllerA.signal,
        owner: 'school1:userA'
      });

      // Attendre que A soit effectivement entré dans son enregistrement initial
      await registrationStartedPromise;

      // A est en vol. On interrompt A :
      controllerA.abort();

      // B se connecte immédiatement pendant que A est encore actif
      const controllerB = new AbortController();
      const promiseB = webPushService.init({
        publicKeyOverride: VALID_KEY_A,
        signal: controllerB.signal,
        owner: 'school1:userB'
      });

      // Deux propriétaires distincts ne partagent jamais la même promesse en vol
      assert.notStrictEqual(promiseA, promiseB, 'A et B ne doivent jamais partager la même promesse');

      // Débloquer A
      pauseRegistrationA = false;

      await Promise.all([promiseA, promiseB]);

      // Vérifier que A n'a effectué aucun POST et que seul B a synchronisé son token
      const fetchCalls = env.getFetchCalls();
      assert.strictEqual(fetchCalls.length, 1, 'Exactement 1 POST backend attendu pour B');
      assert.strictEqual(localStorageMock[OWNER_STORAGE_KEY], 'school1:userB', 'Le marqueur final doit être celui de B');
    });

    it('Scénario 15 : Annulation avant le POST -> fetch non exécuté, aucun marqueur de propriétaire écrit', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const sub = createMockSubscription(bytesA);
      let fetchCalled = false;
      (globalThis as any).fetch = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({ success: true }) };
      };

      const controller = new AbortController();
      controller.abort(); // Signal déjà interrompu

      const success = await webPushService.saveSubscription(sub as any, controller.signal, 'school1:user1');

      assert.strictEqual(success, false, 'saveSubscription doit retourner false');
      assert.strictEqual(fetchCalled, false, 'fetch ne doit jamais être appelé');
      assert.strictEqual(localStorageMock[OWNER_STORAGE_KEY], undefined, 'Aucun marqueur écrit dans localStorage');
    });

    it('Scénario 16 : Annulation pendant le POST (fetch en vol) -> échec de sauvegarde, aucun marqueur écrit', async () => {
      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const sub = createMockSubscription(bytesA);
      const controller = new AbortController();

      (globalThis as any).fetch = async () => {
        // Déclencher abort pendant le fetch
        controller.abort();
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      };

      const success = await webPushService.saveSubscription(sub as any, controller.signal, 'school1:user1');

      assert.strictEqual(success, false, 'saveSubscription doit retourner false');
      assert.strictEqual(localStorageMock[OWNER_STORAGE_KEY], undefined, 'Le marqueur ne doit pas être écrit');
    });

    it('Scénario 17 : Test instrumenté d’exclusion mutuelle PushManager entre deux propriétaires distincts A et B', async () => {
      let activePushManagerOps = 0;
      let maxConcurrentOps = 0;
      const executionTimeline: string[] = [];

      const bytesA = parseVapidPublicKey(VALID_KEY_A);
      const existingA = createMockSubscription(bytesA, 'https://push.example.com/sub-A');

      const recordPushManagerEnter = (op: string) => {
        activePushManagerOps++;
        if (activePushManagerOps > maxConcurrentOps) {
          maxConcurrentOps = activePushManagerOps;
        }
        executionTimeline.push(`enter:${op}`);
      };

      const recordPushManagerLeave = (op: string) => {
        activePushManagerOps--;
        executionTimeline.push(`leave:${op}`);
      };

      const origUnsub = existingA.unsubscribe;
      existingA.unsubscribe = async () => {
        recordPushManagerEnter('unsubscribe-A');
        await new Promise((r) => setTimeout(r, 20));
        recordPushManagerLeave('unsubscribe-A');
        return origUnsub();
      };

      const env = setupBrowserEnvironment({
        existingSub: existingA,
        subscribeImpl: async (opts: any, count: number) => {
          recordPushManagerEnter(`subscribe-${count}`);
          await new Promise((r) => setTimeout(r, 20));
          recordPushManagerLeave(`subscribe-${count}`);
          const bytes = new Uint8Array(opts.applicationServerKey);
          return createMockSubscription(bytes, `https://push.example.com/sub-new-${count}`);
        }
      });

      // Lancer A avec KEY_B (provoquant un unsubscribe sur PushManager)
      const promiseA = webPushService.init({
        publicKeyOverride: VALID_KEY_B,
        owner: 'school1:userA'
      });

      // Lancer B immédiatement pendant que A est actif sur PushManager
      const promiseB = webPushService.init({
        publicKeyOverride: VALID_KEY_B,
        owner: 'school1:userB'
      });

      // Vérifier que deux propriétaires distincts ont des promesses distinctes
      assert.notStrictEqual(promiseA, promiseB, 'A et B obtiennent des promesses distinctes');

      await Promise.all([promiseA, promiseB]);

      // Assertions sur l'instrumentation :
      // 1. Zéro chevauchement sur PushManager
      assert.strictEqual(maxConcurrentOps, 1, 'Les opérations PushManager ne doivent JAMAIS se chevaucher (maxConcurrentOps = 1)');
      assert.strictEqual(activePushManagerOps, 0, 'Toutes les opérations PushManager doivent être terminées');

      // 2. B attend que A quitte PushManager avant d'y entrer
      const lastLeaveAIndex = executionTimeline.lastIndexOf('leave:unsubscribe-A');
      const firstEnterBIndex = executionTimeline.findIndex((item) => item === 'enter:subscribe-2');
      assert.ok(lastLeaveAIndex < firstEnterBIndex, 'A doit avoir complètement terminé avant que B n’entre dans PushManager');

      // 3. B s’est exécuté et a mis à jour son propriétaire
      assert.strictEqual(localStorageMock[OWNER_STORAGE_KEY], 'school1:userB', 'B doit terminer et sauvegarder son propriétaire');
    });
  });
});
