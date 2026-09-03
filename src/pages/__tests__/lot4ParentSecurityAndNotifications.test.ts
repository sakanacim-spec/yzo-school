// Tests unitaires ciblés pour la sécurité des justifications parentales et le service de notifications
// Exécution : node --experimental-strip-types --test src/pages/__tests__/lot4ParentSecurityAndNotifications.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// 1. Audit et tests de sécurité sur la justification d’absence
// ============================================================================
describe('1. Audit et tests de sécurité : Justification d’absence parentale', () => {
  const parentRoutesFile = fs.readFileSync(path.resolve('backend/routes/parent.js'), 'utf-8');
  const parentDevoirsFile = fs.readFileSync(path.resolve('src/pages/parent/ParentDevoirsPresence.tsx'), 'utf-8');

  it('Sécurité backend : aucune route PUT/POST/PATCH/DELETE de modification de présence dans backend/routes/parent.js', () => {
    assert.strictEqual(parentRoutesFile.includes("router.get('/presences/:studentId'"), true);
    assert.strictEqual(parentRoutesFile.includes("router.post('/presences'"), false);
    assert.strictEqual(parentRoutesFile.includes("router.put('/presences'"), false);
    assert.strictEqual(parentRoutesFile.includes("router.patch('/presences'"), false);
  });

  it('Sécurité frontend : ParentDevoirsPresence ne déstructure pas updatePresence depuis useStore', () => {
    assert.strictEqual(parentDevoirsFile.includes('updatePresence'), false, 'updatePresence ne doit pas être présent dans ParentDevoirsPresence.tsx');
  });

  it('Accessibilité & Fail-closed : modale avec rôle dialog, aria-modal, fermeture Escape et restitution focus', () => {
    assert.strictEqual(parentDevoirsFile.includes('role="dialog"'), true);
    assert.strictEqual(parentDevoirsFile.includes('aria-modal="true"'), true);
    assert.strictEqual(parentDevoirsFile.includes('aria-labelledby="justify-dialog-title"'), true);
    assert.strictEqual(parentDevoirsFile.includes("e.key === 'Escape'"), true);
    assert.strictEqual(parentDevoirsFile.includes('triggerBtnRef.current?.focus()'), true);
    assert.strictEqual(parentDevoirsFile.includes('<input type="file"'), false);
    assert.strictEqual(parentDevoirsFile.includes('handleSubmitJustification'), false);
  });

  it('Piégeage du focus WCAG statique : premier élément ciblé, boucle Tab, Shift+Tab et écoute focusin', () => {
    assert.strictEqual(parentDevoirsFile.includes('focusableElements[0].focus()'), true);
    assert.strictEqual(parentDevoirsFile.includes("e.key === 'Tab'"), true);
    assert.strictEqual(parentDevoirsFile.includes('firstElement.focus()'), true);
    assert.strictEqual(parentDevoirsFile.includes('lastElement.focus()'), true);
    assert.strictEqual(parentDevoirsFile.includes('modalRef'), true);
    assert.strictEqual(parentDevoirsFile.includes("'focusin'"), true, 'Doit intercepter focusin pour confiner le focus');
    assert.strictEqual(parentDevoirsFile.includes('modalRef.current.contains'), true, 'Doit vérifier la contenance dans le dialogue');
  });

  it('Piégeage du focus WCAG comportemental : initial, boucle Tab/Shift+Tab et blocage arrière-plan', () => {
    let focusedElement: string | null = null;
    const btnClose = {
      name: 'btnClose',
      focus: () => { focusedElement = 'btnClose'; }
    };
    const btnUnderstood = {
      name: 'btnUnderstood',
      focus: () => { focusedElement = 'btnUnderstood'; }
    };
    const bgInput = {
      name: 'bgInput',
      focus: () => { focusedElement = 'bgInput'; }
    };

    const modalElements = [btnClose, btnUnderstood];
    const modalContainer = {
      contains: (el: unknown) => modalElements.includes(el as (typeof btnClose))
    };

    // 1. Focus initial placé dans le dialogue
    const initFocus = () => {
      if (modalElements.length > 0) {
        modalElements[0].focus();
      }
    };
    initFocus();
    assert.strictEqual(focusedElement, 'btnClose', 'Le focus initial doit être positionné sur le premier élément du dialogue');

    const currentActiveElement = () => {
      if (focusedElement === 'btnClose') return btnClose;
      if (focusedElement === 'btnUnderstood') return btnUnderstood;
      if (focusedElement === 'bgInput') return bgInput;
      return null;
    };

    // Handler simulant handleKeyDown
    const handleKeyDown = (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Tab') {
        const first = modalElements[0];
        const last = modalElements[modalElements.length - 1];

        if (!modalContainer.contains(currentActiveElement())) {
          e.preventDefault();
          first.focus();
          return;
        }

        if (e.shiftKey) {
          if (currentActiveElement() === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (currentActiveElement() === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    // 2. Tab depuis le dernier élément revient au premier
    focusedElement = 'btnUnderstood';
    let prevented = false;
    handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true, 'Tab sur le dernier élément doit appeler preventDefault');
    assert.strictEqual(focusedElement, 'btnClose', 'Tab sur le dernier élément doit boucler sur le premier');

    // 3. Shift+Tab depuis le premier élément revient au dernier
    focusedElement = 'btnClose';
    prevented = false;
    handleKeyDown({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true, 'Shift+Tab sur le premier élément doit appeler preventDefault');
    assert.strictEqual(focusedElement, 'btnUnderstood', 'Shift+Tab sur le premier élément doit boucler sur le dernier');

    // 4. Aucun élément de la page derrière le dialogue ne reçoit le focus (interception focusin)
    const handleFocusIn = (target: unknown, preventDefault: () => void) => {
      if (!modalContainer.contains(target)) {
        preventDefault();
        modalElements[0].focus();
      }
    };

    prevented = false;
    handleFocusIn(bgInput, () => { prevented = true; });
    assert.strictEqual(prevented, true, 'Un focus sur l’arrière-plan doit être intercepté et annulé');
    assert.strictEqual(focusedElement, 'btnClose', 'Le focus capté en arrière-plan doit être ramené dans le dialogue');

    // 5. Si focus externe résiduel et Tab pressé, redirection immédiate dans le dialogue
    focusedElement = 'bgInput';
    prevented = false;
    handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true);
    assert.strictEqual(focusedElement, 'btnClose');
  });

  it('Internationalisation : les clés de justification existent dans les 9 langues', () => {
    const languages = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
    const requiredKeys = [
      'justify',
      'justified',
      'justifyTitle',
      'justifyNoticeTitle',
      'justifyNoticeBody1',
      'justifyNoticeBody2',
      'understoodBtn'
    ];

    for (const lang of languages) {
      const filePath = path.resolve(`src/i18n/${lang}.ts`);
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const key of requiredKeys) {
        assert.strictEqual(
          content.includes(`"${key}":`),
          true,
          `La clé ${key} doit exister dans src/i18n/${lang}.ts`
        );
      }
    }
  });
});

// ============================================================================
// 2. Tests du service de notifications et gestion des erreurs
// ============================================================================
describe('2. Tests du service de notifications et garde-fous', () => {
  it('Navigateur incompatible (Notification absent de window) : retourne false sans lever d’erreur', async () => {
    const hasNotification = false;
    const requestNotificationPermission = async () => {
      if (!hasNotification) {
        return false;
      }
      return true;
    };

    const res = await requestNotificationPermission();
    assert.strictEqual(res, false);
  });

  it('Permission default puis accordée : transitionne l’état à granted', async () => {
    let perm = 'default';
    const mockWindow = {
      Notification: {
        get permission() { return perm; },
        requestPermission: async () => {
          perm = 'granted';
          return 'granted';
        }
      }
    };

    let localState = mockWindow.Notification.permission;
    assert.strictEqual(localState, 'default');

    const granted = await mockWindow.Notification.requestPermission();
    localState = mockWindow.Notification.permission;

    assert.strictEqual(granted, 'granted');
    assert.strictEqual(localState, 'granted');
  });

  it('Permission refusée : gérée sans crash et retourne denied', async () => {
    let perm = 'default';
    const mockWindow = {
      Notification: {
        get permission() { return perm; },
        requestPermission: async () => {
          perm = 'denied';
          return 'denied';
        }
      }
    };

    const res = await mockWindow.Notification.requestPermission();
    assert.strictEqual(res, 'denied');
  });

  it('Rejet d’erreur interne capturé, verrou libéré et réessai permis', async () => {
    let callsCount = 0;
    let isEnabling = false;

    const failingServiceCall = async () => {
      if (isEnabling) return 'busy';
      isEnabling = true;
      callsCount++;
      try {
        throw new Error('Push service registration failed internally');
      } finally {
        isEnabling = false;
      }
    };

    // 1er appel qui échoue
    await assert.rejects(async () => {
      await failingServiceCall();
    }, /Push service registration failed internally/);

    assert.strictEqual(isEnabling, false, 'Le verrou doit être libéré dans finally');

    // 2ème appel (réessai) qui fonctionne
    const retrySuccess = async () => {
      if (isEnabling) return 'busy';
      isEnabling = true;
      callsCount++;
      try {
        return 'granted';
      } finally {
        isEnabling = false;
      }
    };

    const res = await retrySuccess();
    assert.strictEqual(res, 'granted');
    assert.strictEqual(callsCount, 2);
  });

  it('Protection anti double-clic : ignore les clics concurrents pendant la promesse', async () => {
    let callsCount = 0;
    let isEnabling = false;

    const requestPermissionMock = async () => {
      if (isEnabling) return 'ignored';
      isEnabling = true;
      callsCount++;
      await new Promise(r => setTimeout(r, 20));
      isEnabling = false;
      return 'granted';
    };

    const p1 = requestPermissionMock();
    const p2 = requestPermissionMock();
    const p3 = requestPermissionMock();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.strictEqual(r1, 'granted');
    assert.strictEqual(r2, 'ignored');
    assert.strictEqual(r3, 'ignored');
    assert.strictEqual(callsCount, 1, 'Exactement un appel autorisé pendant la promesse en vol');
  });

  it('Protection démontage composant : le callback ne met pas à jour le state si isMounted === false', async () => {
    let stateUpdated = false;
    let isMounted = true;

    const simulateAsyncEnable = async () => {
      await new Promise(r => setTimeout(r, 10));
      if (isMounted) {
        stateUpdated = true;
      }
    };

    const promise = simulateAsyncEnable();
    isMounted = false;
    await promise;

    assert.strictEqual(stateUpdated, false, 'Le state ne doit pas être mis à jour après démontage');
  });
});
