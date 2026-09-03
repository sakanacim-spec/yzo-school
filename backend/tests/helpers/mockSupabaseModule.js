// backend/tests/helpers/mockSupabaseModule.js
'use strict';

const { Module } = require('node:module');
const path = require('node:path');

const supabasePath = path.resolve(__dirname, '../../utils/supabase.js');

/**
 * Crée un client Supabase factice et hermétique qui échoue explicitement
 * si une méthode est invoquée sans avoir été mockée par la suite de test.
 */
function createFailFastClient(label = 'supabase') {
    return {
        from(tableName) {
            throw new Error(`UNEXPECTED_SUPABASE_CALL: ${label}.from("${tableName}") called without explicit test mock.`);
        },
        rpc(fnName, params) {
            throw new Error(`UNEXPECTED_SUPABASE_CALL: ${label}.rpc("${fnName}") called without explicit test mock.`);
        },
        auth: {
            getUser() {
                throw new Error(`UNEXPECTED_SUPABASE_CALL: ${label}.auth.getUser called without explicit test mock.`);
            }
        },
        storage: {
            from(bucketName) {
                throw new Error(`UNEXPECTED_SUPABASE_CALL: ${label}.storage.from("${bucketName}") called without explicit test mock.`);
            }
        }
    };
}

let originalCacheEntry = undefined;
let isInstalled = false;

/**
 * Installe un faux module Supabase dans require.cache pour empêcher
 * l'évaluation de backend/utils/supabase.js et l'exigence de variables d'environnement.
 */
function installSupabaseMock(customExports = {}) {
    if (!isInstalled) {
        originalCacheEntry = require.cache[supabasePath];
        isInstalled = true;
    }

    const defaultClient = createFailFastClient('supabase');
    const defaultAdminClient = createFailFastClient('supabaseAdmin');

    const exportsObj = {
        supabase: customExports.supabase || defaultClient,
        supabaseAdmin: customExports.supabaseAdmin || defaultAdminClient,
        ...customExports
    };

    const mockModule = new Module(supabasePath);
    mockModule.id = supabasePath;
    mockModule.filename = supabasePath;
    mockModule.loaded = true;
    mockModule.exports = exportsObj;

    require.cache[supabasePath] = mockModule;

    return exportsObj;
}

/**
 * Restaure de façon idempotente l'entrée de cache initiale.
 */
function restoreSupabaseMock() {
    if (!isInstalled) return;

    if (originalCacheEntry) {
        require.cache[supabasePath] = originalCacheEntry;
    } else {
        delete require.cache[supabasePath];
    }

    isInstalled = false;
    originalCacheEntry = undefined;
}

module.exports = {
    installSupabaseMock,
    restoreSupabaseMock,
    createFailFastClient,
    supabasePath
};
