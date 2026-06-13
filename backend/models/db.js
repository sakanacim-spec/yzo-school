// ============================================================
// MODÈLE DONNÉES — JSON Local (Mode Simple)
// Permet de fonctionner sans compilation native (vs SQLite)
// ============================================================
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'edufinance_db.json');

// Structure par défaut de la "Base de données"
const DEFAULT_DB = {
  students: [],
  payments: [],
  parents: [],
  parent_student: [], // Relationships { parent_id, student_id }
  badges: [],
  messages: []
};

let _cache = null;

/**
 * Charge les données depuis le fichier JSON.
 */
function getDb() {
  if (_cache) return _cache;

  if (!fs.existsSync(DATA_PATH)) {
    saveDb(DEFAULT_DB);
    _cache = JSON.parse(JSON.stringify(DEFAULT_DB));
    return _cache;
  }

  try {
    const data = fs.readFileSync(DATA_PATH, 'utf-8');
    _cache = JSON.parse(data);
    return _cache;
  } catch (err) {
    console.error('❌ Erreur lecture DB JSON:', err.message);
    return DEFAULT_DB;
  }
}

/**
 * Sauvegarde le cache dans le fichier JSON.
 */
function saveDb(data = _cache) {
  try {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
    _cache = data;
    return true;
  } catch (err) {
    console.error('❌ Erreur sauvegarde DB JSON:', err.message);
    return false;
  }
}

/**
 * Initialise la DB (vide pour le moment si pas de fichier).
 */
function initDb() {
  const db = getDb();
  console.log('📦 Base de données JSON chargée.');
  return db;
}

/**
 * Seed : compte démo parent
 */
async function seedDemoParent() {
  const db = getDb();
  const DEMO_PHONE = '90000000';

  const existing = db.parents.find(p => p.telephone === DEMO_PHONE);
  if (existing) return;

  try {
    const hashed = await bcrypt.hash('demo123', 10);
    const now = new Date().toISOString();
    const demoId = 'parent-demo-id';

    db.parents.push({
      id: demoId,
      nom: 'Parent Demo',
      telephone: DEMO_PHONE,
      password: hashed,
      created_at: now
    });

    // Lier au premier élève s'il existe
    if (db.students.length > 0) {
      const studentId = db.students[0].id;
      db.parent_student.push({ parent_id: demoId, student_id: studentId });

      // Badge de bienvenue
      db.badges.push({
        id: Date.now(),
        parent_id: demoId,
        student_id: studentId,
        code: 'welcome',
        label: 'Parent Responsable',
        description: 'Compte créé avec succès',
        icon: '⭐',
        earned_at: now
      });

      // Message de bienvenue
      db.messages.push({
        id: Date.now() + 1,
        parent_id: demoId,
        title: 'Bienvenue sur le portail Parent',
        content: 'Chers parents, bienvenue sur notre nouvelle plateforme. Suivez la scolarité de vos enfants en temps réel.',
        type: 'info',
        date: now
      });
    }

    saveDb();
    console.log('👤 Compte démo JSON créé : 90000000 / demo123');
  } catch (err) {
    console.error('❌ Erreur Seed Demo:', err.message);
  }
}

module.exports = { getDb, saveDb, initDb, seedDemoParent };
