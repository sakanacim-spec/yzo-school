/**
 * Service pour gérer l'abonnement aux notifications Web Push
 * et la rotation sécurisée des clés VAPID (zéro fuite de données, logs 100% fixes)
 */

import { API_BASE_URL } from '../config.ts';
import { getAuthHeaders } from './apiHelpers.ts';

export const OWNER_STORAGE_KEY = 'push_subscription_owner_v1';

export interface InitPushOptions {
  promptIfDenied?: boolean;
  signal?: AbortSignal;
  owner?: string;
  publicKeyOverride?: string;
}

export function isValidBase64Url(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0) return false;
  return /^[A-Za-z0-9_-]+$/.test(str);
}

export function parseVapidPublicKey(base64String: string): Uint8Array {
  if (typeof base64String !== 'string' || base64String.length === 0) {
    throw new Error('Cle VAPID absente');
  }
  if (!isValidBase64Url(base64String)) {
    throw new Error('Format Base64URL invalide');
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  if (typeof globalThis.atob !== 'function') {
    throw new Error('Decodeur atob indisponible');
  }

  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  if (outputArray.length !== 65 || outputArray[0] !== 0x04) {
    throw new Error('Cle VAPID non conforme P-256');
  }

  return outputArray;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  return parseVapidPublicKey(base64String);
}

export function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function getApplicationServerKeyBytes(subscription: PushSubscription | null): Uint8Array | null {
  if (!subscription || !subscription.options || !subscription.options.applicationServerKey) {
    return null;
  }
  const key = subscription.options.applicationServerKey;
  if (key instanceof Uint8Array) {
    return key;
  }
  if (ArrayBuffer.isView(key)) {
    return new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
  }
  if (key instanceof ArrayBuffer) {
    return new Uint8Array(key);
  }
  return null;
}

export function doesSubscriptionMatchKey(subscription: PushSubscription | null, expectedKeyBytes: Uint8Array): boolean {
  const existingKeyBytes = getApplicationServerKeyBytes(subscription);
  if (!existingKeyBytes) return false;
  return areUint8ArraysEqual(existingKeyBytes, expectedKeyBytes);
}

export function getVapidPublicKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY;
  }
  if (typeof process !== 'undefined' && process.env?.VITE_VAPID_PUBLIC_KEY) {
    return process.env.VITE_VAPID_PUBLIC_KEY;
  }
  return '';
}

let activeInFlight: { owner: string; promise: Promise<void> } | null = null;
let previousTail: Promise<void> = Promise.resolve();

export const webPushService = {
  async init(options?: InitPushOptions): Promise<void> {
    const currentOwner = options?.owner;
    if (!currentOwner) {
      console.log('[Push] Identifiant de proprietaire manquant.');
      return;
    }

    if (activeInFlight && activeInFlight.owner === currentOwner) {
      console.log('[Push] Initialisation deja en cours.');
      return activeInFlight.promise;
    }

    const waitBeforeStart = previousTail;

    let runPromise: Promise<void> | null = null;
    const executeInit = async () => {
      try {
        try {
          await waitBeforeStart;
        } catch {
          // Ignorer l'erreur ou l'annulation de l'opération précédente
        }

        if (options?.signal?.aborted) {
          console.warn('[Push] Operation annulee apres deconnexion.');
          return;
        }

        await this._performInit(options, currentOwner);
      } finally {
        if (activeInFlight?.promise === runPromise) {
          activeInFlight = null;
        }
      }
    };
    runPromise = executeInit();
    activeInFlight = { owner: currentOwner, promise: runPromise };
    previousTail = runPromise.catch(() => {});
    return runPromise;
  },

  async _performInit(options: InitPushOptions | undefined, currentOwner: string): Promise<void> {
    console.log('[Push] Initialisation du service Web Push.');
    const signal = options?.signal;

    if (signal?.aborted) {
      console.warn('[Push] Operation annulee apres deconnexion.');
      return;
    }

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined' || !('PushManager' in window)) {
      console.warn('[Push] Web Push non supporte par ce navigateur.');
      return;
    }

    // Validation préalable et stricte de la clé VAPID AVANT toute manipulation d'abonnement
    const rawPublicKey = options?.publicKeyOverride ?? getVapidPublicKey();
    let expectedKeyBytes: Uint8Array;
    try {
      expectedKeyBytes = parseVapidPublicKey(rawPublicKey);
    } catch {
      console.warn('[Push] Cle VAPID non configuree ou invalide.');
      // L'abonnement existant reste strictement intact
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] Service Worker enregistre.');

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return;
      }

      let permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
      if (permission !== 'granted') {
        if (options?.promptIfDenied && typeof Notification !== 'undefined') {
          permission = await Notification.requestPermission();
        }
      }

      if (permission !== 'granted') {
        console.warn('[Push] Permission non accordee.');
        return;
      }

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return;
      }

      const existingSubscription = await registration.pushManager.getSubscription();

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return;
      }

      const savedOwner = typeof localStorage !== 'undefined' ? localStorage.getItem(OWNER_STORAGE_KEY) : null;
      const isSameOwner = Boolean(savedOwner && savedOwner === currentOwner);

      let subscription: PushSubscription | null = null;

      if (existingSubscription) {
        // Protection multi-utilisateur : si propriétaire absent ou différent, réinitialiser
        if (!isSameOwner) {
          console.warn('[Push] Changement de compte detecte sur le navigateur.');
          try {
            await existingSubscription.unsubscribe();
          } catch {
            console.error('[Push] Echec lors du desabonnement.');
          }

          const lingering = await registration.pushManager.getSubscription();
          if (lingering) {
            console.error('[Push] Ancien abonnement toujours actif apres desabonnement.');
            throw new Error('[Push] Ancien abonnement toujours actif apres desabonnement.');
          }
        } else if (doesSubscriptionMatchKey(existingSubscription, expectedKeyBytes)) {
          // Même clé VAPID et même propriétaire : conserver l'abonnement
          console.log('[Push] Abonnement existant conforme a la cle VAPID.');
          subscription = existingSubscription;
        } else {
          // Rotation de clé VAPID pour le même propriétaire
          console.warn('[Push] Renouvellement de cle VAPID necessaire.');
          try {
            await existingSubscription.unsubscribe();
          } catch {
            console.error('[Push] Echec lors du desabonnement.');
          }

          const lingering = await registration.pushManager.getSubscription();
          if (lingering) {
            console.error('[Push] Ancien abonnement toujours actif apres desabonnement.');
            throw new Error('[Push] Ancien abonnement toujours actif apres desabonnement.');
          }
        }
      }

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return;
      }

      if (!subscription) {
        subscription = await this._subscribeWithRecovery(registration, expectedKeyBytes, signal);
        console.log('[Push] Nouvel abonnement cree.');
      }

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return;
      }

      // Synchronisation backend obligatoire (même clé ou nouvelle clé)
      if (subscription) {
        await this.saveSubscription(subscription, signal, currentOwner);
      }
    } catch {
      console.error('[Push] Echec de l initialisation Web Push.');
    }
  },

  async _subscribeWithRecovery(
    registration: ServiceWorkerRegistration,
    expectedKeyBytes: Uint8Array,
    signal?: AbortSignal
  ): Promise<PushSubscription> {
    let retried = false;

    if (signal?.aborted) {
      throw new Error('[Push] Annule');
    }

    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKeyBytes as unknown as BufferSource
      });
    } catch (error: any) {
      const isInvalidState =
        error?.name === 'InvalidStateError' ||
        (typeof error?.message === 'string' && error.message.includes('InvalidStateError'));

      if (isInvalidState && !retried) {
        retried = true;
        console.warn('[Push] Erreur InvalidStateError capturee.');

        if (signal?.aborted) {
          throw new Error('[Push] Annule');
        }

        try {
          const lingering = await registration.pushManager.getSubscription();
          if (lingering) {
            await lingering.unsubscribe();
          }
        } catch {
          console.error('[Push] Echec lors du desabonnement.');
        }

        if (signal?.aborted) {
          throw new Error('[Push] Annule');
        }

        const retrySub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKeyBytes as unknown as BufferSource
        });
        console.log('[Push] Reabonnement de recuperation reussi.');
        return retrySub;
      }

      console.error('[Push] Echec definitif de souscription.');
      throw error;
    }
  },

  async saveSubscription(subscription: PushSubscription, signal?: AbortSignal, owner?: string): Promise<boolean> {
    if (signal?.aborted) {
      console.warn('[Push] Operation annulee apres deconnexion.');
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/update-push-token`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ push_token: JSON.stringify(subscription) }),
        signal
      });

      if (!response.ok) {
        console.error('[Push] Echec de sauvegarde du token sur le serveur.');
        return false;
      }

      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
        return false;
      }

      console.log('[Push] Token synchronise avec le serveur.');

      // Enregistrement du nouveau propriétaire UNIQUEMENT après succès de la synchronisation et si non annulé
      if (owner && typeof localStorage !== 'undefined') {
        localStorage.setItem(OWNER_STORAGE_KEY, owner);
      }
      return true;
    } catch {
      if (signal?.aborted) {
        console.warn('[Push] Operation annulee apres deconnexion.');
      } else {
        console.error('[Push] Echec de sauvegarde du token sur le serveur.');
      }
      return false;
    }
  }
};
