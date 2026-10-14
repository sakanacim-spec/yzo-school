import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parentApi } from '../../services/parentApi.ts';

describe('Lot 3C — Suivi des Demandes de Rattachement Parent-Élève', () => {
    const componentPath = path.resolve(process.cwd(), 'src/components/ParentLinkRequests.tsx');
    const modalPath = path.resolve(process.cwd(), 'src/components/LinkStudentModal.tsx');
    const linkPath = path.resolve(process.cwd(), 'src/components/LinkStudent.tsx');
    const dashboardPath = path.resolve(process.cwd(), 'src/pages/parent/ParentDashboard.tsx');

    const componentSource = fs.readFileSync(componentPath, 'utf8');
    const modalSource = fs.readFileSync(modalPath, 'utf8');
    const linkSource = fs.readFileSync(linkPath, 'utf8');
    const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');

    describe('1. Service parentApi.getLinkRequests', () => {
        const originalFetch = globalThis.fetch;

        beforeEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('1.1. Appel GET /api/parent/link-requests avec query params page et limit', async () => {
            let calledUrl = '';
            let calledHeaders: any = {};

            globalThis.fetch = (async (url: any, opts: any) => {
                calledUrl = String(url);
                calledHeaders = opts?.headers;
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        total: 2,
                        page: 1,
                        limit: 10,
                        requests: [
                            {
                                id: 'req-1',
                                school_slug: 'ecole_a',
                                school_name: 'École Sainte-Marie',
                                student_name: 'Jean Dupont',
                                student_class: 'CM2',
                                status: 'pending',
                                requested_at: '2026-10-14T10:00:00Z',
                                decided_at: null,
                                rejection_reason: null,
                                rejection_reason_code: null
                            },
                            {
                                id: 'req-2',
                                school_slug: 'ecole_b',
                                school_name: 'Collège de l\'Avenir',
                                student_name: 'Marie Dupont',
                                student_class: '6ème',
                                status: 'rejected',
                                requested_at: '2026-10-14T08:00:00Z',
                                decided_at: '2026-10-14T09:00:00Z',
                                rejection_reason: 'Informations non concordantes',
                                rejection_reason_code: 'IDENTITY_MISMATCH'
                            }
                        ]
                    })
                } as Response;
            }) as any;

            const res = await parentApi.getLinkRequests(1, 10);
            assert.ok(calledUrl.includes('/parent/link-requests?page=1&limit=10'));
            assert.strictEqual(res.total, 2);
            assert.strictEqual(res.requests.length, 2);
            assert.strictEqual(res.requests[0].student_name, 'Jean Dupont');
            assert.strictEqual(res.requests[0].school_name, 'École Sainte-Marie');
            assert.strictEqual(res.requests[1].status, 'rejected');
            assert.strictEqual(res.requests[1].rejection_reason, 'Informations non concordantes');
        });

        it('1.2. Gestion des erreurs HTTP (401 non authentifié, 500 serveur)', async () => {
            globalThis.fetch = (async () => {
                return {
                    ok: false,
                    status: 401,
                    text: async () => JSON.stringify({ error: 'Session expirée ou invalide.' })
                } as Response;
            }) as any;

            await assert.rejects(
                async () => {
                    await parentApi.getLinkRequests();
                },
                (err: any) => {
                    assert.strictEqual(err.error, 'Session expirée ou invalide.');
                    return true;
                }
            );
        });

        it('1.3. Gestion de panne réseau', async () => {
            globalThis.fetch = (async () => {
                throw new Error('Network failure');
            }) as any;

            await assert.rejects(
                async () => {
                    await parentApi.getLinkRequests();
                },
                (err: any) => {
                    assert.strictEqual(err.message, 'Network failure');
                    return true;
                }
            );
        });
    });

    describe('2. Composant ParentLinkRequests — Affichage et règles métier', () => {
        it('2.1. Vérifie le rôle parent avant tout rendu (fail-closed pour autres rôles)', () => {
            assert.ok(
                componentSource.includes("const isParent = user?.role === 'parent';"),
                'Doit vérifier si l\'utilisateur est un parent'
            );
            assert.ok(
                componentSource.includes('if (!isParent)'),
                'Doit retourner null si non parent'
            );
        });

        it('2.2. Affiche les métadonnées utiles (élève, classe, école, date)', () => {
            assert.ok(componentSource.includes('req.student_name'), 'Affiche le nom de l\'élève');
            assert.ok(componentSource.includes('req.student_class'), 'Affiche la classe de l\'élève');
            assert.ok(componentSource.includes('req.school_name || req.school_slug'), 'Affiche le nom de l\'établissement');
            assert.ok(componentSource.includes('req.requested_at'), 'Affiche la date de demande');
        });

        it('2.3. Gestion des statuts et motifs de rejet conditionnels', () => {
            assert.ok(componentSource.includes("req.status === 'approved'"), 'Gère le statut approved');
            assert.ok(componentSource.includes("req.status === 'rejected'"), 'Gère le statut rejected');
            assert.ok(componentSource.includes("req.status === 'pending'"), 'Gère le statut pending');
            assert.ok(componentSource.includes("req.status === 'pending_verification'"), 'Gère le statut pending_verification');
            assert.ok(componentSource.includes("req.status === 'revoked'"), 'Gère le statut revoked');
            assert.ok(
                componentSource.includes('isRejected && req.rejection_reason'),
                'Le motif de rejet ne s\'affiche QUE pour les demandes rejected avec motif non vide'
            );
        });

        it('2.4. Présence de l\'actualisation manuelle', () => {
            assert.ok(
                componentSource.includes('onClick={() => fetchRequests(false)}'),
                'Doit comporter un bouton d\'actualisation'
            );
            assert.ok(componentSource.includes('RefreshCw'), 'Icône RefreshCw pour l\'actualisation');
        });

        it('2.5. Absence de bouton de recyclage automatique de demande rejetée', () => {
            assert.ok(
                !componentSource.includes('recycleRequest'),
                'Aucune réutilisation d\'ancienne demande'
            );
            assert.ok(
                !componentSource.includes('reapplyRequest'),
                'Aucun bypass des contrôles de soumission'
            );
        });
    });

    describe('3. Messages de rattachement dans LinkStudentModal et LinkStudent', () => {
        it('3.1. Message HTTP 202 pending conforme à la spécification', () => {
            const expectedPendingMsg = "Votre demande de rattachement a été transmise à la direction de l'établissement pour validation.";
            assert.ok(
                modalSource.includes(expectedPendingMsg),
                'LinkStudentModal doit afficher le message exact pour status: pending'
            );
            assert.ok(
                linkSource.includes(expectedPendingMsg),
                'LinkStudent doit afficher le message exact pour status: pending'
            );
        });

        it('3.2. Message pending_verification conforme', () => {
            const expectedVerificationMsg = "Une demande de rattachement est déjà en cours de vérification.";
            assert.ok(
                modalSource.includes(expectedVerificationMsg),
                'LinkStudentModal doit afficher le message exact pour pending_verification'
            );
            assert.ok(
                linkSource.includes(expectedVerificationMsg),
                'LinkStudent doit afficher le message exact pour pending_verification'
            );
        });

        it('3.3. Message already_linked conforme', () => {
            const expectedAlreadyLinkedMsg = "Cet enfant est déjà rattaché à votre compte.";
            assert.ok(
                modalSource.includes(expectedAlreadyLinkedMsg),
                'LinkStudentModal doit afficher le message exact pour already_linked'
            );
            assert.ok(
                linkSource.includes(expectedAlreadyLinkedMsg),
                'LinkStudent doit afficher le message exact pour already_linked'
            );
        });
    });

    describe('4. Intégration ParentDashboard et absence d\'ajout prématuré', () => {
        it('4.1. ParentDashboard intègre ParentLinkRequests', () => {
            assert.ok(
                dashboardSource.includes('ParentLinkRequests'),
                'ParentDashboard doit importer et inclure ParentLinkRequests'
            );
            assert.ok(
                dashboardSource.includes('<ParentLinkRequests'),
                'ParentDashboard doit instancier le composant'
            );
        });

        it('4.2. Modal onSuccess rafraîchit les demandes de suivi sans ajouter d\'élève local non approuvé', () => {
            assert.ok(
                dashboardSource.includes('setLinkRequestsRefreshKey'),
                'onSuccess doit déclencher le rafraîchissement des demandes de rattachement'
            );
        });
    });
});
