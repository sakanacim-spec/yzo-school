import * as XLSX from 'xlsx';
import { Student } from '../types';
import { CLASSES } from '../data/classes';
import { generateId, getCycleFromClasse, getEcolageFromClasse } from './helpers';

export const importExcel = (file: File, existingStudents?: Student[]): Promise<Student[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // On cible la DEUXIÈME feuille (index 1) car la première est souvent une page de garde
        if (workbook.SheetNames.length < 2) {
          throw new Error("Le fichier Excel doit contenir au moins deux feuilles. Les données doivent être sur la deuxième feuille.");
        }
        
        const sheetName = workbook.SheetNames[1];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const studentsMap = new Map<string, Student>();
        const existingMap = new Map<string, Student>();
        
        // Map existing students for quick lookup
        if (existingStudents) {
          existingStudents.forEach(s => {
            const key = `${(s.nom || '').trim().toLowerCase()}|${((s.prenom || '')).trim().toLowerCase()}|${(s.classe || '').trim().toLowerCase()}`;
            existingMap.set(key, s);
          });
        }
        
        // Skip header row (index 0), data starts at row 2 (index 1)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as (string | number)[];
          
          if (!row || !row[1]) continue; // Skip empty rows
          
          const nom = String(row[1] || '').trim();
          const prenom = String(row[2] || '').trim();
          const classe = String(row[3] || '').trim();
          const telephone = String(row[4] || '').trim();
          const sexe = String(row[5] || 'M').trim().toUpperCase() === 'F' ? 'F' : 'M';
          const redoublant = String(row[6] || '').toLowerCase() === 'oui' || String(row[6] || '').toLowerCase() === 'yes';
          const ecoleProvenance = String(row[7] || '').trim();
          
          // Validate classe - support various naming conventions
          const allClasses = CLASSES.map(c => c.nom);
          
          const classeNormalized = classe.toUpperCase().trim()
            .replace(/È/g, 'E')
            .replace(/É/g, 'E');
          
          const classeAliases: Record<string, string> = {
            '6EME': '6EME', '6ÈME': '6EME', '6E': '6EME', 'SIXIEME': '6EME',
            '5EME': '5EME', '5ÈME': '5EME', '5E': '5EME', 'CINQUIEME': '5EME',
            '4EME': '4EME', '4ÈME': '4EME', '4E': '4EME', 'QUATRIEME': '4EME',
            '3EME': '3EME', '3ÈME': '3EME', '3E': '3EME', 'TROISIEME': '3EME',
            '2NDE S': '2nde S', '2NDE A4': '2nde A4', 'SECONDE S': '2nde S', 'SECONDE A4': '2nde A4',
            '2NDES': '2nde S', '2NDEA4': '2nde A4',
            '1ER A4': '1er A4', '1ERE A4': '1er A4', '1ÈRE A4': '1er A4', 'PREMIERE A4': '1er A4',
            '1ER D': '1er D', '1ERE D': '1er D', '1ÈRE D': '1er D', 'PREMIERE D': '1er D',
            '1ERA4': '1er A4', '1ERD': '1er D',
            'TLE A4': 'Tle A4', 'TERMINALE A4': 'Tle A4', 'TLEA4': 'Tle A4',
            'TLE D': 'Tle D', 'TERMINALE D': 'Tle D', 'TLED': 'Tle D',
            'CI': 'CI', 'CI 1': 'CI 1', 'CI1': 'CI 1', 'CI 2': 'CI 2', 'CI2': 'CI 2',
            'CP1': 'CP1', 'CP2': 'CP2', 'CE1': 'CE1', 'CE2': 'CE2', 'CM1': 'CM1', 'CM2': 'CM2'
          };
          
          const validClasse = classeAliases[classeNormalized] || 
            allClasses.find(c => c.toLowerCase() === classe.toLowerCase()) || 
            classe;
          
          const key = `${nom.toLowerCase()}|${prenom.toLowerCase()}|${validClasse.toLowerCase()}`;
          
          // If we already processed this student IN THIS FILE (loop), skip to avoid internal duplicates
          if (studentsMap.has(key)) continue;

          const ecolage = Number(row[8]) || getEcolageFromClasse(validClasse);
          const dejaPaye = Number(row[9]) || 0;
          const restant = row[10] === 'SOLDE' ? 0 : (Number(row[10]) || Math.max(0, ecolage - dejaPaye));
          const recu = String(row[11] || '').trim();
          
          const existingStudent = existingMap.get(key);
          
          const studentId = existingStudent ? existingStudent.id : generateId();
          const student: Student = {
            id: studentId,
            nom,
            prenom,
            classe: validClasse,
            telephone,
            sexe: sexe as 'M' | 'F',
            redoublant,
            ecoleProvenance,
            ecolage,
            dejaPaye,
            restant,
            recu,
            cycle: getCycleFromClasse(validClasse),
            dateInscription: existingStudent ? existingStudent.dateInscription : new Date().toISOString(),
            status: 'Non soldé', 
            createdAt: existingStudent ? existingStudent.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            historiquesPaiements: existingStudent ? existingStudent.historiquesPaiements : (dejaPaye > 0 ? [{
              id: generateId(),
              studentId: studentId,
              montant: dejaPaye,
              date: new Date().toISOString(),
              recu: recu || 'Import initial',
              methode: 'Espèces',
              reference: 'Import initial'
            }] : [])
          };
          
          studentsMap.set(key, student);
        }
        
        resolve(Array.from(studentsMap.values()));
      } catch (error) {
        reject(new Error('Erreur lors de la lecture du fichier Excel'));
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
    reader.readAsArrayBuffer(file);
  });
};

export const exportToExcel = (students: Student[], filename: string = 'eleves.xlsx'): void => {
  const data = students.map((s, index) => ({
    'N°': index + 1,
    'NOMS': s.nom,
    'PRÉNOMS': s.prenom,
    'CLASSE': s.classe,
    'TELEPHONE': s.telephone,
    'SEXE': s.sexe,
    'REDOUBLANT': s.redoublant ? 'Oui' : 'Non',
    'ÉCOLE DE PROVENANCE': s.ecoleProvenance,
    'ÉCOLAGE': s.ecolage,
    'DÉJÀ PAYÉ': s.dejaPaye,
    'RESTANT': s.restant === 0 ? 'SOLDÉ' : s.restant,
    'REÇU': s.recu
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Élèves');
  
  // Auto-size columns
  const colWidths = [
    { wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
    { wch: 15 }, { wch: 6 }, { wch: 12 }, { wch: 25 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
  ];
  worksheet['!cols'] = colWidths;
  
  XLSX.writeFile(workbook, filename);
};

export const exportClassToExcel = (students: Student[], classe: string): void => {
  const filtered = students.filter(s => s.classe === classe);
  exportToExcel(filtered, `eleves_${classe.replace(/\s/g, '_')}.xlsx`);
};

export const exportNonSoldesToExcel = (students: Student[]): void => {
  const filtered = students.filter(s => s.restant > 0);
  exportToExcel(filtered, 'eleves_non_soldes.xlsx');
};
