// backend/integration-tests/setup_test_db.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pg = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const scriptsDir = path.join(rootDir, 'scripts');

const sqlFiles = [
  path.join(__dirname, 'bootstrap_parent_pack_test_db.sql'),
  path.join(scriptsDir, '03_add_affiliate_system.sql'),
  path.join(scriptsDir, 'migration_p2_fedapay_webhook_security.sql'),
  path.join(scriptsDir, 'migration_p13_affiliate_financial_ledger.sql'),
  path.join(scriptsDir, 'migration_p19_parent_pack_foundation.sql'),
  path.join(scriptsDir, 'migration_p24_parent_pack_global_student_checkout.sql'),
  path.join(scriptsDir, 'migration_p27_parent_pack_reconciliation_defense.sql')
];

async function applySqlFiles() {
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log(`[setup-db] Connected to PostgreSQL (${databaseUrl.replace(/:[^:]*@/, ':****@')})`);

    for (const filePath of sqlFiles) {
      const relPath = path.relative(path.resolve(rootDir, '..'), filePath).replace(/\\/g, '/');
      console.log(`[setup-db] Applying ${relPath}...`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`[setup-db] Success: ${relPath}`);
    }

    console.log('[setup-db] All prerequisite tables and functions applied.');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('[setup-db] Initialization failed:', err.message);
    if (err.detail) console.error('[setup-db] Detail:', err.detail);
    if (err.where) console.error('[setup-db] Where:', err.where);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

applySqlFiles();
