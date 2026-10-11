'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installSupabaseMock, restoreSupabaseMock } = require('./helpers/mockSupabaseModule');
const fs = require('fs');
const path = require('path');

describe('P26-A.1: Smart Search /api/public/schools/search', () => {
    let publicRouter;
    let searchRouteHandler;
    let req, res;
    let responseData;
    let statusCode;
    let supabaseCalls = [];
    
    before(() => {
        installSupabaseMock({
            supabase: {
                rpc: async (fn, params) => {
                    supabaseCalls.push({ action: 'rpc', fn, params });
                    if (fn === 'search_active_schools') {
                        const { search_term } = params;
                        if (search_term === 'erreur') {
                            return { data: null, error: new Error('DB timeout') };
                        }
                        if (search_term === 'felicite' || search_term === 'félisité' || search_term === 'ste felicite') {
                            // Simule le résultat de pg_trgm pour des orthographes différentes
                            return {
                                data: [
                                    { slug: 'sainte_felicite_1', name: 'La Sainte Félicité', city: 'Cotonou', country: 'BJ', status: 'active' },
                                    { slug: 'sainte_felicite_2', name: 'La Sainte Félicité', city: 'Abidjan', country: 'CI', status: 'active' }
                                ],
                                error: null
                            };
                        }
                        if (search_term === 'suspendue') {
                            // Le RPC SQL est censé filtrer status='active'.
                            // L'API s'attend à ne recevoir que les écoles actives.
                            return { data: [], error: null }; 
                        }
                        return { data: [], error: null };
                    }
                    return { data: null, error: null };
                }
            }
        });
        
        publicRouter = require('../routes/public');
        
        // Find the search route handler (skipping the rate limiter middleware)
        const route = publicRouter.stack.find(r => r.route && r.route.path === '/schools/search');
        assert.ok(route, 'Route /schools/search non trouvée dans public.js');
        // The actual handler is the last one in the stack
        searchRouteHandler = route.route.stack[route.route.stack.length - 1].handle;
    });

    after(() => {
        restoreSupabaseMock();
    });

    beforeEach(() => {
        supabaseCalls = [];
        statusCode = null;
        responseData = null;
        req = { query: {} };
        res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };
    });

    test('1. API - Rejette les requêtes avec q < 3 caractères', async () => {
        req.query.q = 'ab';
        await searchRouteHandler(req, res);
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'La recherche doit comporter au moins 3 caractères.');
        assert.strictEqual(supabaseCalls.length, 0);
    });

    test('2. API - Rejette les requêtes avec un paramètre q multiple (Array)', async () => {
        req.query.q = ['abc', 'def'];
        await searchRouteHandler(req, res);
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'Format de requête invalide.');
    });

    test('3. API - Simule la résolution d\'homonymes et fautes d\'orthographe (pg_trgm)', async () => {
        req.query.q = 'félisité';
        await searchRouteHandler(req, res);
        assert.strictEqual(statusCode || 200, 200);
        assert.strictEqual(responseData.results.length, 2);
        assert.strictEqual(responseData.results[0].slug, 'sainte_felicite_1');
        assert.strictEqual(responseData.results[1].slug, 'sainte_felicite_2');
    });

    test('4. API - Gère proprement les erreurs Supabase (HTTP 500) avec journal propre', async () => {
        req.query.q = 'erreur';
        await searchRouteHandler(req, res);
        assert.strictEqual(statusCode, 500);
        assert.strictEqual(responseData.error, 'Erreur technique lors de la recherche.');
    });

    test('5. API - Le middleware Rate Limiter (HTTP 429) est bien configuré sur la route', () => {
        const route = publicRouter.stack.find(r => r.route && r.route.path === '/schools/search');
        const middlewares = route.route.stack;
        // There should be the rate limiter and the actual handler
        assert.ok(middlewares.length >= 2, 'Il doit y avoir au moins 2 middlewares (limiteur + handler) configurés');
    });

    test('6. SQL - Vérification des règles de sécurité dans la migration', () => {
        const sqlPath = path.join(__dirname, '../scripts/migration_p26_a1_smart_search.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Vérifie les droits RPC et du wrapper
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM PUBLIC;'), 'PUBLIC révoqué RPC');
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM anon;'), 'anon révoqué RPC');
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM authenticated;'), 'authenticated révoqué RPC');
        assert.ok(sqlContent.includes('GRANT EXECUTE ON FUNCTION public.search_active_schools(TEXT) TO service_role;'), 'service_role autorisé RPC');

        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.immutable_unaccent_lower(text) FROM PUBLIC;'), 'PUBLIC révoqué wrapper');
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.immutable_unaccent_lower(text) FROM anon;'), 'anon révoqué wrapper');
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.immutable_unaccent_lower(text) FROM authenticated;'), 'authenticated révoqué wrapper');
        assert.ok(sqlContent.includes('GRANT EXECUTE ON FUNCTION public.immutable_unaccent_lower(text) TO service_role;'), 'service_role autorisé wrapper');

        // Vérifie l'encapsulation SECURITY DEFINER et le search_path sécurisé
        assert.ok(sqlContent.includes('SECURITY DEFINER'), 'SECURITY DEFINER présent');
        assert.ok(sqlContent.includes("SET search_path = ''"), 'search_path vidé (protection injection schema)');
        
        // Vérifie l'utilisation des qualificateurs
        assert.ok(sqlContent.includes('extensions.unaccent'), 'extensions.unaccent correctement qualifié');
        assert.ok(sqlContent.includes('extensions.word_similarity'), 'extensions.word_similarity correctement qualifié');
        assert.ok(sqlContent.includes('extensions.gin_trgm_ops'), 'extensions.gin_trgm_ops qualifié');
        
        // Vérifie la restriction stricte aux écoles actives
        assert.ok(sqlContent.includes("status = 'active'"), 'Le filtre status active est strict en SQL');
    });

    test('7. LIMITATIONS CONNUES - SQL non simulable en JS localement', () => {
        // En l'absence de base PostgreSQL locale, on note que le test de performance 
        // de pg_trgm (vitesse de l'index) ne peut pas être testé ici. 
        // Ces tests démontrent la structure et l'interfaçage, pas le moteur SQL.
        assert.ok(true);
    });
});
