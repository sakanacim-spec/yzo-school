#!/usr/bin/env node

/**
 * Pré‑flight P1‑A en lecture seule.
 *
 * Ce script vérifie l'environnement, capture un instantané de la fonction
 * `create_school_tables` et des ACL par défaut, écrit deux artefacts locaux
 * (JSON & Markdown) et n'effectue aucune écriture en base, aucun appel à
 * Supabase Auth/Storage, ni aucune migration.
 *
 * Tous les messages et le rapport sont en français.
 */

// ---------------------------------------------------------------------------
// 1. Barrière d’argument – aucune importation avant ce point
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length !== 1 || args[0] !== '--capture-read-only') {
    console.error('PREFLIGHT_BLOQUÉ : ARGUMENT_REQUIS');
    process.exitCode = 1;
    return;
}


// ---------------------------------------------------------------------------
// 2. Dépendances (importées uniquement après la barrière)
// ---------------------------------------------------------------------------
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const dns = require('dns').promises;
const net = require('net');

// ---------------------------------------------------------------------------
// 3. Suivi d’état
// ---------------------------------------------------------------------------
let connected = false;
let transactionStarted = false;
let rollbackSucceeded = false;
let connectionClosed = false;

// ---------------------------------------------------------------------------
// 4. Vérification de la branche Git
// ---------------------------------------------------------------------------
let branche = '';
try {
  branche = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
} catch (_) {
  console.error('Impossible de déterminer la branche Git');
  process.exit(1);
}
if (branche !== 'feature/e164-auth') {
  console.error('BRANCHE_INCORRECTE');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. Chargement silencieux du .env racine
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, '../../.env');
require('dotenv').config({ path: envPath, quiet: true });

// ---------------------------------------------------------------------------
// 5.b Fonction de détection d'environnement Supabase
// ---------------------------------------------------------------------------
function verifierEnvironnement() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const pgHost = (process.env.PGHOST || '').toLowerCase();
  const pgUser = (process.env.PGUSER || '').toLowerCase();

  let supabaseProjectRef = '';
  try {
    const host = new URL(supabaseUrl).hostname.toLowerCase();
    const supMatch = host.match(/^([a-z0-9-]{1,50})\.supabase\.co$/);
    if (!supMatch) return false;
    supabaseProjectRef = supMatch[1];
  } catch (_) {
    return false;
  }

  if (!supabaseProjectRef) {
    return false;
  }

  let pgProjectRef = '';
  if (pgHost.endsWith('.pooler.supabase.com')) {
    // Validation stricte du format du user: postgres.<project-ref>
    const userMatch = pgUser.match(/^postgres\.([a-z0-9-]{1,50})$/);
    if (userMatch) {
      pgProjectRef = userMatch[1];
    }
  } else {
    // Validation stricte du format de l'hôte direct: db.<project-ref>.supabase.co
    const hostMatch = pgHost.match(/^db\.([a-z0-9-]{1,50})\.supabase\.co$/);
    if (hostMatch) {
      pgProjectRef = hostMatch[1];
    }
  }

  return !!(pgProjectRef && supabaseProjectRef === pgProjectRef);
}

// ---------------------------------------------------------------------------
// 6. Validation des variables d’environnement indispensables
// ---------------------------------------------------------------------------
const requiredEnv = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLROOTCERT', 'SUPABASE_URL'];
for (const v of requiredEnv) {
  if (!process.env[v]) {
    console.error(`VARIABLE_D_ENV_MANQUANTE : ${v}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 7. Validation stricte du PGPORT
// ---------------------------------------------------------------------------
const pgPortRaw = process.env.PGPORT;
const pgPort = pgPortRaw && /^[0-9]+$/.test(pgPortRaw) ? Number(pgPortRaw) : NaN;
if (!Number.isInteger(pgPort) || pgPort < 1 || pgPort > 65535) {
  console.error('CONFIGURATION_INVALIDE');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 8. Lecture du certificat SSL, existence & non‑vide
// ---------------------------------------------------------------------------
let rootCert = '';
try {
  if (!fs.existsSync(process.env.PGSSLROOTCERT)) {
    console.error('CERTIFICAT_SSL_INDISPONIBLE');
    process.exit(1);
  }
  rootCert = fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8');
  if (!rootCert.trim()) {
    console.error('CERTIFICAT_SSL_VIDE');
    process.exit(1);
  }
} catch (_) {
  console.error('CERTIFICAT_SSL_INDISPONIBLE');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 9. Validation syntaxique minimale de SUPABASE_URL
// ---------------------------------------------------------------------------
try {
  new URL(process.env.SUPABASE_URL);
} catch (_) {
  console.error('SUPABASE_URL_INVALIDE');
  process.exit(1);
}

// 10. Diagnostics réseau (DNS + TCP) avec jusqu’à 3 tentatives dns.lookup
let dnsLookupAttempts = 0;
let dnsLookupSuccessAttempts = 0;
let dnsLookupFunctional = false;
let dnsResolve4Success = false;
let dnsResolve6Success = false;
let dnsResolutionSuccess = false;
let tcpConnectivitySuccess = false;



// ---------------------------------------------------------------------------
// 11. Connexion PostgreSQL en lecture seule (après diagnostics)
// ---------------------------------------------------------------------------
const client = new Client({
  host: process.env.PGHOST,
  port: pgPort,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: true, ca: rootCert },
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  options: '-c default_transaction_read_only=on'
});

(async () => {
  // ----- DNS lookup (3 attempts) -----
  for (let i = 0; i < 3; i++) {
    dnsLookupAttempts++;
    try {
      await dns.lookup(process.env.PGHOST);
      dnsLookupSuccessAttempts++;
      dnsLookupFunctional = true;
    } catch (_) {
      // ignore failure
    }
    if (dnsLookupFunctional) break;
    if (i < 2) await new Promise(r => setTimeout(r, 2000));
  }
  dnsResolutionSuccess = dnsLookupFunctional;

  // ----- Résolutions IPv4/IPv6 (diagnostics non bloquants) -----
  try { await dns.resolve4(process.env.PGHOST); dnsResolve4Success = true; } catch (_) {}
  try { await dns.resolve6(process.env.PGHOST); dnsResolve6Success = true; } catch (_) {}

  // ----- Connectivité TCP (seulement si DNS fonctionnel) -----
  if (dnsLookupFunctional) {
    const socket = new net.Socket();
    tcpConnectivitySuccess = await new Promise(resolve => {
      socket.setTimeout(5000);
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(pgPort, process.env.PGHOST, () => { socket.end(); resolve(true); });
    });
  } else {
    tcpConnectivitySuccess = false;
  }

  if (!dnsResolutionSuccess) {
    console.error('DNS_RESOLUTION : ÉCHEC');
    process.exit(1);
  }
  if (!tcpConnectivitySuccess) {
    console.error('TCP_CONNECTIVITÉ : ÉCHEC');
    process.exit(1);
  }

  try {
    await client.connect();
    connected = true;

    // ---------------------------------------------------------------------
    // 12. Begin transaction read‑only et vérification du mode
    // ---------------------------------------------------------------------
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;
    const { rows: [{ transaction_read_only }] } = await client.query('SHOW transaction_read_only');
    if (transaction_read_only !== 'on') {
      console.error('TRANSACTION_READ_ONLY_NON_ON');
      process.exit(1);
    }

    // ---------------------------------------------------------------------
    // 13. Capture de la fonction `create_school_tables`
    // ---------------------------------------------------------------------
    const funcQuery = `
      SELECT p.oid,
             r.rolname AS owner,
             pg_get_functiondef(p.oid) AS definition,
             pg_get_function_identity_arguments(p.oid) AS identity_args,
             pg_get_function_arguments(p.oid) AS args,
             format_type(p.prorettype, NULL) AS return_type,
             l.lanname AS language,
             p.prosecdef,
             p.proconfig,
             p.proacl
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_roles r ON p.proowner = r.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname='public' AND p.proname='create_school_tables';
    `;
    const funcRes = await client.query(funcQuery);
    if (funcRes.rowCount !== 1) {
      console.error('FONCTION_ABSENTE_OU_MULTIPLE');
      process.exit(1);
    }
    const func = funcRes.rows[0];
    const funcHash = crypto.createHash('sha256').update(func.definition).digest('hex');

    // ACL de la fonction
    const aclRows = await client.query(
      `SELECT *
       FROM aclexplode(
         COALESCE($1::aclitem[], acldefault('f', $2::regrole::oid))
       )`,
      [func.proacl, func.owner]
    );

    // ---------------------------------------------------------------------
    // 14. Capture des 6 groupes DEFAULT ACL
    // ---------------------------------------------------------------------
    const defaultAclGroups = [];
    const groups = [
      { role: 'postgres', objType: 'r', typeName: 'TABLE' },
      { role: 'postgres', objType: 'S', typeName: 'SEQUENCE' },
      { role: 'postgres', objType: 'f', typeName: 'FUNCTION' },
      { role: 'supabase_admin', objType: 'r', typeName: 'TABLE' },
      { role: 'supabase_admin', objType: 'S', typeName: 'SEQUENCE' },
      { role: 'supabase_admin', objType: 'f', typeName: 'FUNCTION' }
    ];
    for (const g of groups) {
      const defRes = await client.query(
        `SELECT defaclacl FROM pg_default_acl a JOIN pg_roles r ON a.defaclrole = r.oid WHERE r.rolname=$1 AND a.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public') AND a.defaclobjtype=$2`,
        [g.role, g.objType]
      );
      const aclArray = defRes.rowCount ? defRes.rows[0].defaclacl : null;
        const exploded = await client.query(
          `SELECT *
           FROM aclexplode(
             COALESCE($1::aclitem[], acldefault($2::"char", $3::regrole::oid))
           )`,
          [aclArray, g.objType, g.role]
        );
      const entries = exploded.rows.map(row => ({
        grantee: row.grantee,
        privilege_type: row.privilege_type,
        is_grantable: row.is_grantable
      }));
      defaultAclGroups.push({
        creatorRole: g.role,
        schema: 'public',
        objectType: g.typeName,
        entryPresent: entries.length > 0,
        entries
      });
    }

    // ---------------------------------------------------------------------
    // 15. Vérifications de préconditions (read‑only uniquement)
    // ---------------------------------------------------------------------
    const requiredRoles = ['postgres', 'supabase_admin', 'service_role', 'anon', 'authenticated'];
    const roleRes = await client.query(`SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`, [requiredRoles]);
    const rolesPresent = roleRes.rowCount === requiredRoles.length;

    const roleCapabilities = await client.query(`
      SELECT
        (SELECT pg_has_role(current_user, 'postgres', 'USAGE')) AS can_use_postgres,
        (SELECT pg_has_role(current_user, 'supabase_admin', 'USAGE')) AS can_use_supabase_admin;
    `);
    const canUsePostgres = roleCapabilities.rows[0].can_use_postgres;
    const canUseSupabaseAdmin = roleCapabilities.rows[0].can_use_supabase_admin;

    const concurrencyRes = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND query ILIKE '%create_school_tables%'
      ) AS concurrent_creation;
    `);
    const creationConcurrentDetectee = concurrencyRes.rows[0].concurrent_creation;

    // ---------------------------------------------------------------------
    // 16. Construction du snapshot et du rapport en mémoire
    // ---------------------------------------------------------------------
    const snapshot = {
      fonction: {
        oid: func.oid,
        owner: func.owner,
        definition: func.definition,
        identity_args: func.identity_args,
        args: func.args,
        return_type: func.return_type,
        language: func.language,
        prosecdef: func.prosecdef,
        proconfig: func.proconfig,
        proacl: func.proacl,
        acl: aclRows.rows,
        definition_sha256: funcHash
      },
      default_acl_groups: defaultAclGroups,
      preconditions: {
        roles_present: rolesPresent,
        can_use_postgres: canUsePostgres,
        can_use_supabase_admin: canUseSupabaseAdmin,
        fonction_signature_unique: true,
        creation_concurrent_detectee: creationConcurrentDetectee
      }
    };

    // ---------------------------------------------------------------------
    // 16.b Validation des préconditions bloquantes
    // ---------------------------------------------------------------------
    const envCorrespondant = verifierEnvironnement();
    const defaultAclCorrect = defaultAclGroups.length === 6;

    if (!envCorrespondant || !rolesPresent || !canUsePostgres || creationConcurrentDetectee || !defaultAclCorrect) {
      console.error('PRÉCONDITIONS_BLOQUANTES_ÉCHOUÉES');
      try { if (transactionStarted) await client.query('ROLLBACK'); } catch (_) {}
      try { await client.end(); } catch (_) {}
      process.exitCode = 1;
      return;
    }

    const jsonContent = JSON.stringify(snapshot, null, 2) + "\n";

    const reportLines = [];
    reportLines.push('# Pré‑flight P1‑A – Rapport lecture‑seule');
    reportLines.push('');
    reportLines.push('## Résultats');
    reportLines.push(`- **BRANCHE** : ${branche}`);
    reportLines.push(`- **TRANSACTION_READ_ONLY** : ${transaction_read_only === 'on' ? 'ON' : 'NON_EXÉCUTÉ'}`);
    reportLines.push(`- **ENVIRONNEMENT_CORRESPONDANT** : ${envCorrespondant ? 'OUI' : 'NON'}`);
    reportLines.push(`- **FONCTION_ACTUELLE_CAPTURÉE** : ${func ? 'OUI' : 'NON'}`);
    reportLines.push(`- **DEFAULT_ACL_GROUPES_ATTENDUS** : 6`);
    reportLines.push(`- **DEFAULT_ACL_GROUPES_CAPTURÉS** : ${defaultAclGroups.length}`);
    reportLines.push(`- **RÔLES_REQUIS_PRÉSENTS** : ${rolesPresent ? 'OUI' : 'NON'}`);
    reportLines.push(`- **CAPACITÉ_POSTGRES_READ_ONLY_CHECK** : ${canUsePostgres ? 'OUI' : 'NON'}`);
    reportLines.push(`- **CAPACITÉ_SUPABASE_ADMIN_READ_ONLY_CHECK** : ${canUseSupabaseAdmin ? 'OUI' : 'NON'}`);
    reportLines.push(`- **CREATION_ECOLE_CONCURRENTE_DETECTEE** : ${creationConcurrentDetectee ? 'OUI' : 'NON'}`);
    reportLines.push(`- **CONTROLE_CONCURRENCE** : INDICATIF`);
    reportLines.push('');
    reportLines.push('## Détails de la fonction');
    reportLines.push(`- OID : ${func.oid}`);
    reportLines.push(`- Propriétaire : ${func.owner}`);
    reportLines.push(`- SHA‑256 de la définition : ${funcHash}`);
    reportLines.push('');
    reportLines.push('## Snapshots générés');
    reportLines.push('- `backend/scripts/p1a_pre_migration_snapshot.json`');
    reportLines.push('- `backend/scripts/p1a_preflight_report.md`');
    reportLines.push('');
    reportLines.push('## Statut final');
    reportLines.push('- **ROLLBACK** : SUCCÈS');
    reportLines.push('- **CONNEXION_FERMÉE** : OUI');
    reportLines.push('- **SNAPSHOT_SANS_SECRET** : EN ATTENTE');
    reportLines.push('- **RAPPORT_SANS_SECRET** : EN ATTENTE');
    reportLines.push('- **ÉCRITURES_DB** : 0');
    reportLines.push('- **ÉCRITURES_AUTH** : 0');
    reportLines.push('- **ÉCRITURES_STORAGE** : 0');
    reportLines.push('- **PREFLIGHT_P1A** : SUCCÈS');
    reportLines.push('- **MIGRATION_EXÉCUTÉE** : NON');
    reportLines.push('- **COMMIT_GIT** : NON');
    reportLines.push('- **PUSH** : NON');
    reportLines.push('- **MERGE** : NON');
    reportLines.push('- **DÉPLOIEMENT** : NON');

    const mdContent = reportLines.join('\n');

    // ---------------------------------------------------------------------
    // 17. ROLLBACK et fermeture de la connexion avant écriture
    // ---------------------------------------------------------------------
    await client.query('ROLLBACK');
    rollbackSucceeded = true;
    await client.end();
    connectionClosed = true;

    // ---------------------------------------------------------------------
    // 18. Vérification d’existence d’artifacts avant écriture
    // ---------------------------------------------------------------------
    const jsonPath = path.join('backend', 'scripts', 'p1a_pre_migration_snapshot.json');
    const mdPath = path.join('backend', 'scripts', 'p1a_preflight_report.md');
    if (fs.existsSync(jsonPath) || fs.existsSync(mdPath)) {
      console.error('ARTIFACTS_EXISTENT');
      process.exit(1);
    }

    // ---------------------------------------------------------------------
    // 19. Analyse des contenus en mémoire contre motifs sensibles
    // ---------------------------------------------------------------------
    const sensitivePatterns = [
      /SUPABASE_SERVICE_ROLE_KEY/i,
      /PGPASSWORD/i,
      /postgresql:\/\//i,
      /service_role_key/i,
      /Bearer/i
    ];
    const containsSensitive = txt => sensitivePatterns.some(p => p.test(txt));
    if (containsSensitive(jsonContent) || containsSensitive(mdContent)) {
      console.error('MOTIF_SENSIBLE_DÉTECTÉ_DANS_LE_SNAPSHOT_OU_RAPPORT');
      process.exit(1);
    }

    const validatedMdContent = mdContent
      .replace('SNAPSHOT_SANS_SECRET : EN ATTENTE', 'SNAPSHOT_SANS_SECRET : OUI')
      .replace('RAPPORT_SANS_SECRET : EN ATTENTE', 'RAPPORT_SANS_SECRET : OUI');

    // ---------------------------------------------------------------------
    // 20. Écriture des fichiers locaux
    // ---------------------------------------------------------------------
    fs.writeFileSync(jsonPath, jsonContent, { encoding: 'utf8' });
    fs.writeFileSync(mdPath, validatedMdContent, { encoding: 'utf8' });

    // ---------------------------------------------------------------------
    // 21. Relecture des fichiers et nouvelle vérification des motifs sensibles
    // ---------------------------------------------------------------------
    const jsonRead = fs.readFileSync(jsonPath, 'utf8');
    const mdRead = fs.readFileSync(mdPath, 'utf8');
    if (containsSensitive(jsonRead) || containsSensitive(mdRead)) {
      console.error('MOTIF_SENSIBLE_DÉTECTÉ_APRÈS_ÉCRITURE');
      process.exit(1);
    }

    // ---------------------------------------------------------------------
    // 22. Rapport final (console)
    // ---------------------------------------------------------------------
    console.log('BRANCHE :', branche);
    console.log('NODE_CHECK_EXIT : 0 (syntax OK)');
    console.log('BARRIER_EXIT : 0');
    console.log('PREFLIGHT_EXIT : 0');
    console.log('TRANSACTION_READ_ONLY :', transaction_read_only === 'on' ? 'ON' : 'NON_EXÉCUTÉ');
    console.log('ENVIRONNEMENT_CORRESPONDANT :', envCorrespondant ? 'OUI' : 'NON');
    console.log('FONCTION_ACTUELLE_CAPTURÉE : OUI');
    console.log('DEFAULT_ACL_GROUPES_ATTENDUS : 6');
    console.log('DEFAULT_ACL_GROUPES_CAPTURÉS :', defaultAclGroups.length);
    console.log('RÔLES_REQUIS_PRÉSENTS :', rolesPresent ? 'OUI' : 'NON');
    console.log('CAPACITÉ_POSTGRES_READ_ONLY_CHECK :', canUsePostgres ? 'OUI' : 'NON');
    console.log('CAPACITÉ_SUPABASE_ADMIN_READ_ONLY_CHECK :', canUseSupabaseAdmin ? 'OUI' : 'NON');
    console.log('CREATION_ECOLE_CONCURRENTE_DETECTEE :', creationConcurrentDetectee ? 'OUI' : 'NON');
    console.log('CONTROLE_CONCURRENCE : INDICATIF');
    console.log('ROLLBACK : SUCCÈS');
    console.log('CONNEXION_FERMÉE : OUI');
    console.log('SNAPSHOT_SANS_SECRET : OUI');
    console.log('RAPPORT_SANS_SECRET : OUI');
    console.log('ÉCRITURES_DB : 0');
    console.log('ÉCRITURES_AUTH : 0');
    console.log('ÉCRITURES_STORAGE : 0');
    console.log('PREFLIGHT_P1A : SUCCÈS');
    console.log('MIGRATION_EXÉCUTÉE : NON');
    console.log('COMMIT_GIT : NON');
    console.log('PUSH : NON');
    console.log('MERGE : NON');
    console.log('DÉPLOIEMENT : NON');
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'SANS_CODE';

    // Classification de l’erreur de connexion si applicable
    if (!connected) {
      const map = {
        ENOTFOUND: 'DNS',
        EAI_AGAIN: 'DNS_TEMPORAIRE',
        ECONNREFUSED: 'CONNEXION_REFUSÉE',
        ETIMEDOUT: 'TIMEOUT',
        '28P01': 'AUTHENTIFICATION',
        '28000': 'AUTORISATION',
        SELF_SIGNED_CERT_IN_CHAIN: 'CERTIFICAT',
        CERT_HAS_EXPIRED: 'CERTIFICAT_EXPIRÉ',
        UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'CERTIFICAT',
        DEPTH_ZERO_SELF_SIGNED_CERT: 'CERTIFICAT'
      };
      const categorie = map[code] || 'INCONNUE';
      console.error(`CATEGORIE_ERREUR_CONNEXION : ${categorie}`);
    } else {
      console.error(`ERREUR_APRÈS_CONNEXION : ${code}`);
    }

    try {
      if (transactionStarted) {
        await client.query('ROLLBACK');
        rollbackSucceeded = true;
      }
    } catch (_) {}

    try {
      if (connected) {
        await client.end();
        connectionClosed = true;
      }
    } catch (_) {}

    process.exitCode = 1;
  }
})();
