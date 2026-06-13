// ============================================================
// EXPORT EXCEL — Mise à jour et téléchargement
// ============================================================
import * as XLSX from 'xlsx';
import { Student } from '../types';

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

export const exportToExcel = (students: Student[], filename = 'export_eleves'): void => {
  const data = students.map((s, i) => ({
    '#': i + 1,
    Nom: s.nom,
    Prénom: s.prenom,
    Classe: s.classe,
    Cycle: s.cycle,
    Téléphone: s.telephone,
    Sexe: s.sexe === 'M' ? 'Masculin' : 'Féminin',
    Redoublant: s.redoublant ? 'Oui' : 'Non',
    'École de Provenance': s.ecoleProvenance,
    'Écolage (FCFA)': fmtMoney(s.ecolage),
    'Déjà Payé (FCFA)': fmtMoney(s.dejaPaye),
    'Restant (FCFA)': s.restant <= 0 ? 'SOLDÉ' : fmtMoney(s.restant),
    'Taux (%)': `${Math.min(100, Math.round((s.dejaPaye / s.ecolage) * 100))} %`,
    Statut: s.status,
    'N° Reçu': s.recu,
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Largeurs colonnes
  ws['!cols'] = [
    { wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 10 },
    { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 25 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Élèves');

  // Feuille résumé
  const summary = [
    { Indicateur: 'Total élèves', Valeur: students.length },
    { Indicateur: 'Primaire', Valeur: students.filter((s) => s.cycle === 'Primaire').length },
    { Indicateur: 'Collège',  Valeur: students.filter((s) => s.cycle === 'Collège').length },
    { Indicateur: 'Lycée',    Valeur: students.filter((s) => s.cycle === 'Lycée').length },
    { Indicateur: 'Écolage total attendu (FCFA)', Valeur: fmtMoney(students.reduce((a, s) => a + s.ecolage, 0)) },
    { Indicateur: 'Total payé (FCFA)',            Valeur: fmtMoney(students.reduce((a, s) => a + s.dejaPaye, 0)) },
    { Indicateur: 'Total restant (FCFA)',          Valeur: fmtMoney(students.reduce((a, s) => a + s.restant, 0)) },
    { Indicateur: 'Taux de recouvrement (%)',
      Valeur: students.length > 0
        ? `${Math.round((students.reduce((a, s) => a + s.dejaPaye, 0) / students.reduce((a, s) => a + s.ecolage, 0)) * 100)} %`
        : '0 %' },
    { Indicateur: 'Élèves soldés',   Valeur: students.filter((s) => s.status === 'Soldé').length },
    { Indicateur: 'Élèves non soldés', Valeur: students.filter((s) => s.status !== 'Soldé').length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé');

  XLSX.writeFile(wb, `${filename}.xlsx`);
};
