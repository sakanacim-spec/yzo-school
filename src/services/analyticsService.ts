// ============================================================
// ANALYTICS SERVICE — Indicateurs financiers avancés
// Toute la logique de calcul est centralisée ici.
// Les pages ne font qu'appeler ces fonctions.
// ============================================================
import { Student, Payment, Cycle } from '../types';
import { CLASS_CONFIG } from '../data/classConfig';

// ─────────────────────────────────────────────
// TYPES EXPORTÉS
// ─────────────────────────────────────────────

export interface RecouvrementResult {
  /** Montant total théorique attendu */
  totalTheorique: number;
  /** Montant total déjà encaissé */
  totalEncaisse: number;
  /** Montant total restant */
  totalRestant: number;
  /** Taux en % arrondi à 2 décimales */
  taux: number;
  /** Badge sémantique selon la performance */
  badge: 'excellent' | 'bon' | 'moyen' | 'faible';
  /** Libellé lisible du badge */
  badgeLabel: string;
  /** Couleur Tailwind pour le badge */
  badgeColor: string;
  /** Couleur de la barre de progression */
  barColor: string;
}

export interface ProjectionResult {
  /** Taux de recouvrement actuel (décimal, ex: 0.72) */
  tauxActuel: number;
  /** Projection = totalTheorique × tauxActuel */
  projectionFinAnnee: number;
  /** Montant supplémentaire estimé à encaisser */
  resteAEncaisser: number;
  /** Scénario optimiste (+10% sur le taux actuel, plafonné à 100%) */
  scenarioOptimiste: number;
  /** Scénario pessimiste (−10% sur le taux actuel) */
  scenarioPessimiste: number;
}

export interface ClassFinanceRow {
  /** Nom de la classe */
  classe: string;
  /** Cycle scolaire */
  cycle: Cycle;
  /** Écolage théorique total */
  totalTheorique: number;
  /** Montant encaissé */
  totalEncaisse: number;
  /** Montant restant */
  totalRestant: number;
  /** Taux de recouvrement en % (0–100) */
  taux: number;
  /** Nombre d'élèves dans la classe */
  effectif: number;
  /** Nombre d'élèves soldés */
  soldes: number;
}

export interface MonthlyEvolution {
  /** Mois au format "Jan", "Fév", etc. */
  mois: string;
  /** Cumul encaissé jusqu'à ce mois */
  cumul: number;
  /** Encaissements du mois seul */
  montant: number;
}

// ─────────────────────────────────────────────
// 1. TAUX DE RECOUVREMENT GLOBAL
// ─────────────────────────────────────────────

/**
 * Calcule le taux de recouvrement global.
 * Formule : (totalEncaissé / totalThéorique) × 100
 *
 * @param students - Liste des élèves depuis le store Zustand
 * @returns RecouvrementResult complet avec badge coloré
 */
export function computeRecouvrement(students: Student[]): RecouvrementResult {
  const totalTheorique = students.reduce((acc, s) => acc + s.ecolage, 0);
  const totalEncaisse = students.reduce((acc, s) => acc + s.dejaPaye, 0);
  const totalRestant = students.reduce((acc, s) => acc + s.restant, 0);

  const taux = totalTheorique > 0
    ? parseFloat(((totalEncaisse / totalTheorique) * 100).toFixed(2))
    : 0;

  let badge: RecouvrementResult['badge'];
  let badgeLabel: string;
  let badgeColor: string;
  let barColor: string;

  if (taux >= 85) {
    badge = 'excellent';
    badgeLabel = 'Excellent';
    badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    barColor = '#16a34a';
  } else if (taux >= 65) {
    badge = 'bon';
    badgeLabel = 'Bon';
    badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
    barColor = '#2563eb';
  } else if (taux >= 40) {
    badge = 'moyen';
    badgeLabel = 'Moyen';
    badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
    barColor = '#d97706';
  } else {
    badge = 'faible';
    badgeLabel = 'Faible';
    badgeColor = 'bg-red-100 text-red-800 border-red-200';
    barColor = '#dc2626';
  }

  return { totalTheorique, totalEncaisse, totalRestant, taux, badge, badgeLabel, badgeColor, barColor };
}

// ─────────────────────────────────────────────
// 2. PROJECTION REVENUS FIN D'ANNÉE
// ─────────────────────────────────────────────

/**
 * Projette les revenus estimés en fin d'année scolaire
 * sur la base du taux de recouvrement actuel.
 *
 * Projection      = totalThéorique × tauxActuel
 * Optimiste       = totalThéorique × min(tauxActuel + 0.10, 1.00)
 * Pessimiste      = totalThéorique × max(tauxActuel − 0.10, 0)
 *
 * @param students - Liste des élèves depuis le store Zustand
 * @returns ProjectionResult avec 3 scénarios
 */
export function computeProjection(students: Student[]): ProjectionResult {
  const totalTheorique = students.reduce((acc, s) => acc + s.ecolage, 0);
  const totalEncaisse = students.reduce((acc, s) => acc + s.dejaPaye, 0);

  const tauxActuel = totalTheorique > 0 ? totalEncaisse / totalTheorique : 0;

  const projectionFinAnnee = Math.round(totalTheorique * tauxActuel);
  const resteAEncaisser = Math.max(0, totalTheorique - totalEncaisse);
  const scenarioOptimiste = Math.round(totalTheorique * Math.min(tauxActuel + 0.10, 1));
  const scenarioPessimiste = Math.round(totalTheorique * Math.max(tauxActuel - 0.10, 0));

  return {
    tauxActuel,
    projectionFinAnnee,
    resteAEncaisser,
    scenarioOptimiste,
    scenarioPessimiste,
  };
}

// ─────────────────────────────────────────────
// 3. COMPARAISON FINANCIÈRE PAR CLASSE
// ─────────────────────────────────────────────

/**
 * Calcule les indicateurs financiers pour chaque classe
 * et retourne le tableau trié du meilleur taux au plus faible.
 * Seules les classes avec au moins 1 élève sont incluses.
 *
 * @param students - Liste des élèves depuis le store Zustand
 * @returns ClassFinanceRow[] trié par taux décroissant
 */
export function computeClassComparison(students: Student[]): ClassFinanceRow[] {
  const rows: ClassFinanceRow[] = CLASS_CONFIG
    .map((config) => {
      const classeStudents = students.filter((s) => s.classe === config.name);
      if (classeStudents.length === 0) return null;

      const totalTheorique = classeStudents.reduce((acc, s) => acc + s.ecolage, 0);
      const totalEncaisse = classeStudents.reduce((acc, s) => acc + s.dejaPaye, 0);
      const totalRestant = classeStudents.reduce((acc, s) => acc + s.restant, 0);
      const soldes = classeStudents.filter((s) => s.status === 'Soldé').length;
      const taux = totalTheorique > 0
        ? parseFloat(((totalEncaisse / totalTheorique) * 100).toFixed(2))
        : 0;

      return {
        classe: config.name,
        cycle: config.cycle,
        totalTheorique,
        totalEncaisse,
        totalRestant,
        taux,
        effectif: classeStudents.length,
        soldes,
      } satisfies ClassFinanceRow;
    })
    .filter((r): r is ClassFinanceRow => r !== null);

  // Trier du meilleur taux au plus faible
  return rows.sort((a, b) => b.taux - a.taux);
}

// ─────────────────────────────────────────────
// 4. ÉVOLUTION MENSUELLE DES PAIEMENTS
// ─────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

/**
 * Construit la courbe d'évolution mensuelle des paiements
 * à partir des historiques de paiements manuels.
 * Inclut aussi les paiements initiaux (dejaPaye à l'import).
 *
 * @param students - Liste des élèves depuis le store Zustand
 * @param payments - Paiements additionnels (optionnel si déjà dans students)
 * @returns MonthlyEvolution[] sur 12 mois
 */
export function computeMonthlyEvolution(
  students: Student[],
  _payments?: Payment[]
): MonthlyEvolution[] {
  // Agréger tous les paiements de l'historique
  const byMonth: Record<number, number> = {};

  students.forEach((s) => {
    s.historiquesPaiements.forEach((p) => {
      const month = new Date(p.date).getMonth(); // 0–11
      byMonth[month] = (byMonth[month] ?? 0) + p.montant;
    });
  });

  // Construire les 12 mois avec cumul
  let cumul = 0;
  return MONTH_LABELS.map((mois, i) => {
    const montant = byMonth[i] ?? 0;
    cumul += montant;
    return { mois, montant, cumul };
  });
}

// ─────────────────────────────────────────────
// 5. DÉTECTION DES RETARDS DE PAIEMENT
// ─────────────────────────────────────────────

export interface RetardAlert {
  studentId: string;
  nom: string;
  prenom: string;
  classe: string;
  restant: number;
  tauxPaye: number;
  telephone: string;
  niveau: 'critique' | 'modere' | 'leger';
}

/**
 * Détecte automatiquement les élèves en retard de paiement.
 * - Critique  : taux payé < 30%
 * - Modéré    : 30% ≤ taux payé < 60%
 * - Léger     : 60% ≤ taux payé < 100% (non soldé)
 *
 * @param students - Liste des élèves depuis le store Zustand
 * @returns RetardAlert[] trié par niveau puis par restant décroissant
 */
export function detectRetards(students: Student[]): RetardAlert[] {
  return students
    .filter((s) => s.restant > 0)
    .map((s) => {
      const tauxPaye = s.ecolage > 0 ? (s.dejaPaye / s.ecolage) * 100 : 0;
      const niveau: RetardAlert['niveau'] =
        tauxPaye < 30 ? 'critique' : tauxPaye < 60 ? 'modere' : 'leger';
      return {
        studentId: s.id,
        nom: s.nom,
        prenom: s.prenom,
        classe: s.classe,
        restant: s.restant,
        tauxPaye: parseFloat(tauxPaye.toFixed(1)),
        telephone: s.telephone,
        niveau,
      };
    })
    .sort((a, b) => {
      const order = { critique: 0, modere: 1, leger: 2 };
      if (order[a.niveau] !== order[b.niveau]) return order[a.niveau] - order[b.niveau];
      return b.restant - a.restant;
    });
}

// ─────────────────────────────────────────────
// 6. INDICE DE SANTÉ FINANCIÈRE DE L'ÉTABLISSEMENT
// ─────────────────────────────────────────────

export interface SanteFinanciere {
  score: number;
  color: string; // class de couleur text
  badgeColor: string; // bg color
  label: string; // Vert / Orange / Rouge
}

/**
 * Calcule l'indice global de santé financière sur 100.
 */
export function computeSanteFinanciere(students: Student[]): SanteFinanciere {
  if (students.length === 0) return { score: 100, color: 'text-emerald-500', badgeColor: 'bg-emerald-100', label: 'Vert' };

  const totalTheorique = students.reduce((acc, s) => acc + s.ecolage, 0);
  const totalEncaisse = students.reduce((acc, s) => acc + s.dejaPaye, 0);
  const totalRestant = students.reduce((acc, s) => acc + s.restant, 0);

  if (totalTheorique === 0) return { score: 100, color: 'text-emerald-500', badgeColor: 'bg-emerald-100', label: 'Vert' };

  const tauxRecouvrement = (totalEncaisse / totalTheorique) * 100;

  // Taux de recouvrement: contribue jusqu'à 60 points
  const ptsTaux = Math.min(60, (tauxRecouvrement / 100) * 60);

  // Élèves en retard: contribue jusqu'à 20 points
  const retardsCount = students.filter(s => s.status !== 'Soldé').length;
  const proportionRetard = retardsCount / students.length;
  const ptsRetards = Math.max(0, 20 - (proportionRetard * 40));

  // Montant total restant: contribue jusqu'à 20 points
  const proportionRestant = totalRestant / totalTheorique;
  const ptsRestant = Math.max(0, 20 - (proportionRestant * 40));

  const score = Math.round(ptsTaux + ptsRetards + ptsRestant);

  if (score >= 80) return { score, color: 'text-emerald-600', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Vert' };
  if (score >= 50) return { score, color: 'text-amber-500', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Orange' };
  return { score, color: 'text-red-500', badgeColor: 'bg-red-100 text-red-800 border-red-200', label: 'Rouge' };
}

// ─────────────────────────────────────────────
// 7. LISTE PRIORITAIRE DE RECOUVREMENT
// ─────────────────────────────────────────────

export interface PriorityStudent extends Student {
  scorePriorite: number;
  joursRetard: number; // basé arbitrairement sur l'inscription ou la tranche
  niveauPriorite: 'Élevé' | 'Moyen' | 'Faible';
  trancheInfo?: string;
}

/**
 * Calcule la liste prioritaire de recouvrement.
 * Si des tranches sont configurées, le retard en jours est calculé par rapport 
 * à la date limite de la tranche impayée.
 */
export function computePriorityList(students: Student[], classComparaisons: ClassFinanceRow[], tranches: any[] = []): PriorityStudent[] {
  const nonSoldes = students.filter(s => s.status !== 'Soldé');
  const now = new Date();

  // Trier les tranches par dateLimite
  const sortedTranches = [...tranches].filter(t => t.dateLimite).sort((a, b) => new Date(a.dateLimite).getTime() - new Date(b.dateLimite).getTime());

  const maxRestant = Math.max(...nonSoldes.map(s => s.restant), 1); // evite division par zero

  return nonSoldes.map(s => {
    let joursRetard = 0;
    let trancheRetardText = '';

    if (sortedTranches.length > 0) {
      // Déterminer combien l'élève a payé en %
      const pctPaye = s.ecolage > 0 ? (s.dejaPaye / s.ecolage) * 100 : 0;
      let cumPct = 0;
      
      // Chercher la première tranche non satisfaite
      for (const t of sortedTranches) {
        cumPct += Number(t.pourcentage || 0);
        if (pctPaye < cumPct) {
          // Cette tranche n'est pas complètement payée !
          const limite = new Date(t.dateLimite);
          
          if (now > limite) {
             const diffTime = now.getTime() - limite.getTime();
             joursRetard = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             trancheRetardText = `Retard (${t.nom})`;
          } else {
             // La date limite de la tranche en cours n'est pas encore dépassée
             joursRetard = 0;
          }
          break; // on s'arrête à la première tranche non validée
        }
      }
    } else {
      // Retard calculé basé sur l'inscription
      const regDate = new Date(s.createdAt);
      const diffTime = Math.abs(now.getTime() - regDate.getTime());
      joursRetard = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Info classe
    const cStats = classComparaisons.find(c => c.classe === s.classe);
    const tauxClasse = cStats ? cStats.taux : 100; // si on ne trouve pas

    // Calcul score (plus c'est élevé plus c'est urgent) sur 100
    // 1. Montant restant : 50 points
    const ptsRestant = (s.restant / maxRestant) * 50;

    // 2. Jours de retard : max 25 points (plafonné à 90 jours)
    const ptsRetard = Math.min(25, (joursRetard / 90) * 25);

    // 3. Faible taux paiement classe : 25 points (plus la classe paye peu, plus le score est haut)
    const ptsClasse = 25 - (Math.min(25, (tauxClasse / 100) * 25));

    const scorePriorite = Math.round(ptsRestant + ptsRetard + ptsClasse);

    let niveauPriorite: 'Élevé' | 'Moyen' | 'Faible';
    if (scorePriorite >= 65) niveauPriorite = 'Élevé';
    else if (scorePriorite >= 40) niveauPriorite = 'Moyen';
    else niveauPriorite = 'Faible';

    return {
      ...s,
      scorePriorite,
      joursRetard,
      niveauPriorite,
      trancheInfo: trancheRetardText
    };
  }).sort((a, b) => b.scorePriorite - a.scorePriorite);
}

// ─────────────────────────────────────────────
// 8. COMPARAISON FINANCIÈRE PAR CYCLE
// ─────────────────────────────────────────────

export interface CycleFinanceRow {
  cycle: Cycle;
  totalTheorique: number;
  totalEncaisse: number;
  totalRestant: number;
  taux: number;
  effectif: number;
}

/**
 * Calcule les indicateurs financiers par cycle (Primaire, Collège, Lycée).
 */
export function computeCycleComparison(students: Student[]): CycleFinanceRow[] {
  const cycles: Cycle[] = ['Primaire', 'Collège', 'Lycée'];
  return cycles.map(cycle => {
    const cycleStudents = students.filter(s => s.cycle === cycle);
    if (cycleStudents.length === 0) return null;

    const totalTheorique = cycleStudents.reduce((acc, s) => acc + s.ecolage, 0);
    const totalEncaisse = cycleStudents.reduce((acc, s) => acc + s.dejaPaye, 0);
    const totalRestant = cycleStudents.reduce((acc, s) => acc + s.restant, 0);
    const taux = totalTheorique > 0
      ? parseFloat(((totalEncaisse / totalTheorique) * 100).toFixed(2))
      : 0;

    return {
      cycle,
      totalTheorique,
      totalEncaisse,
      totalRestant,
      taux,
      effectif: cycleStudents.length
    } satisfies CycleFinanceRow;
  }).filter((r): r is CycleFinanceRow => r !== null);
}
