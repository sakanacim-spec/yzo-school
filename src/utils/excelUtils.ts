import * as XLSX from 'xlsx';
import { Student, Payment } from '../types';
import { getEcolageByClass, getCycleByClass } from '../data/classes';

export const parseExcelFile = (file: File): Promise<Student[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        // Utiliser la 2ème feuille (index 1) si elle existe, sinon la 1ère
        const sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
        
        // Skip header row (row 1), data starts at row 2
        const students: Student[] = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as (string | number | undefined)[];
          if (!row || row.length < 5) continue;
          
          // Colonnes: B=NOMS, C=Prénoms, D=CLASSE, E=TELEPHONE, F=SEXE, G=REDOUBLANT, H=ECOLE, I=ECOLAGE, J=DEJA PAYE, K=RESTANT, L=RECU
          const nom = String(row[1] || '').trim();
          const prenom = String(row[2] || '').trim();
          const classe = String(row[3] || '').trim();
          const telephone = String(row[4] || '').trim();
          const sexe = String(row[5] || 'M').trim().toUpperCase() === 'F' ? 'F' : 'M';
          const redoublant = String(row[6] || '').toLowerCase() === 'oui';
          const ecoleProvenance = String(row[7] || '').trim();
          
          // Ecolage: soit depuis le fichier, soit calculé
          let ecolage = Number(row[8]) || 0;
          if (ecolage === 0) {
            ecolage = getEcolageByClass(classe);
          }
          
          const dejaPaye = Number(row[9]) || 0;
          
          // Restant: peut être "SOLDE" ou un nombre
          let restant = 0;
          const restantValue = row[10];
          if (typeof restantValue === 'string' && restantValue.toUpperCase() === 'SOLDE') {
            restant = 0;
          } else {
            restant = Number(restantValue) || Math.max(0, ecolage - dejaPaye);
          }
          
          const recu = String(row[11] || '').trim();
          
          const studentId = `student-${Date.now()}-${i}`;
          const dateNow = new Date().toISOString();
          const today = dateNow.split('T')[0];
          
          if (nom || prenom) {
            const initialPayment: Payment | null = dejaPaye > 0 ? {
              id: `payment-initial-${i}`,
              studentId,
              date: today,
              montant: dejaPaye,
              mode: 'Espèces',
              recu: recu || `INIT-${i}`,
              reference: recu || `INIT-${i}`,
              commentaire: 'Paiement initial importé'
            } : null;

            students.push({
              id: studentId,
              nom,
              prenom,
              classe,
              telephone,
              sexe: sexe as 'M' | 'F',
              redoublant,
              ecoleProvenance,
              ecolage,
              dejaPaye,
              restant,
              recu,
              cycle: getCycleByClass(classe),
              status: restant === 0 ? 'Soldé' : (dejaPaye > 0 ? 'Partiel' : 'Non soldé'),
              historiquesPaiements: initialPayment ? [initialPayment] : [],
              paiements: initialPayment ? [initialPayment] : [],
              dateInscription: today,
              createdAt: dateNow,
              updatedAt: dateNow
            });
          }
        }
        
        resolve(students);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsBinaryString(file);
  });
};

export const exportToExcel = (students: Student[], filename: string = 'eleves.xlsx'): void => {
  const data = students.map(s => ({
    'NOM': s.nom,
    'PRÉNOM': s.prenom,
    'CLASSE': s.classe,
    'TÉLÉPHONE': s.telephone,
    'SEXE': s.sexe,
    'REDOUBLANT': s.redoublant ? 'Oui' : 'Non',
    'ÉCOLE DE PROVENANCE': s.ecoleProvenance,
    'ÉCOLAGE': s.ecolage,
    'DÉJÀ PAYÉ': s.dejaPaye,
    'RESTANT': s.restant === 0 ? 'SOLDÉ' : s.restant,
    'REÇU': s.recu,
    'STATUT': s.restant === 0 ? 'Soldé' : 'Non soldé'
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Élèves');
  
  // Auto-size columns
  const maxWidth = 20;
  const colWidths = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
  worksheet['!cols'] = colWidths;
  
  XLSX.writeFile(workbook, filename);
};
