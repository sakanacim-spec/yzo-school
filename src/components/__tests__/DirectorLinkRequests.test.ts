import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  directorApi,
  DirectorApiError,
} from '../../services/directorApi.ts';

describe('Lot 3B - Interface d\'Approbation Directeur (P26-B)', () => {
  const componentPath = path.resolve(process.cwd(), 'src/components/DirectorLinkRequests.tsx');
  const servicePath = path.resolve(process.cwd(), 'src/services/directorApi.ts');
  const parentsListPath = path.resolve(process.cwd(), 'src/pages/ParentsList.tsx');

  const componentSource = fs.readFileSync(componentPath, 'utf8');
  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const parentsListSource = fs.readFileSync(parentsListPath, 'utf8');

  describe('1. Service directorApi — Contrats d\'API et Gestion d\'erreurs', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('1.1. listRequests effectue un appel GET avec pagination et auth headers', async () => {
      let calledUrl = '';
      let calledMethod = '';
      let calledHeaders: any = {};

      globalThis.fetch = (async (url: any, opts: any) => {
        calledUrl = String(url);
        calledMethod = opts?.method;
        calledHeaders = opts?.headers;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            total: 1,
            page: 1,
            limit: 20,
            requests: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                school_slug: 'ecole_test',
                status: 'pending',
                requested_at: '2026-10-14T10:00:00Z',
                student_name: 'Élève A',
                parent_name: 'Parent B',
              },
            ],
          }),
        } as Response;
      }) as any;

      const res = await directorApi.listRequests(1, 20);
      assert.strictEqual(calledMethod, 'GET');
      assert.ok(calledUrl.includes('/director/requests?page=1&limit=20'));
      assert.strictEqual(res.total, 1);
      assert.strictEqual(res.requests.length, 1);
      assert.strictEqual(res.requests[0].student_name, 'Élève A');
    });

    it('1.2. approveRequest envoie un POST /api/director/requests/:id/approve', async () => {
      let calledUrl = '';
      let calledMethod = '';

      globalThis.fetch = (async (url: any, opts: any) => {
        calledUrl = String(url);
        calledMethod = opts?.method;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            status: 'approved',
            request_id: '11111111-1111-4111-8111-111111111111',
          }),
        } as Response;
      }) as any;

      const res = await directorApi.approveRequest('11111111-1111-4111-8111-111111111111');
      assert.strictEqual(calledMethod, 'POST');
      assert.ok(calledUrl.endsWith('/director/requests/11111111-1111-4111-8111-111111111111/approve'));
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'approved');
    });

    it('1.3. rejectRequest valide que le motif est obligatoire avant l\'appel réseau', async () => {
      let networkCalled = false;
      globalThis.fetch = (async () => {
        networkCalled = true;
        return { ok: true, status: 200, text: async () => '{}' } as Response;
      }) as any;

      await assert.rejects(
        async () => {
          await directorApi.rejectRequest('11111111-1111-4111-8111-111111111111', '   ');
        },
        (err: any) => {
          assert.strictEqual(err.name, 'DirectorApiError');
          assert.strictEqual(err.code, 'REJECTION_REASON_REQUIRED');
          assert.strictEqual(err.status, 400);
          return true;
        }
      );

      assert.strictEqual(networkCalled, false, 'Le réseau ne doit pas être sollicité si le motif est vide');
    });

    it('1.4. rejectRequest envoie un POST avec rejection_reason et rejection_reason_code', async () => {
      let sentBody: any = null;
      let calledUrl = '';

      globalThis.fetch = (async (url: any, opts: any) => {
        calledUrl = String(url);
        sentBody = JSON.parse(opts?.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            status: 'rejected',
            request_id: '11111111-1111-4111-8111-111111111111',
          }),
        } as Response;
      }) as any;

      const res = await directorApi.rejectRequest(
        '11111111-1111-4111-8111-111111111111',
        'Informations non concordantes',
        'IDENTITY_MISMATCH'
      );

      assert.ok(calledUrl.endsWith('/director/requests/11111111-1111-4111-8111-111111111111/reject'));
      assert.strictEqual(sentBody.rejection_reason, 'Informations non concordantes');
      assert.strictEqual(sentBody.rejection_reason_code, 'IDENTITY_MISMATCH');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'rejected');
    });

    it('1.5. Gestion d\'une demande déjà traitée (conflit 409 INVALID_STATUS_TRANSITION)', async () => {
      globalThis.fetch = (async () => {
        return {
          ok: false,
          status: 409,
          text: async () => JSON.stringify({
            error: 'INVALID_STATUS_TRANSITION',
            current_status: 'approved',
          }),
        } as Response;
      }) as any;

      await assert.rejects(
        async () => {
          await directorApi.approveRequest('11111111-1111-4111-8111-111111111111');
        },
        (err: any) => {
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.code, 'INVALID_STATUS_TRANSITION');
          assert.strictEqual(err.current_status, 'approved');
          assert.ok(err.message.includes('déjà été traitée'));
          return true;
        }
      );
    });

    it('1.6. Gestion d\'un refus d\'autorisation (403 Permission refusée)', async () => {
      globalThis.fetch = (async () => {
        return {
          ok: false,
          status: 403,
          text: async () => JSON.stringify({
            error: 'Permission refusée. Rôle insuffisant.',
          }),
        } as Response;
      }) as any;

      await assert.rejects(
        async () => {
          await directorApi.listRequests();
        },
        (err: any) => {
          assert.strictEqual(err.status, 403);
          assert.ok(err.message.includes('Accès refusé'));
          return true;
        }
      );
    });

    it('1.7. Gestion d\'une panne réseau (Network Error)', async () => {
      globalThis.fetch = (async () => {
        throw new Error('Failed to fetch');
      }) as any;

      await assert.rejects(
        async () => {
          await directorApi.listRequests();
        },
        (err: any) => {
          assert.strictEqual(err.message, 'Failed to fetch');
          return true;
        }
      );
    });
  });

  describe('2. Composant DirectorLinkRequests — Règles de sécurité et Comportement UI', () => {
    it('2.1. Contrôle d\'accès : seuls admin, directeur et directeur_general sont autorisés', () => {
      assert.ok(
        componentSource.includes("const ALLOWED_ROLES = ['admin', 'directeur', 'directeur_general']"),
        'La liste blanche des rôles autorisés doit exclure strictement comptable et les rôles non directoriaux'
      );
      assert.ok(
        componentSource.includes("if (!isAuthorized)"),
        'Un écran de blocage doit être rendu si l\'utilisateur n\'a pas un rôle autorisé'
      );
      assert.ok(
        componentSource.includes('Accès restreint'),
        'Le message d\'accès restreint doit être présent'
      );
    });

    it('2.2. Protection anti double-clic et double soumission', () => {
      assert.ok(
        componentSource.includes('const [actionInProgressId, setActionInProgressId] = useState'),
        'Doit maintenir un verrou de requête en cours par identifiant de demande'
      );
      assert.ok(
        componentSource.includes('if (!approvingRequest || actionInProgressId) return;'),
        'Doit ignorer les clics d\'approbation redondants si une action est déjà en cours'
      );
      assert.ok(
        componentSource.includes('if (!rejectingRequest || actionInProgressId) return;'),
        'Doit ignorer les clics de rejet redondants si une action est déjà en cours'
      );
      assert.ok(
        componentSource.includes('disabled={isProcessing || !!actionInProgressId}'),
        'Les boutons d\'action unitaire doivent être désactivés pendant une opération'
      );
    });

    it('2.3. Rejet avec motif obligatoire', () => {
      assert.ok(
        componentSource.includes('const trimmedReason = rejectionReason.trim();'),
        'Le motif doit être nettoyé des espaces blancs superflus'
      );
      assert.ok(
        componentSource.includes("if (!trimmedReason)"),
        'Doit bloquer l\'envoi si le motif est vide'
      );
      assert.ok(
        componentSource.includes('disabled={!rejectionReason.trim() || !!actionInProgressId}'),
        'Le bouton de confirmation de rejet doit être désactivé si le motif est vide'
      );
      assert.ok(
        componentSource.includes('Le motif de rejet est obligatoire'),
        'Un message d\'erreur de validation doit être fourni à l\'utilisateur'
      );
    });

    it('2.4. Gestion des conflits 409 et rafraîchissement automatique', () => {
      assert.ok(
        componentSource.includes('if (err.status === 409)'),
        'Doit intercepter spécifiquement les statuts 409 de transition invalide'
      );
      assert.ok(
        componentSource.includes('await fetchRequests(true);'),
        'Doit déclencher le rafraîchissement de la liste après une action ou un conflit 409'
      );
    });

    it('2.5. Affichage des statuts de demande (pending, approved, rejected)', () => {
      assert.ok(componentSource.includes("'approved'"), 'Doit gérer le statut approved');
      assert.ok(componentSource.includes("'rejected'"), 'Doit gérer le statut rejected');
      assert.ok(componentSource.includes("'pending'"), 'Doit gérer le statut pending');
      assert.ok(componentSource.includes("Approuvée"), 'Libellé visuel pour approved');
      assert.ok(componentSource.includes("Rejetée"), 'Libellé visuel pour rejected');
      assert.ok(componentSource.includes("En attente"), 'Libellé visuel pour pending');
    });

    it('2.6. Présentation des données utiles parent et élève', () => {
      assert.ok(componentSource.includes('req.parent_name'), 'Doit afficher le nom du parent');
      assert.ok(componentSource.includes('req.student_name'), 'Doit afficher le nom de l\'élève');
      assert.ok(componentSource.includes('req.requested_at'), 'Doit afficher la date de la demande');
    });
  });

  describe('3. Intégration dans ParentsList.tsx', () => {
    it('3.1. Navigation par onglets entre Comptes Parents et Demandes de rattachement', () => {
      assert.ok(parentsListSource.includes('DirectorLinkRequests'), 'Doit importer et inclure DirectorLinkRequests');
      assert.ok(parentsListSource.includes('activeTab'), 'Doit gérer un onglet actif');
      assert.ok(parentsListSource.includes('link_requests'), 'Doit déclarer l\'onglet link_requests');
      assert.ok(parentsListSource.includes('Comptes Parents'), 'Doit proposer l\'onglet Comptes Parents');
      assert.ok(parentsListSource.includes('Demandes de rattachement'), 'Doit proposer l\'onglet Demandes de rattachement');
    });

    it('3.2. L\'onglet Demandes de rattachement est restreint aux rôles autorisés', () => {
      assert.ok(
        parentsListSource.includes("const ALLOWED_DIRECTOR_ROLES = ['admin', 'directeur', 'directeur_general']"),
        'Les rôles autorisés sont définis et n\'incluent pas comptable'
      );
      assert.ok(
        parentsListSource.includes('canManageLinkRequests'),
        'Doit conditionner l\'accès et l\'affichage de l\'onglet aux directeurs/admins'
      );
    });

    it('3.3. Badge dynamique de compteur de demandes en attente', () => {
      assert.ok(
        parentsListSource.includes('pendingRequestsCount'),
        'Doit maintenir un compteur de demandes en attente'
      );
      assert.ok(
        parentsListSource.includes('onCountChange={setPendingRequestsCount}'),
        'Doit connecter la notification de compteur entre composant et page parente'
      );
    });
  });
});
