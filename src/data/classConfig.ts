// ============================================================
// CONFIGURATION DES CLASSES ET ÉCOLAGES
// ============================================================
import { ClassConfig, Cycle } from '../types';

export const CLASS_CONFIG_FR: ClassConfig[] = [
  // Primaire — 50 000 FCFA
  { name: 'CP1', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'CP2', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'CE1', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'CE2', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'CM1', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  
  // Primaire / Maternelle — 55 000 FCFA
  { name: 'CI',  cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 55000 },
  { name: 'CI 1', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 55000 },
  { name: 'CI 2', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 55000 },
  { name: 'CM2', cycle: 'Primaire', billingCategory: 'maternelle_primaire', ecolage: 55000 },

  // Collège — 60 000 FCFA
  { name: '6EME', cycle: 'Collège', billingCategory: 'college_secondaire', ecolage: 60000 },
  { name: '5EME', cycle: 'Collège', billingCategory: 'college_secondaire', ecolage: 60000 },
  { name: '4EME', cycle: 'Collège', billingCategory: 'college_secondaire', ecolage: 60000 },
  
  // Collège — 70 000 FCFA
  { name: '3EME', cycle: 'Collège', billingCategory: 'college_secondaire', ecolage: 70000 },

  // Lycée — 75 000 FCFA
  { name: '2nde S',  cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 75000 },
  { name: '2nde A4', cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 75000 },

  // Lycée — 85 000 FCFA
  { name: '1er A4', cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 85000 },
  { name: '1er D',  cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 85000 },

  // Lycée — 95 000 FCFA
  { name: 'Tle A4', cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 95000 },
  { name: 'Tle D',  cycle: 'Lycée', billingCategory: 'college_secondaire', ecolage: 95000 },
];

export const CLASS_CONFIG_EN: ClassConfig[] = [
  // Kindergarten — 55 000 FCFA equiv
  { name: 'Kindergarten 1', cycle: 'Kindergarten', billingCategory: 'maternelle_primaire', ecolage: 55000 },
  { name: 'Kindergarten 2', cycle: 'Kindergarten', billingCategory: 'maternelle_primaire', ecolage: 55000 },

  // Primary School — 50 000 FCFA equiv
  { name: 'Grade 1', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'Grade 2', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'Grade 3', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'Grade 4', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'Grade 5', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },
  { name: 'Grade 6', cycle: 'Primary School', billingCategory: 'maternelle_primaire', ecolage: 50000 },

  // Middle School — 60 000 FCFA equiv
  { name: 'Grade 7', cycle: 'Middle School', billingCategory: 'college_secondaire', ecolage: 60000 },
  { name: 'Grade 8', cycle: 'Middle School', billingCategory: 'college_secondaire', ecolage: 60000 },
  { name: 'Grade 9', cycle: 'Middle School', billingCategory: 'college_secondaire', ecolage: 60000 },

  // High School — 80 000 FCFA equiv
  { name: 'Grade 10', cycle: 'High School', billingCategory: 'college_secondaire', ecolage: 80000 },
  { name: 'Grade 11', cycle: 'High School', billingCategory: 'college_secondaire', ecolage: 80000 },
  { name: 'Grade 12', cycle: 'High School', billingCategory: 'college_secondaire', ecolage: 80000 },
];

// Fallback legacy (used if needed)
export const CLASS_CONFIG = CLASS_CONFIG_FR;

const ANGLOPHONE_COUNTRIES = ['GH', 'NG', 'LR', 'SL', 'GM', 'US', 'GB', 'CA', 'AU', 'NZ', 'ZA', 'KE', 'UG', 'TZ', 'RW', 'ZM', 'ZW'];

export function getDefaultClasses(language?: string | null, countryCode?: string | null): ClassConfig[] {
  // 1. Priorité absolue à la langue de l'interface
  if (language && language.startsWith('en')) {
    return CLASS_CONFIG_EN;
  }
  // 2. Si la langue n'est pas claire, on regarde le pays
  if (countryCode && ANGLOPHONE_COUNTRIES.includes(countryCode.toUpperCase())) {
    return CLASS_CONFIG_EN;
  }
  return CLASS_CONFIG_FR;
}

// Normalise pour la recherche flexible (essentiel pour Excel)
const normalize = (s: string): string => {
  if (!s) return '';
  let n = String(s).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/[^a-z0-9]/g, '');                       // retire tout sauf alphanum
  
  // Harmoniser les variations (ex: 1er vs 1ere, 6e vs 6eme)
  n = n.replace(/1ere/g, '1er');
  n = n.replace(/ere/g, 'er');
  n = n.replace(/eme/g, 'e');
  return n;
};

export const getClassConfig = (className: string, language?: string | null, countryCode?: string | null): ClassConfig | undefined => {
  const key = normalize(className);
  const configs = getDefaultClasses(language, countryCode);
  // On priorise la correspondance exacte (normalisée)
  return configs.find((c) => normalize(c.name) === key);
};

export const getEcolage = (className: string, language?: string | null, countryCode?: string | null): number => {
  const config = getClassConfig(className, language, countryCode);
  return config ? config.ecolage : 60000;
};

export const getCycle = (className: string, language?: string | null, countryCode?: string | null): Cycle => {
  const config = getClassConfig(className, language, countryCode);
  return config ? config.cycle : ((language?.startsWith('en') || (countryCode && ANGLOPHONE_COUNTRIES.includes(countryCode.toUpperCase()))) ? 'Primary School' : 'Primaire');
};
