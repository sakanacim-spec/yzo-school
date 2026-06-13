// ============================================================
// IMPORT EXCEL — Lecture de la feuille 2 du fichier Excel
// ============================================================
import * as XLSX from 'xlsx';
import { Student } from '../types';
import { getEcolage, getCycle } from '../data/classConfig';

type RawRow = {
  B?: string; C?: string; D?: string; E?: string;
  F?: string; G?: string; H?: string; I?: number;
  J?: number; K?: number | string; L?: string;
  [key: string]: unknown;
};

const parseBoolean = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    return lower === 'oui' || lower === 'yes' || lower === '1' || lower === 'true';
  }
  return Number(val) === 1;
};

const parseSexe = (val: unknown): 'M' | 'F' => {
  if (typeof val === 'string') {
    const upper = val.toUpperCase().trim();
    if (upper === 'F' || upper === 'FILLE' || upper === 'FEMININ') return 'F';
  }
  return 'M';
};

const formatPhone = (val: unknown): string => {
  if (!val) return '';
  const str = String(val).replace(/\s/g, '').replace(/^00228/, '+228').replace(/^228/, '+228');
  if (!str.startsWith('+')) return `+228${str}`;
  return str;
};

export const importFromExcel = async (file: File): Promise<Student[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Utiliser la feuille 2 (index 1)
        const sheetName = workbook.SheetNames[1] ?? workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Lire à partir de la ligne 2 (row 2 = index 1)
        const rows: RawRow[] = XLSX.utils.sheet_to_json(worksheet, {
          header: 'A',
          range: 1, // Commence à la ligne 2 (0-indexed → ligne 1 = headers, ligne 2 = data)
          defval: '',
        });

        const students: Student[] = rows
          .filter((row) => row['B'] && String(row['B']).trim() !== '')
          .map((row) => {
            const nom = String(row['B'] || '').trim();
            const prenom = String(row['C'] || '').trim();
            const classe = String(row['D'] || '').trim();
            const tel = formatPhone(row['E']);
            const sexe = parseSexe(row['F']);
            const redoub = parseBoolean(row['G']);
            const ecole = String(row['H'] || '').trim();
            const ecolage = getEcolage(classe);
            const dejaPaye = Number(row['J']) || 0;
            const restant = Math.max(0, ecolage - dejaPaye);
            const recu = String(row['L'] || '').trim();

            let status: Student['status'] = 'Non soldé';
            if (restant <= 0) status = 'Soldé';
            else if (dejaPaye / ecolage >= 0.7) status = 'Partiel';

            // Generate a valid UUID to avoid Supabase syntax errors
            const studentId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

            return {
              id: studentId,
              nom,
              prenom,
              classe,
              telephone: tel,
              sexe,
              redoublant: redoub,
              ecoleProvenance: ecole,
              ecolage,
              dejaPaye,
              restant,
              recu,
              cycle: getCycle(classe),
              status,
              historiquesPaiements: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          });

        // DÉDUPLICATION INTERNE (si l'Excel contient des doublons)
        const uniqueMap = new Map();
        students.forEach(s => {
          if (!uniqueMap.has(s.id)) uniqueMap.set(s.id, s);
        });

        resolve(Array.from(uniqueMap.values()));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
