interface ClassInfo {
  nom: string;
  cycle: 'Primaire' | 'Collège' | 'Lycée';
  ecolage: number;
}

export const CLASSES: ClassInfo[] = [
  // Primaire (50 000)
  { nom: 'CP1', cycle: 'Primaire', ecolage: 50000 },
  { nom: 'CP2', cycle: 'Primaire', ecolage: 50000 },
  { nom: 'CE1', cycle: 'Primaire', ecolage: 50000 },
  { nom: 'CE2', cycle: 'Primaire', ecolage: 50000 },
  { nom: 'CM1', cycle: 'Primaire', ecolage: 50000 },
  
  // Primaire / Maternelle (55 000)
  { nom: 'CI', cycle: 'Primaire', ecolage: 55000 },
  { nom: 'CI 1', cycle: 'Primaire', ecolage: 55000 },
  { nom: 'CI 2', cycle: 'Primaire', ecolage: 55000 },
  { nom: 'CM2', cycle: 'Primaire', ecolage: 55000 },

  // Collège (60 000)
  { nom: '6EME', cycle: 'Collège', ecolage: 60000 },
  { nom: '5EME', cycle: 'Collège', ecolage: 60000 },
  { nom: '4EME', cycle: 'Collège', ecolage: 60000 },
  
  // Collège (70 000)
  { nom: '3EME', cycle: 'Collège', ecolage: 70000 },

  // Lycée (75 000)
  { nom: '2nde S', cycle: 'Lycée', ecolage: 75000 },
  { nom: '2nde A4', cycle: 'Lycée', ecolage: 75000 },

  // Lycée (85 000)
  { nom: '1er A4', cycle: 'Lycée', ecolage: 85000 },
  { nom: '1er D', cycle: 'Lycée', ecolage: 85000 },

  // Lycée (95 000)
  { nom: 'Tle A4', cycle: 'Lycée', ecolage: 95000 },
  { nom: 'Tle D', cycle: 'Lycée', ecolage: 95000 },
];

export const getEcolageByClass = (className: string): number => {
  const classInfo = CLASSES.find(c => c.nom.toLowerCase() === className.toLowerCase());
  return classInfo?.ecolage || 60000;
};

export const getCycleByClass = (className: string): 'Primaire' | 'Collège' | 'Lycée' => {
  const classInfo = CLASSES.find(c => c.nom.toLowerCase() === className.toLowerCase());
  if (classInfo) return classInfo.cycle;
  
  const upper = className.toUpperCase();
  if (['CI', 'CP', 'CE', 'CM'].some(p => upper.includes(p))) return 'Primaire';
  if (['6E', '5E', '4E', '3E'].some(p => upper.includes(p))) return 'Collège';
  return 'Lycée';
};

export const getClassesByCycle = (cycle: 'Primaire' | 'Collège' | 'Lycée'): ClassInfo[] => {
  return CLASSES.filter(c => c.cycle === cycle);
};
