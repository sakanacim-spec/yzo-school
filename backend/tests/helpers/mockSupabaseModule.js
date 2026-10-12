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
    // Ensure insert mocks support maybeSingle (alias to single) and support .select chains
    if (exportsObj.supabase && typeof exportsObj.supabase.from === 'function') {
        const originalFrom = exportsObj.supabase.from;
        exportsObj.supabase.from = (table) => {
            const query = originalFrom(table);
            // Wrap .select to provide maybeSingle and single that resolve to empty data
            if (query && typeof query.select === 'function') {
                const originalSelect = query.select;
                query.select = (...args) => {
                    const selResult = originalSelect(...args);
                    const wrapper = {
                        maybeSingle: () => Promise.resolve({ data: null, error: null }),
                        single: () => Promise.resolve({ data: null, error: null })
                    };
                    Object.assign(wrapper, selResult);
                    return wrapper;
                };
            }
            // Enhance .insert to alias maybeSingle and provide .select with maybeSingle/single
            if (query && typeof query.insert === 'function') {
                const originalInsert = query.insert;
                query.insert = (data) => {
                    const result = originalInsert(data);
                    if (result && typeof result.single === 'function' && typeof result.maybeSingle !== 'function') {
                        result.maybeSingle = result.single;
                    }
                    if (result && typeof result.select === 'undefined') {
                        result.select = () => ({
                            maybeSingle: () => Promise.resolve({ data: null, error: null }),
                            single: () => Promise.resolve({ data: null, error: null })
                        });
                    }
                    return result;
                };
            }
            return query;
        };
    }

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
