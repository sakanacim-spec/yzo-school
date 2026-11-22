// src/pages/__tests__/demandesRattachement.test.ts
// Tests unitaires de la validation Director pour le rattachement Parent–Enfant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Validation des demandes de rattachement dans l\'espace Directeur (Mission 2 & 3)', () => {
  const pagePath = path.resolve('src/pages/DemandesRattachement.tsx');
  const apiPath = path.resolve('src/services/directorApi.ts');
  const permsPath = path.resolve('src/utils/rolePermissions.ts');
  const layoutPath = path.resolve('src/components/Layout.tsx');
  const appPath = path.resolve('src/App.tsx');

  const pageSource = fs.readFileSync(pagePath, 'utf8');
  const apiSource = fs.readFileSync(apiPath, 'utf8');
  const permsSource = fs.readFileSync(permsPath, 'utf8');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');

  describe('1. Contrôles d\'accès et rôles autorisés', () => {
    it('rolePermissions.ts attribue demandes_rattachement exclusivement aux directeurs et administrateurs', () => {
      // Vérifier la présence dans les rôles autorisés
      assert.ok(permsSource.includes("'demandes_rattachement'"), 'demandes_rattachement doit être déclarée dans les permissions');

      // Extraction des blocs de rôles avec word boundaries
      const dgBlock = permsSource.match(/\bdirecteur_general:\s*\[([\s\S]*?)\]/)?.[1] || '';
      const adminBlock = permsSource.match(/\badmin:\s*\[([\s\S]*?)\]/)?.[1] || '';
      const dirBlock = permsSource.match(/\bdirecteur:\s*\[([\s\S]*?)\]/)?.[1] || '';
      const parentBlock = permsSource.match(/\bparent:\s*\[([\s\S]*?)\]/)?.[1] || '';
      const comptableBlock = permsSource.match(/\bcomptable:\s*\[([\s\S]*?)\]/)?.[1] || '';
      const profBlock = permsSource.match(/\bprofesseur:\s*\[([\s\S]*?)\]/)?.[1] || '';

      assert.ok(dgBlock.includes('demandes_rattachement'), 'directeur_general doit avoir accès');
      assert.ok(adminBlock.includes('demandes_rattachement'), 'admin doit avoir accès');
      assert.ok(dirBlock.includes('demandes_rattachement'), 'directeur doit avoir accès');

      assert.ok(!parentBlock.includes('demandes_rattachement'), 'parent ne doit PAS avoir accès');
      assert.ok(!comptableBlock.includes('demandes_rattachement'), 'comptable ne doit PAS avoir accès');
      assert.ok(!profBlock.includes('demandes_rattachement'), 'professeur ne doit PAS avoir accès');
    });

    it('Le composant DemandesRattachement applique une barrière stricte via isAdminRole', () => {
      assert.ok(pageSource.includes('isAdminRole(user?.role)'), 'DemandesRattachement doit vérifier isAdminRole');
      assert.ok(pageSource.includes('Accès restreint'), 'DemandesRattachement doit afficher un écran d accès restreint si non autorisé');
    });
  });

  describe('2. Intégration dans la Navigation et Routage App', () => {
    it('Layout.tsx déclare l onglet demandes_rattachement dans NAV_ITEMS et NAV_GROUPS', () => {
      assert.ok(layoutSource.includes("id: 'demandes_rattachement'"), 'NAV_ITEMS doit contenir demandes_rattachement');
      assert.ok(layoutSource.includes("demandes_rattachement: 'Gestion'"), 'NAV_GROUPS doit rattacher à Gestion');
    });

    it('App.tsx importe et monte DemandesRattachement avec lazy-loading', () => {
      assert.ok(appSource.includes("import('./pages/DemandesRattachement')"), 'App.tsx doit importer DemandesRattachement');
      assert.ok(appSource.includes("case 'demandes_rattachement': return <DemandesRattachement />;"), 'App.tsx doit router vers DemandesRattachement');
    });
  });

  describe('3. Service API Directeur (directorApi.ts)', () => {
    it('directorApi réutilise exclusivement les routes officielles sous /director/requests', () => {
      assert.ok(apiSource.includes('${API_BASE_URL}/director/requests?page='), 'listRequests doit utiliser /director/requests avec pagination');
      assert.ok(apiSource.includes('${API_BASE_URL}/director/requests/${id}/approve'), 'approveRequest doit appeler approve');
      assert.ok(apiSource.includes('${API_BASE_URL}/director/requests/${id}/reject'), 'rejectRequest doit appeler reject');
      assert.ok(apiSource.includes("method: 'POST'"), 'Les actions approve/reject doivent être des requêtes POST');
    });

    it('directorApi transmet les headers d authentification JWT', () => {
      assert.ok(apiSource.includes('headers: getAuthHeaders()'), 'Doit inclure getAuthHeaders()');
    });

    it('rejectRequest transmet le motif et le code de rejet dans le corps de la requête', () => {
      assert.ok(apiSource.includes('rejection_reason: rejectionReason'), 'Le payload doit inclure rejection_reason');
      assert.ok(apiSource.includes('rejection_reason_code: rejectionReasonCode'), 'Le payload doit inclure rejection_reason_code');
    });
  });

  describe('4. Intégrité et absence de contournement dans l\'interface', () => {
    it('Ne contient aucune écriture directe dans Supabase (étanchéité totale)', () => {
      assert.ok(!pageSource.includes('supabase.from('), 'Aucun accès direct Supabase dans DemandesRattachement');
      assert.ok(!pageSource.includes('parent_student_'), 'Aucune mutation de table locale');
    });

    it('Exige obligatoirement un motif non vide lors du rejet', () => {
      assert.ok(pageSource.includes('trimmedReason'), 'Doit nettoyer les espaces du motif');
      assert.ok(pageSource.includes('!trimmedReason'), 'Doit bloquer le rejet si le motif est vide');
      assert.ok(pageSource.includes('rejectionReason.trim()'), 'Le bouton de rejet doit être désactivé si vide');
      assert.ok(pageSource.includes('Le motif de rejet est obligatoire'), 'Doit afficher un message d erreur si motif manquant');
    });

    it('Gère les transitions d état invalides (ex: INVALID_STATUS_TRANSITION)', () => {
      assert.ok(pageSource.includes('INVALID_STATUS_TRANSITION'), 'Doit intercepter INVALID_STATUS_TRANSITION pour notifier le directeur');
    });
  });
});
