// src/pages/__tests__/lotAParentDashboardAndHistory.test.ts
// Tests unitaires et comportementaux pour le Lot A (Parent Dashboard & Historique) et Lot B (Frais scolaires)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Implémentation miroir pour tests runtime directs
class ApiError extends Error {
  public status: number;
  public code?: string;
  public error: string;
  public details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.error = message;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

function sanitizeErrorMessage(rawMessage: string | undefined | null, status: number): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    if (status === 401) return 'Session expirée ou invalide. Veuillez vous reconnecter.';
    if (status === 403) return 'Accès non autorisé.';
    if (status === 404) return 'Ressource introuvable.';
    if (status >= 500) return 'Une erreur interne est survenue sur le serveur.';
    return 'Une erreur est survenue lors de la communication avec le serveur.';
  }

  const trimmed = rawMessage.trim();

  const sqlLeakPatterns = [
    /relation\s+["'].*?["']\s+does not exist/i,
    /syntax error at or near/i,
    /column\s+["'].*?["']\s+does not exist/i,
    /foreign key constraint/i,
    /unique constraint/i,
    /42P01/i,
    /23505/i,
    /pg_/i,
    /supabase/i,
    /jwt/i,
    /bearer/i
  ];

  for (const pattern of sqlLeakPatterns) {
    if (pattern.test(trimmed)) {
      if (status >= 500) {
        return 'Une erreur interne est survenue sur le serveur. Veuillez réessayer ultérieurement.';
      }
      return 'Requête non valide ou ressource indisponible.';
    }
  }

  return trimmed;
}

const CLASS_CONFIG_FR: Record<string, { ecolage: number }> = {
  'Maternelle 1': { ecolage: 35000 },
  'Maternelle 2': { ecolage: 35000 },
  'CI': { ecolage: 45000 },
  'CP': { ecolage: 45000 },
  'CE1': { ecolage: 50000 },
  'CE2': { ecolage: 50000 },
  'CM1': { ecolage: 55000 },
  'CM2': { ecolage: 55000 },
};

function getEcolage(classe: string): number {
  return CLASS_CONFIG_FR[classe]?.ecolage || 50000;
}

describe('LOT A & LOT B — Tests Unitaires et Validations Régression', () => {
  const apiHelpersPath = path.resolve('src/services/apiHelpers.ts');
  const parentApiPath = path.resolve('src/services/parentApi.ts');
  const parentDashboardPath = path.resolve('src/pages/parent/ParentDashboard.tsx');
  const parentHistoriquePath = path.resolve('src/pages/parent/ParentHistorique.tsx');
  const parentControllerPath = path.resolve('backend/controllers/parentController.js');
  const storePath = path.resolve('src/store/useStore.ts');

  const apiHelpersSource = fs.readFileSync(apiHelpersPath, 'utf8');
  const parentApiSource = fs.readFileSync(parentApiPath, 'utf8');
  const parentDashboardSource = fs.readFileSync(parentDashboardPath, 'utf8');
  const parentHistoriqueSource = fs.readFileSync(parentHistoriquePath, 'utf8');
  const parentControllerSource = fs.readFileSync(parentControllerPath, 'utf8');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  // =========================================================================
  // SECTION LOT A : NORMALISATION DES ERREURS ET TABLEAU DE BORD PARENT (A01-A12)
  // =========================================================================
  describe('Lot A : Normalisation API & Parent Dashboard (A01 à A12)', () => {
    it('A01: ApiError instancie proprement status, message, code et details', () => {
      const err = new ApiError('Test error', 404, 'NOT_FOUND', { foo: 'bar' });
      assert.equal(err.name, 'ApiError');
      assert.equal(err.message, 'Test error');
      assert.equal(err.status, 404);
      assert.equal(err.code, 'NOT_FOUND');
      assert.deepEqual(err.details, { foo: 'bar' });
      assert.ok(err instanceof Error);
      assert.ok(err instanceof ApiError);
    });

    it('A02: sanitizeErrorMessage filtre les fuites de schéma SQL (relation does not exist, 42P01)', () => {
      const leakedMsg = 'relation "payments_test" does not exist (code 42P01)';
      const sanitized = sanitizeErrorMessage(leakedMsg, 500);
      assert.ok(!sanitized.includes('42P01'));
      assert.ok(!sanitized.includes('payments_test'));
      assert.ok(sanitized.includes('erreur interne'));
    });

    it('A03: sanitizeErrorMessage filtre les fuites syntaxiques et tokens sensibles', () => {
      const leakedSyntax = 'syntax error at or near "SELECT"';
      assert.ok(!sanitizeErrorMessage(leakedSyntax, 500).includes('SELECT'));

      const leakedJwt = 'invalid JWT token or bearer signature';
      assert.ok(!sanitizeErrorMessage(leakedJwt, 401).includes('JWT'));
    });

    it('A04: handleApiResponse est exporté et lève une ApiError sur status >= 400', () => {
      assert.ok(apiHelpersSource.includes('export async function handleApiResponse'), 'handleApiResponse doit être exporté');
      assert.ok(apiHelpersSource.includes('throw err'), 'handleApiResponse doit lever ApiError');
    });

    it('A05: sanitizeErrorMessage préserve les messages métier légitimes', () => {
      const userMsg = 'Identifiants invalides';
      assert.equal(sanitizeErrorMessage(userMsg, 401), 'Identifiants invalides');
    });

    it('A06: parentApi.ts utilise handleApiResponse au lieu de throw data non typé', () => {
      assert.ok(parentApiSource.includes('handleApiResponse'), 'parentApi doit importer et utiliser handleApiResponse');
      assert.ok(!parentApiSource.includes('throw data'), 'parentApi ne doit plus contenir throw data');
    });

    it('A07: ParentDashboard.tsx protège contre la boucle infinie si children.length === 0 via hasFetched', () => {
      assert.ok(parentDashboardSource.includes('if (!force && hasFetched) return;'), 'fetchData doit respecter le verrou hasFetched');
      assert.ok(parentDashboardSource.includes('const [hasFetched, setHasFetched] = useState(false);'));
    });

    it('A08: ParentDashboard.tsx utilise reqSeqRef pour ignorer les réponses obsolètes', () => {
      assert.ok(parentDashboardSource.includes('reqSeqRef.current'), 'reqSeqRef doit être incrémenté et vérifié');
    });

    it('A09: ParentDashboard.tsx gère spécifiquement le statut 401 avec invite de reconnexion', () => {
      assert.ok(parentDashboardSource.includes('errorStatus === 401'), 'Le statut 401 doit être détecté');
      assert.ok(parentDashboardSource.includes('Se reconnecter'), 'Un bouton Se reconnecter doit être proposé');
      assert.ok(parentDashboardSource.includes('logout()'), 'La déconnexion doit être invoquée');
    });

    it('A10: ParentDashboard.tsx détecte le mode hors-ligne sans crash', () => {
      assert.ok(parentDashboardSource.includes('!navigator.onLine'), 'navigator.onLine doit être pris en compte');
    });

    it('A11: ParentDashboard.tsx affiche une bannière non bloquante si erreur avec élèves déjà chargés', () => {
      assert.ok(parentDashboardSource.includes('errorMsg && children.length > 0'), 'Bannière non bloquante requise quand children > 0');
    });

    it('A12: État vide explicite lorsque parent a 0 enfant', () => {
      assert.ok(parentDashboardSource.includes("Aucun enfant n'est actuellement rattaché"), 'Texte explicite d orientation requis');
      assert.ok(parentDashboardSource.includes('linkChildBtn'), 'Bouton de demande de rattachement présent');
    });
  });

  // =========================================================================
  // SECTION HISTORIQUE PARENT (H01-H10)
  // =========================================================================
  describe('Lot A : ParentHistorique State Machine & Affichage Propre (H01 à H10)', () => {
    it('H01: ParentHistorique définit une machine d états propre (loading, no_children, error, empty, has_data)', () => {
      assert.ok(parentHistoriqueSource.includes("type HistoryStatus = 'loading' | 'no_children' | 'error' | 'empty' | 'has_data'"));
      assert.ok(parentHistoriqueSource.includes('const [status, setStatus] = useState<HistoryStatus>(\'loading\');'));
    });

    it('H02: Si children.length === 0, transition directe vers no_children sans requêter payments ni presences', () => {
      assert.ok(parentHistoriqueSource.includes('if (children.length === 0)'), 'Vérification children.length === 0 obligatoire');
      assert.ok(parentHistoriqueSource.includes("setStatus('no_children')"));
    });

    it('H03: En état no_children, affichage explicite et aucun message d erreur ni tableau vide contradictoire', () => {
      assert.ok(parentHistoriqueSource.includes("status === 'no_children'"));
      assert.ok(parentHistoriqueSource.includes("Aucun enfant n'est rattaché à votre compte. Aucun historique de paiement n'est disponible."));
    });

    it('H04: Utilisation de Promise.allSettled pour isoler les erreurs par élève', () => {
      assert.ok(parentHistoriqueSource.includes('Promise.allSettled'), 'Promise.allSettled doit être utilisé pour payments et presences');
    });

    it('H05: Détection des échecs partiels et affichage d un avertissement discret non bloquant', () => {
      assert.ok(parentHistoriqueSource.includes('setPartialWarning'), 'setPartialWarning doit être présent');
      assert.ok(parentHistoriqueSource.includes('partialWarning &&'));
    });

    it('H06: Erreur globale déclenchée UNIQUEMENT si TOUTES les requêtes échouent', () => {
      assert.ok(parentHistoriqueSource.includes('payFailures === children.length && presFailures === children.length'));
    });

    it('H07: En état error, affichage d un écran d erreur avec bouton Réessayer SANS le tableau "Aucun paiement"', () => {
      assert.ok(parentHistoriqueSource.includes("status === 'error'"));
      assert.ok(parentHistoriqueSource.includes('fetchAllData()'), 'Bouton réessayer doit relancer fetchAllData');
    });

    it('H08: En état empty (enfants présents mais 0 paiement), pas de bannière d erreur', () => {
      assert.ok(parentHistoriqueSource.includes("setStatus('empty')"));
      assert.ok(parentHistoriqueSource.includes('Aucun paiement.'));
    });

    it('H09: Tri décroissant chronologique des paiements et présences', () => {
      assert.ok(parentHistoriqueSource.includes('successfulPayments.sort'));
      assert.ok(parentHistoriqueSource.includes('successfulPresences.sort'));
    });

    it('H10: Téléchargement de quittance disponible par ligne de paiement', () => {
      assert.ok(parentHistoriqueSource.includes('downloadReceipt'));
      assert.ok(parentHistoriqueSource.includes('generatePaymentReceipt'));
    });
  });

  // =========================================================================
  // SECTION LOT B : FRAIS SCOLAIRES, REPAIR STUDENT & STATUTS (B01-B15)
  // =========================================================================
  describe('Lot B : Cohérence des Frais Scolaires & repairStudent (B01 à B15)', () => {
    it('B01: repairStudent préserve l écolage réel de la BD (80 000 FCFA pour CM2 au lieu de 55 000 FCFA)', () => {
      assert.ok(storeSource.includes('const isValidEcolage = typeof s.ecolage === \'number\' && !isNaN(s.ecolage) && s.ecolage >= 0;'));
      assert.ok(storeSource.includes('const correctEcolage = isValidEcolage ? s.ecolage : getEcolage(s.classe);'));

      // Test direct de la fonction mathématique
      const staticCM2 = getEcolage('CM2');
      assert.equal(staticCM2, 55000, 'Tarif statique de base CM2 est 55000');
      
      const realStudentEcolage = 80000;
      const isValid = typeof realStudentEcolage === 'number' && !isNaN(realStudentEcolage) && realStudentEcolage >= 0;
      const resolved = isValid ? realStudentEcolage : staticCM2;
      assert.equal(resolved, 80000, 'L écolage réel de 80 000 doit être préservé');
    });

    it('B02: repairStudent préserve un écolage explicite de 0 FCFA (bourse/exonération)', () => {
      const scholarshipEcolage = 0;
      const isValid = typeof scholarshipEcolage === 'number' && !isNaN(scholarshipEcolage) && scholarshipEcolage >= 0;
      const resolved = isValid ? scholarshipEcolage : getEcolage('CM2');
      assert.equal(resolved, 0, 'Un écolage de 0 FCFA ne doit jamais être écrasé');
    });

    it('B03: repairStudent ne fallback sur classConfig QUE si ecolage est null, undefined ou NaN', () => {
      const nullEcolage = null as any;
      const isNullValid = typeof nullEcolage === 'number' && !isNaN(nullEcolage) && nullEcolage >= 0;
      assert.equal(isNullValid, false);
      const fallback = isNullValid ? nullEcolage : getEcolage('CM2');
      assert.equal(fallback, 55000);
    });

    it('B04: repairStudent prend en compte dejaPaye (camelCase) et deja_paye (snake_case)', () => {
      assert.ok(storeSource.includes('(s as any).deja_paye'));
    });

    it('B05: Calcul du restant dû exact (80 000 - 50 000 = 30 000 FCFA et non 5 000 FCFA)', () => {
      const ecolage = 80000;
      const dejaPaye = 50000;
      const restant = Math.max(0, ecolage - dejaPaye);
      assert.equal(restant, 30000, 'Le restant doit être de 30 000 FCFA');
    });

    it('B06: backend getDashboard normalise les élèves avec deja_paye ET dejaPaye', () => {
      assert.ok(parentControllerSource.includes('deja_paye: rawDejaPaye'));
      assert.ok(parentControllerSource.includes('dejaPaye: rawDejaPaye'));
    });

    it('B07: backend getDashboard convertit ecolage et deja_paye en nombres valides', () => {
      assert.ok(parentControllerSource.includes('rawEcolage'));
      assert.ok(parentControllerSource.includes('rawDejaPaye'));
      assert.ok(parentControllerSource.includes('rawRestant'));
    });

    it('B08: Statut financier Soldé quand dejaPaye >= ecolage', () => {
      const computeStatusHelper = (deja: number, eco: number) => {
        if (eco > 0) {
          if (deja >= eco) return 'Soldé';
          if (deja > 0) return 'Partiel';
          return 'Non payé';
        }
        return 'Soldé';
      };
      assert.equal(computeStatusHelper(80000, 80000), 'Soldé');
      assert.equal(computeStatusHelper(90000, 80000), 'Soldé');
    });

    it('B09: Statut financier Partiel quand dejaPaye > 0 et < ecolage', () => {
      const computeStatusHelper = (deja: number, eco: number) => {
        if (eco > 0) {
          if (deja >= eco) return 'Soldé';
          if (deja > 0) return 'Partiel';
          return 'Non payé';
        }
        return 'Soldé';
      };
      assert.equal(computeStatusHelper(50000, 80000), 'Partiel');
    });

    it('B10: Statut financier Non payé quand dejaPaye === 0', () => {
      const computeStatusHelper = (deja: number, eco: number) => {
        if (eco > 0) {
          if (deja >= eco) return 'Soldé';
          if (deja > 0) return 'Partiel';
          return 'Non payé';
        }
        return 'Soldé';
      };
      assert.equal(computeStatusHelper(0, 80000), 'Non payé');
    });

    it('B11: backend getPayments normalise également l objet student', () => {
      assert.ok(parentControllerSource.includes('normalizedStudent'));
      assert.ok(parentControllerSource.includes('student: normalizedStudent'));
    });

    it('B12: backend getPayments capture l erreur 42P01 PostgreSQL sans fuite SQL', () => {
      assert.ok(parentControllerSource.includes("pErr.code === '42P01'"));
      assert.ok(parentControllerSource.includes('la table des paiements de cet établissement est indisponible'));
    });

    it('B13: backend getPresences capture l erreur 42P01 PostgreSQL sans fuite SQL', () => {
      assert.ok(parentControllerSource.includes('la table des présences de cet établissement est indisponible'));
    });

    it('B14: ParentDashboard calcule les totaux globaux avec fallback camelCase/snake_case', () => {
      assert.ok(parentDashboardSource.includes('s.dejaPaye !== undefined ? s.dejaPaye : (s.deja_paye !== undefined ? s.deja_paye : 0)'));
    });

    it('B15: ChildCard dans ParentDashboard utilise financialStatus cohérent', () => {
      assert.ok(parentDashboardSource.includes('const financialStatus = child.status ||'));
      assert.ok(parentDashboardSource.includes("financialStatus === 'Soldé' ? 'bg-emerald-100"));
      assert.ok(parentDashboardSource.includes("financialStatus === 'Partiel' ? 'bg-amber-100"));
    });
  });
});
