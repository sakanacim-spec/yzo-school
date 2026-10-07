// backend/config/parentPackClassifications.js
const CLASS_CONFIG_FR = {
  'CP1': 'maternelle_primaire',
  'CP2': 'maternelle_primaire',
  'CE1': 'maternelle_primaire',
  'CE2': 'maternelle_primaire',
  'CM1': 'maternelle_primaire',
  'CI': 'maternelle_primaire',
  'CI 1': 'maternelle_primaire',
  'CI 2': 'maternelle_primaire',
  'CM2': 'maternelle_primaire',
  '6EME': 'college_secondaire',
  '5EME': 'college_secondaire',
  '4EME': 'college_secondaire',
  '3EME': 'college_secondaire',
  '2nde S': 'college_secondaire',
  '2nde A4': 'college_secondaire',
  '1er A4': 'college_secondaire',
  '1er D': 'college_secondaire',
  'Tle A4': 'college_secondaire',
  'Tle D': 'college_secondaire'
};

const CLASS_CONFIG_EN = {
  'Kindergarten 1': 'maternelle_primaire',
  'Kindergarten 2': 'maternelle_primaire',
  'Grade 1': 'maternelle_primaire',
  'Grade 2': 'maternelle_primaire',
  'Grade 3': 'maternelle_primaire',
  'Grade 4': 'maternelle_primaire',
  'Grade 5': 'maternelle_primaire',
  'Grade 6': 'maternelle_primaire',
  'Grade 7': 'college_secondaire',
  'Grade 8': 'college_secondaire',
  'Grade 9': 'college_secondaire',
  'Grade 10': 'college_secondaire',
  'Grade 11': 'college_secondaire',
  'Grade 12': 'college_secondaire'
};

function normalizeClass(className) {
  if (!className || typeof className !== 'string') return '';
  let n = className.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  n = n.replace(/1ere/g, '1er');
  n = n.replace(/ere/g, 'er');
  n = n.replace(/eme/g, 'e');
  return n;
}

const normalizedCatalog = new Map();
function buildCatalog() {
  const allConfigs = { ...CLASS_CONFIG_FR, ...CLASS_CONFIG_EN };
  for (const [rawName, category] of Object.entries(allConfigs)) {
    const key = normalizeClass(rawName);
    if (!key) continue;
    if (normalizedCatalog.has(key)) {
      const existingCategory = normalizedCatalog.get(key);
      if (existingCategory !== category) {
        throw new Error(`CLASS_COLLISION: ${rawName} normalise en ${key} a des categories incompatibles (${existingCategory} vs ${category})`);
      }
    } else {
      normalizedCatalog.set(key, category);
    }
  }
}

buildCatalog();

function resolveCycleName(className) {
  const key = normalizeClass(className);
  if (!key || !normalizedCatalog.has(key)) {
    const err = new Error('CLASS_UNKNOWN');
    err.code = 'CLASS_UNKNOWN';
    throw err;
  }
  return normalizedCatalog.get(key);
}

module.exports = {
  CLASS_CONFIG_FR,
  CLASS_CONFIG_EN,
  resolveCycleName,
  normalizeClass
};
