'use strict';
// donationProposalAdminMigration.test.js
// Static tests validating migration_p12_donation_proposals_admin_audit.sql content.
// Parses SQL text without execution. Uses node:test.

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve('backend/scripts/migration_p12_donation_proposals_admin_audit.sql');
let sql = '';
let sqlCode = '';

before(() => {
  sql = readFileSync(migrationPath, 'utf8');
  sqlCode = sql.replace(/--.*$/gm, '');
});

describe('1. Transaction control and forbidden autonomous statements', () => {
  test('does NOT contain autonomous COMMIT', () => {
    assert.doesNotMatch(sqlCode, /^\s*COMMIT\s*;/im, 'COMMIT must NOT be in the executable migration file');
  });

  test('does NOT contain autonomous BEGIN', () => {
    assert.doesNotMatch(sqlCode, /^\s*BEGIN\s*;/im, 'BEGIN must NOT be in the executable migration file (controlled by runner)');
  });

  test('no placeholders or TODO comments', () => {
    assert.doesNotMatch(sql, /TODO|FIXME|placeholder|à compléter/i, 'Forbidden placeholder found');
  });
});

describe('2. Table and column constraints', () => {
  test('alters donation_proposals with reviewed_by UUID referencing superadmins', () => {
    assert.match(sqlCode, /reviewed_by\s+uuid\s+REFERENCES\s+public\.superadmins\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i);
  });

  test('contains internal_notes max 1000 length check', () => {
    assert.match(sqlCode, /chk_internal_notes_length/i);
    assert.match(sqlCode, /length\s*\(\s*internal_notes\s*\)\s*<=\s*1000/i);
  });

  test('creates donation_proposal_audit_logs with ON DELETE RESTRICT on proposal_id and actor_id', () => {
    assert.match(sqlCode, /proposal_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.donation_proposals\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i);
    assert.match(sqlCode, /actor_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.superadmins\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i);
  });

  test('audit table enforces CHECK constraints on old_status, new_status, note and actor_name', () => {
    assert.match(sqlCode, /chk_audit_old_status/i);
    assert.match(sqlCode, /chk_audit_new_status/i);
    assert.match(sqlCode, /chk_audit_note_length/i);
    assert.match(sqlCode, /chk_audit_actor_name_length/i);
  });

  test('audit table has RLS enabled and all privileges revoked', () => {
    assert.match(sqlCode, /ALTER\s+TABLE\s+public\.donation_proposal_audit_logs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.donation_proposal_audit_logs\s+FROM\s+PUBLIC,\s*anon,\s*authenticated,\s*service_role/i);
  });
});

describe('3. Composite Indexes', () => {
  test('creates index on (status, created_at DESC)', () => {
    assert.match(sqlCode, /idx_donation_proposals_status_created\s+ON\s+public\.donation_proposals\s*\(\s*status\s*,\s*created_at\s+DESC\s*\)/i);
  });

  test('creates index on (sector, created_at DESC)', () => {
    assert.match(sqlCode, /idx_donation_proposals_sector_created\s+ON\s+public\.donation_proposals\s*\(\s*sector\s*,\s*created_at\s+DESC\s*\)/i);
  });

  test('creates index on audit logs (proposal_id, created_at ASC)', () => {
    assert.match(sqlCode, /idx_donation_proposal_audit_proposal_id\s+ON\s+public\.donation_proposal_audit_logs\s*\(\s*proposal_id\s*,\s*created_at\s+ASC\s*\)/i);
  });
});

describe('4. SECURITY DEFINER functions security hygiene', () => {
  test('all 3 RPCs set minimal search_path = pg_catalog without public', () => {
    const matches = [...sqlCode.matchAll(/SET\s+search_path\s*=\s*([^;\n]+)/gi)];
    assert.strictEqual(matches.length, 3, 'Expected exactly 3 search_path declarations');
    for (const m of matches) {
      const sp = m[1].trim();
      assert.strictEqual(sp, 'pg_catalog', `search_path must strictly be pg_catalog, got: ${sp}`);
      assert.strictEqual(sp.includes('public'), false, `public must NOT be in search_path: ${sp}`);
    }
  });

  test('all 3 RPCs explicitly revoke execute from PUBLIC, anon, authenticated', () => {
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposals\(text,\s*text,\s*text,\s*int,\s*int\)\s+FROM\s+PUBLIC/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposals\(text,\s*text,\s*text,\s*int,\s*int\)\s+FROM\s+anon/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposals\(text,\s*text,\s*text,\s*int,\s*int\)\s+FROM\s+authenticated/i);
    assert.match(sqlCode, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_donation_proposals\(text,\s*text,\s*text,\s*int,\s*int\)\s+TO\s+service_role/i);

    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposal_by_id\(uuid\)\s+FROM\s+PUBLIC/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposal_by_id\(uuid\)\s+FROM\s+anon/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_donation_proposal_by_id\(uuid\)\s+FROM\s+authenticated/i);
    assert.match(sqlCode, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_donation_proposal_by_id\(uuid\)\s+TO\s+service_role/i);

    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.update_donation_proposal_status\(uuid,\s*text,\s*text,\s*text,\s*uuid\)\s+FROM\s+PUBLIC/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.update_donation_proposal_status\(uuid,\s*text,\s*text,\s*text,\s*uuid\)\s+FROM\s+anon/i);
    assert.match(sqlCode, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.update_donation_proposal_status\(uuid,\s*text,\s*text,\s*text,\s*uuid\)\s+FROM\s+authenticated/i);
    assert.match(sqlCode, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.update_donation_proposal_status\(uuid,\s*text,\s*text,\s*text,\s*uuid\)\s+TO\s+service_role/i);
  });

  test('update RPC implements FOR UPDATE locking and optimistic p_expected_status check', () => {
    assert.match(sqlCode, /FOR\s+UPDATE/i, 'Row locking FOR UPDATE is mandatory');
    assert.match(sqlCode, /p_expected_status/i, 'p_expected_status parameter is mandatory');
    assert.match(sqlCode, /STATUS_CONFLICT/i, 'STATUS_CONFLICT exception is mandatory');
    assert.match(sqlCode, /INVALID_STATUS_TRANSITION/i, 'INVALID_STATUS_TRANSITION exception is mandatory');
    assert.match(sqlCode, /ACTOR_NOT_FOUND/i, 'ACTOR_NOT_FOUND check is mandatory');
  });
});
