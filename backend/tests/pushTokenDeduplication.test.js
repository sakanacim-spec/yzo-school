// Configurer les variables d'environnement de test avant tout require
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test_service_role_key_mock_for_local_tests';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_min_32_chars_for_local_tests_12345';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Importer le contrôleur
const { updatePushToken } = require('../controllers/authController');
const { supabase } = require('../utils/supabase');

describe('Déduplication push_token dans authController.updatePushToken', () => {
  it('Superadmin : retourne un message informatif sans mise à jour', async () => {
    const req = {
      user: { id: 'admin-1', role: 'superadmin', schoolSlug: 'school_a' },
      body: { push_token: '{"endpoint":"https://push.example.com/1"}' }
    };
    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; return res; },
      status: () => res
    };

    await updatePushToken(req, res);
    assert.strictEqual(jsonResult?.success, true);
    assert.strictEqual(jsonResult?.message?.includes('SuperAdmin'), true);
  });

  it('Dédoublonnage au sein du même établissement scolaire avant assignation', async () => {
    // Simuler la table profiles_ecole_a
    const profiles = [
      { id: 'parent-1', push_token: '{"endpoint":"https://push.example.com/device-1"}' },
      { id: 'parent-2', push_token: '{"endpoint":"https://push.example.com/device-1"}' }
    ];

    const originalFrom = supabase.from;
    const recordedOperations = [];

    supabase.from = (table) => {
      recordedOperations.push({ table });
      return {
        update: (updates) => {
          recordedOperations.push({ action: 'update', updates });
          return {
            eq: (field1, val1) => {
              recordedOperations.push({ filter: 'eq', field: field1, val: val1 });
              return {
                neq: (field2, val2) => {
                  recordedOperations.push({ filter: 'neq', field: field2, val: val2 });
                  // Nullifier le token pour les autres
                  profiles.forEach(p => {
                    if (p[field1] === val1 && p[field2] !== val2) {
                      p.push_token = updates.push_token;
                    }
                  });
                  return Promise.resolve({ error: null });
                },
                then: (resolve) => {
                  profiles.forEach(p => {
                    if (p[field1] === val1) {
                      p.push_token = updates.push_token;
                    }
                  });
                  resolve({ error: null });
                }
              };
            }
          };
        }
      };
    };

    try {
      const req = {
        user: { id: 'parent-2', role: 'parent', schoolSlug: 'ecole_a' },
        body: { push_token: '{"endpoint":"https://push.example.com/device-1"}' }
      };
      let jsonResult = null;
      const res = {
        json: (data) => { jsonResult = data; return res; },
        status: () => res
      };

      await updatePushToken(req, res);

      assert.strictEqual(jsonResult?.success, true);
      assert.strictEqual(profiles.find(p => p.id === 'parent-1').push_token, null, 'Le profil 1 doit avoir push_token null');
      assert.strictEqual(profiles.find(p => p.id === 'parent-2').push_token, '{"endpoint":"https://push.example.com/device-1"}');
    } finally {
      supabase.from = originalFrom;
    }
  });

  it('Suppression volontaire (push_token null) n’altère pas les autres profils', async () => {
    const profiles = [
      { id: 'parent-1', push_token: '{"endpoint":"https://push.example.com/device-1"}' },
      { id: 'parent-2', push_token: '{"endpoint":"https://push.example.com/device-2"}' }
    ];

    const originalFrom = supabase.from;
    supabase.from = (table) => ({
      update: (updates) => ({
        eq: (field, val) => {
          profiles.forEach(p => {
            if (p[field] === val) p.push_token = updates.push_token;
          });
          return Promise.resolve({ error: null });
        }
      })
    });

    try {
      const req = {
        user: { id: 'parent-1', role: 'parent', schoolSlug: 'ecole_a' },
        body: { push_token: null }
      };
      let jsonResult = null;
      const res = {
        json: (data) => { jsonResult = data; return res; },
        status: () => res
      };

      await updatePushToken(req, res);

      assert.strictEqual(jsonResult?.success, true);
      assert.strictEqual(profiles.find(p => p.id === 'parent-1').push_token, null);
      assert.strictEqual(profiles.find(p => p.id === 'parent-2').push_token, '{"endpoint":"https://push.example.com/device-2"}');
    } finally {
      supabase.from = originalFrom;
    }
  });

  it('Échec de la requête de dédoublonnage : empêche l’attribution et renvoie une erreur 500 sans fuite de message dynamique', async () => {
    let secondUpdateCalled = false;
    const originalFrom = supabase.from;
    const originalConsoleError = console.error;
    const loggedErrors = [];

    console.error = (...args) => {
      loggedErrors.push(args);
    };

    supabase.from = (table) => ({
      update: (updates) => ({
        eq: (field1, val1) => ({
          neq: (field2, val2) => {
            // Simule un échec de la première requête avec message secret/dynamique
            return Promise.resolve({ error: new Error('Sensitive DB connection detail: port 5432 unreachable') });
          },
          then: (resolve) => {
            secondUpdateCalled = true;
            resolve({ error: null });
          }
        })
      })
    });

    try {
      const req = {
        user: { id: 'parent-1', role: 'parent', schoolSlug: 'ecole_a' },
        body: { push_token: '{"endpoint":"https://push.example.com/device-1"}' }
      };
      let statusCode = 200;
      let jsonResult = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { jsonResult = data; return res; }
      };

      await updatePushToken(req, res);

      assert.strictEqual(statusCode, 500, 'Doit retourner un code 500');
      assert.strictEqual(jsonResult?.error, 'Erreur lors de la mise à jour du token.');
      assert.strictEqual(secondUpdateCalled, false, 'La deuxième mise à jour ne doit JAMAIS être appelée si le dédoublonnage a échoué');

      // Vérification stricte des logs : aucun message dynamique ni objet d'erreur
      assert.strictEqual(loggedErrors.length, 1, 'Exactement un log d’erreur attendu');
      assert.strictEqual(loggedErrors[0].length, 1, 'Un seul argument attendu dans console.error');
      assert.strictEqual(loggedErrors[0][0], 'Echec du dedoublonnage du token Push.', 'Le message doit être le littéral fixe exact');
      assert.strictEqual(typeof loggedErrors[0][0], 'string');
      assert.strictEqual(loggedErrors[0][0].includes('Sensitive'), false);
      assert.strictEqual(loggedErrors[0][0].includes('5432'), false);
    } finally {
      supabase.from = originalFrom;
      console.error = originalConsoleError;
    }
  });

  it('Échec de la requête d’attribution : renvoie une erreur 500 sans fuite de message dynamique', async () => {
    const originalFrom = supabase.from;
    const originalConsoleError = console.error;
    const loggedErrors = [];

    console.error = (...args) => {
      loggedErrors.push(args);
    };

    supabase.from = (table) => ({
      update: (updates) => ({
        eq: (field1, val1) => ({
          neq: (field2, val2) => {
            // Dédoublonnage réussi
            return Promise.resolve({ error: null });
          },
          then: (resolve) => {
            // Attribution échoue
            resolve({ error: new Error('Sensitive DB foreign key error: table profiles_ecole_a') });
          }
        })
      })
    });

    try {
      const req = {
        user: { id: 'parent-1', role: 'parent', schoolSlug: 'ecole_a' },
        body: { push_token: '{"endpoint":"https://push.example.com/device-1"}' }
      };
      let statusCode = 200;
      let jsonResult = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { jsonResult = data; return res; }
      };

      await updatePushToken(req, res);

      assert.strictEqual(statusCode, 500, 'Doit retourner un code 500');
      assert.strictEqual(jsonResult?.error, 'Erreur lors de la mise à jour du token.');

      // Vérification stricte des logs : aucun message dynamique ni objet d'erreur
      assert.strictEqual(loggedErrors.length, 1, 'Exactement un log d’erreur attendu');
      assert.strictEqual(loggedErrors[0].length, 1, 'Un seul argument attendu dans console.error');
      assert.strictEqual(loggedErrors[0][0], 'Echec de la mise a jour du token Push.', 'Le message doit être le littéral fixe exact');
      assert.strictEqual(typeof loggedErrors[0][0], 'string');
      assert.strictEqual(loggedErrors[0][0].includes('Sensitive'), false);
    } finally {
      supabase.from = originalFrom;
      console.error = originalConsoleError;
    }
  });
});
