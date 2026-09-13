import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

const cjsRequire = createRequire(import.meta.url);

function loadComponent(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transformed = esbuild.transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    target: 'node20',
    jsx: 'transform',
    define: {
      'import.meta.env': '{}'
    }
  });

  const m: any = { exports: {} };
  const req = (mod: string) => {
    if (mod.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), mod);
      for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
        if (fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile()) {
          if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
            return loadComponent(resolved + ext);
          }
          return cjsRequire(resolved + ext);
        }
      }
    }
    return cjsRequire(mod);
  };

  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', transformed.code);
  fn(m, m.exports, req, filePath, path.dirname(filePath));
  return m.exports;
}

const registerModule = loadComponent(path.resolve('src/components/Register.tsx'));
const { Register } = registerModule;

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

describe('Formulaire Inscription Directeur — Structure et conformité du composant réel', () => {
  const registerSource = fs.readFileSync(path.resolve('src/components/Register.tsx'), 'utf-8');

  it('A. Le groupe de boutons de langue et son libellé sont retirés du formulaire', () => {
    // Vérification que les boutons explicites par langue ont été retirés
    assert.strictEqual(registerSource.includes("onClick={() => setPreferredLanguage('fr')}"), false);
    assert.strictEqual(registerSource.includes("onClick={() => setPreferredLanguage('en')}"), false);
    assert.strictEqual(registerSource.includes("onClick={() => setPreferredLanguage('es')}"), false);
    assert.strictEqual(registerSource.includes("onClick={() => setPreferredLanguage('ar')}"), false);
    assert.strictEqual(registerSource.includes('{T.register.preferredLanguage}'), false);

    // Exécution réelle du composant React en rendu initial SSR
    const html = ReactDOMServer.renderToString(
      React.createElement(Register, { onBack: () => {}, onSuccess: () => {} })
    );

    assert.strictEqual(html.includes("Langue de l'Interface"), false, 'Le libellé Langue de l’Interface ne doit plus être présent');
    assert.strictEqual(html.includes('🇫🇷 Français'), false, 'Le bouton 🇫🇷 Français ne doit plus être présent');
    assert.strictEqual(html.includes('🇬🇧 English'), false, 'Le bouton 🇬🇧 English ne doit plus être présent');
    assert.strictEqual(html.includes('🇪🇸 Español'), false, 'Le bouton 🇪🇸 Español ne doit plus être présent');
    assert.strictEqual(html.includes('🇸🇦 العربية'), false, 'Le bouton 🇸🇦 العربية ne doit plus être présent');
  });

  it('B. Bouton œil de visibilité du mot de passe : attributs et sécurité dans le rendu SSR', () => {
    // Bouton de type button (sans soumission)
    assert.strictEqual(
      registerSource.includes('type="button"'),
      true,
      'Le bouton toggle doit être de type button pour éviter la soumission'
    );

    // Accessibilité et libellés
    assert.strictEqual(
      registerSource.includes('aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}'),
      true
    );
    assert.strictEqual(
      registerSource.includes('aria-pressed={showPassword}'),
      true
    );

    // Icônes du système existant
    assert.strictEqual(registerSource.includes('<EyeOff'), true);
    assert.strictEqual(registerSource.includes('<Eye'), true);

    // Autocomplete et validation
    assert.strictEqual(registerSource.includes('autoComplete="new-password"'), true);
    assert.strictEqual(registerSource.includes('minLength={6}'), true);

    // Espacement suffisant pour éviter tout chevauchement (pe-11)
    assert.strictEqual(registerSource.includes('pe-11'), true);

    // Rendu HTML réel du composant : état masqué par défaut
    const html = ReactDOMServer.renderToString(
      React.createElement(Register, { onBack: () => {}, onSuccess: () => {} })
    );

    assert.strictEqual(html.includes('type="password"'), true, 'Le mot de passe doit être masqué par défaut');
    assert.strictEqual(html.includes('aria-label="Afficher le mot de passe"'), true);
    assert.strictEqual(html.includes('aria-pressed="false"'), true);
    assert.strictEqual(html.includes('autoComplete="new-password"'), true);
  });
});

describe('Comportement réel dans le navigateur (Serveur Vite dédié & Puppeteer)', () => {
  it('Bascule mot de passe, zéro submit/requête lors du clic œil, et validation des 5 langues', async () => {
    // 1. Démarrer automatiquement un serveur Vite dédié sur un port disponible
    const dedicatedPort = await getAvailablePort();
    const { createServer } = await import('vite');
    const viteServer = await createServer({
      server: { port: dedicatedPort, strictPort: true },
      logLevel: 'silent'
    });
    await viteServer.listen();

    const baseUrl = `http://localhost:${dedicatedPort}`;
    const puppeteer = cjsRequire('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // 2. Interception des requêtes d’inscription AVANT TOUTE INTERACTION
      // Aucune requête register-school ne doit atteindre un backend réel
      let eyeClickRegisterRequests = 0;
      let interceptedPayload: any = null;

      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        const url = req.url();
        if (url.includes('/register-school') || url.includes('/auth/register-school')) {
          if (isTestingEyeOnly) {
            eyeClickRegisterRequests++;
          }
          try {
            interceptedPayload = JSON.parse(req.postData());
          } catch {
            interceptedPayload = req.postData();
          }
          // Répondre immédiatement avec un mock 201 — AUCUN appel backend réel
          req.respond({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Simulation réussie', user: { id: 'mock-user-id' } })
          });
          return;
        }
        req.continue();
      });

      let isTestingEyeOnly = true;

      // 3. Navigation initiale et installation du compteur submit
      await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle2' });

      await page.evaluate(() => {
        (window as any).__formSubmitCount = 0;
        const form = document.querySelector('form');
        if (form) {
          form.addEventListener('submit', () => {
            (window as any).__formSubmitCount++;
          });
        }
      });

      // 4. Test du champ mot de passe et du bouton œil
      const passwordInput = await page.waitForSelector('input[autocomplete="new-password"]', { visible: true });
      const initialType = await page.$eval('input[autocomplete="new-password"]', (el: any) => el.type);
      assert.strictEqual(initialType, 'password', 'Le mot de passe doit être masqué par défaut');

      const dummyPass = 'FictifSecret2026!';
      await passwordInput.type(dummyPass);

      // Clic sur l'œil : affichage en clair
      const eyeBtn = await page.waitForSelector('button[aria-label="Afficher le mot de passe"]', { visible: true });
      await eyeBtn.click();
      await new Promise((r) => setTimeout(r, 60));

      const visibleType = await page.$eval('input[autocomplete="new-password"]', (el: any) => el.type);
      const visibleVal = await page.$eval('input[autocomplete="new-password"]', (el: any) => el.value);
      const visibleLabel = await page.$eval('button[aria-pressed="true"]', (el: any) => el.getAttribute('aria-label'));
      const visiblePressed = await page.$eval('button[aria-pressed="true"]', (el: any) => el.getAttribute('aria-pressed'));

      assert.strictEqual(visibleType, 'text', 'Le champ doit basculer en type text');
      assert.strictEqual(visibleVal, dummyPass, 'La valeur saisie doit être strictement conservée');
      assert.strictEqual(visibleLabel, 'Masquer le mot de passe');
      assert.strictEqual(visiblePressed, 'true');

      // Re-clic sur l'œil : masquage
      await eyeBtn.click();
      await new Promise((r) => setTimeout(r, 60));

      const hiddenAgainType = await page.$eval('input[autocomplete="new-password"]', (el: any) => el.type);
      const hiddenAgainVal = await page.$eval('input[autocomplete="new-password"]', (el: any) => el.value);
      const hiddenAgainLabel = await page.$eval('button[aria-pressed="false"]', (el: any) => el.getAttribute('aria-label'));
      const hiddenAgainPressed = await page.$eval('button[aria-pressed="false"]', (el: any) => el.getAttribute('aria-pressed'));

      assert.strictEqual(hiddenAgainType, 'password', 'Le champ doit revenir en type password');
      assert.strictEqual(hiddenAgainVal, dummyPass, 'La valeur est toujours conservée');
      assert.strictEqual(hiddenAgainLabel, 'Afficher le mot de passe');
      assert.strictEqual(hiddenAgainPressed, 'false');

      // 5. Vérification stricte : zéro submit et zéro requête d'inscription lors des clics sur l'œil
      const submitsDuringEye = await page.evaluate(() => (window as any).__formSubmitCount);
      assert.strictEqual(submitsDuringEye, 0, 'Les clics sur l’œil doivent produire zéro submit');
      assert.strictEqual(eyeClickRegisterRequests, 0, 'Les clics sur l’œil doivent produire zéro requête d’inscription');

      // 6. Test des 5 langues (fr, en, es, ar et langue non supportée 'de' -> fallback 'fr')
      isTestingEyeOnly = false;

      const testLanguages = [
        { lang: 'fr', expectedPreferred: 'fr' },
        { lang: 'en', expectedPreferred: 'en' },
        { lang: 'es', expectedPreferred: 'es' },
        { lang: 'ar', expectedPreferred: 'ar' },
        { lang: 'de', expectedPreferred: 'fr' } // fallback 'fr'
      ];

      for (const { lang, expectedPreferred } of testLanguages) {
        interceptedPayload = null;

        await page.evaluateOnNewDocument((l: any) => {
          localStorage.setItem('app_language', l);
        }, lang);

        await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle2' });

        // Remplir le formulaire complet avec données fictives
        await page.evaluate(() => {
          const textInputs = document.querySelectorAll('form input[type="text"]');
          const setVal = (input: any, val: string) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
            setter.call(input, val);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          };

          // Nom établissement
          setVal(textInputs[0], 'École Test Puppeteer');

          // Types et pays
          const selects = document.querySelectorAll('form select');
          (selects[0] as HTMLSelectElement).value = 'Collège';
          selects[0].dispatchEvent(new Event('change', { bubbles: true }));

          (selects[1] as HTMLSelectElement).value = 'BJ';
          selects[1].dispatchEvent(new Event('change', { bubbles: true }));

          // Téléphones
          const telInputs = document.querySelectorAll('form input[type="tel"]');
          for (const tel of telInputs) {
            setVal(tel, '97000000');
          }

          // Nom directeur
          const requiredTextInputs = document.querySelectorAll('form input[required][type="text"]');
          if (requiredTextInputs.length > 1) {
            setVal(requiredTextInputs[1], 'Directeur Fictif');
          }

          // Mot de passe
          const passInput = document.querySelector('form input[autocomplete="new-password"]');
          setVal(passInput, 'MotDePasseFictif123!');

          // Consentements
          const cbs = document.querySelectorAll('form input[type="checkbox"]');
          for (const cb of cbs) {
            if (!(cb as HTMLInputElement).checked) {
              (cb as HTMLInputElement).click();
            }
          }
        });

        // Soumission du formulaire
        const submitBtn = await page.$('button[type="submit"]');
        await submitBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        assert.ok(interceptedPayload, `Le formulaire Register doit avoir émis une requête pour ${lang}`);
        assert.strictEqual(
          interceptedPayload.preferred_language,
          expectedPreferred,
          `preferred_language émis par Register pour ${lang} doit être ${expectedPreferred}`
        );
      }
    } finally {
      await browser.close();
      await viteServer.close();
    }
  });
});
