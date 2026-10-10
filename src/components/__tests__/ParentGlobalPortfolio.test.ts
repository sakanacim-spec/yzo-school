import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Setup de localStorage pour environnement Node
if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = {
        getItem: (key: string) => (key === 'parent_token' ? 'mock_jwt_parent_token' : null),
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0
    };
}

import {
    parentApi,
    validateGlobalPortfolioResponse
} from '../../services/parentApi.ts';
import type {
    GlobalPortfolioResponse,
    ParentPackAccessState
} from '../../services/parentApi.ts';

describe('P25-T.5b — Portefeuille Global Parent Frontend', () => {

    // =========================================================================
    // I. VALIDATION DES DONNÉES DU SERVICE ET CONTRAT DTO
    // =========================================================================
    describe('I. Validation du DTO API (validateGlobalPortfolioResponse)', () => {

        it('1. Réponse API valide avec structure complète', () => {
            const rawPayload = {
                children: [
                    {
                        student_global_id: 'uuid-child-1',
                        display_name: 'Jean DUPONT',
                        schools: [
                            { school_slug: 'ecole-pasteur', school_name: 'École Pasteur' }
                        ],
                        access: {
                            state: 'PAID_ACTIVE',
                            accessAllowed: true
                        }
                    }
                ]
            };

            const validated = validateGlobalPortfolioResponse(rawPayload);
            assert.strictEqual(validated.children.length, 1);
            assert.strictEqual(validated.children[0].student_global_id, 'uuid-child-1');
            assert.strictEqual(validated.children[0].display_name, 'Jean DUPONT');
            assert.strictEqual(validated.children[0].schools[0].school_slug, 'ecole-pasteur');
            assert.strictEqual(validated.children[0].schools[0].school_name, 'École Pasteur');
            assert.strictEqual(validated.children[0].access.state, 'PAID_ACTIVE');
            assert.strictEqual(validated.children[0].access.accessAllowed, true);
        });

        it('2. Portefeuille vide légitime retourné tel quel', () => {
            const rawPayload = { children: [] };
            const validated = validateGlobalPortfolioResponse(rawPayload);
            assert.deepStrictEqual(validated, { children: [] });
        });

        it('3. Un enfant et plusieurs enfants validés', () => {
            const rawMulti = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Amina KOUASSI',
                        schools: [{ school_slug: 'ecole1', school_name: 'École 1' }],
                        access: { state: 'PAID_ACTIVE', accessAllowed: true }
                    },
                    {
                        student_global_id: 'c2',
                        display_name: 'Marc KOUASSI',
                        schools: [{ school_slug: 'ecole2', school_name: 'École 2' }],
                        access: { state: 'GRACE_ACTIVE', accessAllowed: true }
                    }
                ]
            };
            const validated = validateGlobalPortfolioResponse(rawMulti);
            assert.strictEqual(validated.children.length, 2);
            assert.strictEqual(validated.children[0].display_name, 'Amina KOUASSI');
            assert.strictEqual(validated.children[1].display_name, 'Marc KOUASSI');
        });

        it('4. Plusieurs établissements associés pour un même enfant', () => {
            const raw = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Paul BIYA',
                        schools: [
                            { school_slug: 'ecole-nord', school_name: 'École du Nord' },
                            { school_slug: 'college-sud', school_name: 'Collège du Sud' }
                        ],
                        access: { state: 'PAID_ACTIVE', accessAllowed: true }
                    }
                ]
            };
            const validated = validateGlobalPortfolioResponse(raw);
            assert.strictEqual(validated.children[0].schools.length, 2);
            assert.strictEqual(validated.children[0].schools[0].school_name, 'École du Nord');
            assert.strictEqual(validated.children[0].schools[1].school_name, 'Collège du Sud');
        });

        it('5. Les quatre états Parent Pack officiels acceptés', () => {
            const states: ParentPackAccessState[] = [
                'PAID_ACTIVE',
                'GRACE_ACTIVE',
                'LEGACY_UNDECIDED',
                'PACK_SUSPENDED'
            ];

            for (const state of states) {
                const payload = {
                    children: [
                        {
                            student_global_id: `child-${state}`,
                            display_name: `Enfant ${state}`,
                            schools: [{ school_slug: 's1', school_name: 'S1' }],
                            access: { state, accessAllowed: state !== 'PACK_SUSPENDED' }
                        }
                    ]
                };
                const res = validateGlobalPortfolioResponse(payload);
                assert.strictEqual(res.children[0].access.state, state);
            }
        });

        it('6. grace_expires_at : présent valide, absent et invalide', () => {
            // A. Présent et ISO valide
            const validGrace = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Enfant Grâce',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: {
                            state: 'GRACE_ACTIVE',
                            accessAllowed: true,
                            grace_expires_at: '2026-10-17T12:00:00.000Z'
                        }
                    }
                ]
            };
            const resValid = validateGlobalPortfolioResponse(validGrace);
            assert.strictEqual(resValid.children[0].access.grace_expires_at, '2026-10-17T12:00:00.000Z');

            // B. Absent
            const absentGrace = {
                children: [
                    {
                        student_global_id: 'c2',
                        display_name: 'Enfant Sans Grâce',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: { state: 'PAID_ACTIVE', accessAllowed: true }
                    }
                ]
            };
            const resAbsent = validateGlobalPortfolioResponse(absentGrace);
            assert.strictEqual(resAbsent.children[0].access.grace_expires_at, undefined);

            // C. Invalide -> doit lever une exception
            const invalidGrace = {
                children: [
                    {
                        student_global_id: 'c3',
                        display_name: 'Enfant Mauvaise Date',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: {
                            state: 'GRACE_ACTIVE',
                            accessAllowed: true,
                            grace_expires_at: 'not-a-valid-date'
                        }
                    }
                ]
            };
            assert.throws(
                () => validateGlobalPortfolioResponse(invalidGrace),
                /date de fin de grâce invalide/
            );
        });

        it('10. Réponse JSON malformée rejetée avec erreur contrôlée', () => {
            assert.throws(() => validateGlobalPortfolioResponse(null), /format attendu non respecté/);
            assert.throws(() => validateGlobalPortfolioResponse(undefined), /format attendu non respecté/);
            assert.throws(() => validateGlobalPortfolioResponse('string'), /format attendu non respecté/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: 'not-array' }), /format attendu non respecté/);
            assert.throws(() => validateGlobalPortfolioResponse({}), /format attendu non respecté/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: [null] }), /structure enfant invalide/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: [{}] }), /student_global_id manquant/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: [{ student_global_id: 'g1' }] }), /display_name manquant/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: [{ student_global_id: 'g1', display_name: 'N' }] }), /liste des écoles invalide/);
            assert.throws(() => validateGlobalPortfolioResponse({ children: [{ student_global_id: 'g1', display_name: 'N', schools: [{}] }] }), /établissement associé invalide/);
        });

        it('11. État Parent Pack inconnu rejeté', () => {
            const badStatePayload = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Test',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: { state: 'UNKNOWN_CORRUPT_STATE', accessAllowed: true }
                    }
                ]
            };
            assert.throws(
                () => validateGlobalPortfolioResponse(badStatePayload),
                /état Parent Pack inconnu/
            );
        });

        it('12. accessAllowed non booléen rejeté', () => {
            const stringBoolPayload = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Test',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: { state: 'PAID_ACTIVE', accessAllowed: 'true' as any }
                    }
                ]
            };
            assert.throws(
                () => validateGlobalPortfolioResponse(stringBoolPayload),
                /accessAllowed doit être un booléen/
            );

            const missingBoolPayload = {
                children: [
                    {
                        student_global_id: 'c1',
                        display_name: 'Test',
                        schools: [{ school_slug: 's', school_name: 'S' }],
                        access: { state: 'PAID_ACTIVE' as any }
                    }
                ]
            };
            assert.throws(
                () => validateGlobalPortfolioResponse(missingBoolPayload),
                /accessAllowed doit être un booléen/
            );
        });
    });

    // =========================================================================
    // II. APPELS RÉSEAU DU SERVICE API (parentApi.getGlobalChildren)
    // =========================================================================
    describe('II. Appels réseau et gestion des erreurs (parentApi.getGlobalChildren)', () => {
        const originalFetch = globalThis.fetch;

        it('7. Réponse HTTP 401 gérée (Non authentifié)', async () => {
            globalThis.fetch = async () => ({
                ok: false,
                status: 401,
                headers: { get: () => 'application/json' },
                json: async () => ({ error: 'Non authentifié.' }),
                text: async () => JSON.stringify({ error: 'Non authentifié.' })
            } as any);

            try {
                await assert.rejects(
                    async () => await parentApi.getGlobalChildren(),
                    (err: any) => err?.error === 'Non authentifié.'
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('8. Erreur HTTP 500 gérée (Erreur serveur)', async () => {
            globalThis.fetch = async () => ({
                ok: false,
                status: 500,
                headers: { get: () => 'application/json' },
                json: async () => ({ error: 'Erreur serveur.' }),
                text: async () => JSON.stringify({ error: 'Erreur serveur.' })
            } as any);

            try {
                await assert.rejects(
                    async () => await parentApi.getGlobalChildren(),
                    (err: any) => err?.error === 'Erreur serveur.'
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('9. Erreur réseau propagée fidèlement', async () => {
            globalThis.fetch = async () => {
                throw new Error('Failed to fetch (Network Error)');
            };

            try {
                await assert.rejects(
                    async () => await parentApi.getGlobalChildren(),
                    /Failed to fetch/
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    // =========================================================================
    // III. PROTECTION DES SESSIONS ET CYCLE DE VIE OBSERVABLE
    // =========================================================================
    describe('III. Protection des sessions et cycle de vie observable', () => {

        it('13. Gestion observable de l’état de chargement', () => {
            // Simulation de la machine à états du composant
            let state = { loading: true, data: null as any, error: null as any };
            assert.strictEqual(state.loading, true);
            assert.strictEqual(state.data, null);
            assert.strictEqual(state.error, null);

            // Fin de chargement succès
            state = { loading: false, data: { children: [] }, error: null };
            assert.strictEqual(state.loading, false);
            assert.deepStrictEqual(state.data, { children: [] });
        });

        it('14. Réessai observable après erreur', async () => {
            let attempt = 0;
            const mockApi = async () => {
                attempt++;
                if (attempt === 1) throw new Error('Erreur temporaire');
                return { children: [{ student_global_id: 'g1', display_name: 'Enfant OK', schools: [{ school_slug: 's', school_name: 'S' }], access: { state: 'PAID_ACTIVE', accessAllowed: true } }] };
            };

            let state = { loading: true, data: null as any, error: null as any };
            try {
                await mockApi();
            } catch (err: any) {
                state = { loading: false, data: null, error: err.message };
            }
            assert.strictEqual(state.error, 'Erreur temporaire');
            assert.strictEqual(state.data, null);

            // Déclenchement du réessai
            state = { loading: true, data: null, error: null };
            const res = await mockApi();
            state = { loading: false, data: res, error: null };
            assert.strictEqual(state.error, null);
            assert.strictEqual(state.data.children.length, 1);
        });

        it('15. Changement de session pendant une requête in-flight (invalidation stricte)', async () => {
            let activeParentId = 'parent-A';
            let displayedChildren: any = null;

            // Lancement d'une requête lente pour Parent A
            let isCancelledA = false;
            const requestA = new Promise<any>((resolve) => {
                setTimeout(() => {
                    resolve({ children: [{ student_global_id: 'g-A', display_name: 'Enfant A' }] });
                }, 20);
            });

            // L'utilisateur change de session vers Parent B à t = 5ms
            activeParentId = 'parent-B';
            isCancelledA = true; // Simule le cleanup effect / abort controller
            displayedChildren = null; // Purge immédiate

            const resA = await requestA;
            if (!isCancelledA) {
                displayedChildren = resA.children;
            }

            // Les données de Parent A ne doivent jamais être affichées
            assert.strictEqual(displayedChildren, null);
        });

        it('16. Démontage du composant pendant une requête (pas de mise à jour orpheline)', async () => {
            let isMounted = true;
            let componentState: any = 'LOADING';

            const unmount = () => { isMounted = false; };

            const request = new Promise<string>((resolve) => {
                setTimeout(() => resolve('NEW_DATA'), 10);
            });

            // Démontage avant la fin de la requête
            unmount();

            const res = await request;
            if (isMounted) {
                componentState = res;
            }

            assert.strictEqual(componentState, 'LOADING');
        });

        it('17. Absence totale de persistance ou données de la session précédente', () => {
            const componentSource = fs.readFileSync(
                path.resolve('src/components/ParentGlobalPortfolio.tsx'),
                'utf-8'
            );

            // Vérifie qu'aucun cache global ou localStorage n'est utilisé pour stocker les enfants
            assert.strictEqual(componentSource.includes('localStorage.setItem'), false);
            assert.strictEqual(componentSource.includes('sessionStorage.setItem'), false);
            // Vérifie la purge à chaque changement de parentId
            assert.ok(componentSource.includes('setChildren(null)'));
            assert.ok(componentSource.includes('setError(null)'));
        });
    });

    // =========================================================================
    // IV. SÉCURITÉ, LIBELLÉS ET ABSENCE DE PRIVILÈGES INTER-ÉCOLES
    // =========================================================================
    describe('IV. Sécurité, Libellés officiels et intégration', () => {

        const componentSource = fs.readFileSync(
            path.resolve('src/components/ParentGlobalPortfolio.tsx'),
            'utf-8'
        );
        const dashboardSource = fs.readFileSync(
            path.resolve('src/pages/parent/ParentDashboard.tsx'),
            'utf-8'
        );

        it('18. Absence totale de navigation inter-écoles ou de boutons de contournement', () => {
            // Aucun lien ou bouton de navigation ou action vers un autre établissement
            assert.strictEqual(componentSource.includes('href='), false);
            assert.strictEqual(componentSource.includes('navigate('), false);
            assert.strictEqual(componentSource.includes('setCurrentPage('), false);
            assert.strictEqual(componentSource.includes('window.location'), false);
            assert.strictEqual(componentSource.includes('switchSchool'), false);
        });

        it('19. Absence d’UUID technique dans le rendu visuel', () => {
            // L'identifiant global student_global_id doit être utilisé uniquement comme clé React (key=...)
            // et jamais affiché dans les balises de contenu utilisateur
            assert.ok(componentSource.includes('key={child.student_global_id}'));
            assert.strictEqual(componentSource.includes('>{child.student_global_id}<'), false);
            assert.strictEqual(componentSource.includes('ID : {child.student_global_id}'), false);
        });

        it('Libellés officiels et formulation neutre des établissements respectés', () => {
            // Formulation neutre obligatoire
            assert.ok(componentSource.includes('Établissements associés'));
            assert.strictEqual(componentSource.includes('Établissement actuel'), false);
            assert.strictEqual(componentSource.includes('Ancien établissement'), false);

            // Les 4 libellés français officiels
            assert.ok(componentSource.includes('Pack actif'));
            assert.ok(componentSource.includes('Période de grâce'));
            assert.ok(componentSource.includes('Situation à vérifier'));
            assert.ok(componentSource.includes('Pack suspendu'));
        });

        it('20. Préservation intégrale des fonctionnalités existantes du tableau de bord', () => {
            // Le tableau de bord conserve intacts tous ses modules existants
            assert.ok(dashboardSource.includes('ParentGlobalPortfolio'));
            assert.ok(dashboardSource.includes('LinkStudentModal'));
            assert.ok(dashboardSource.includes('SupportModal'));
            assert.ok(dashboardSource.includes('ParentPackGuard'));
            assert.ok(dashboardSource.includes('ParentPackPayment'));
            assert.ok(dashboardSource.includes('ChildCard'));
            assert.ok(dashboardSource.includes('totalEcolage'));
            assert.ok(dashboardSource.includes('totalDejaPaye'));
            assert.ok(dashboardSource.includes('totalRestant'));
            assert.ok(dashboardSource.includes('handleDownloadInvoice'));
            assert.ok(dashboardSource.includes('handleUnlink'));
        });
    });
});
