'use strict';
// donationProposalMigration.test.js
// Static tests validating the migration SQL file content.
// These are NOT integration tests – they parse the SQL as text only.
// Uses Node's built-in test runner (node --test).

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve('backend/scripts/migration_p11_donation_proposals.sql');
let sql = '';
let sqlCode = '';

before(() => {
  sql = readFileSync(migrationPath, 'utf8');
  // sqlCode removes all single-line SQL comments (-- ...) to test executable statements cleanly
  sqlCode = sql.replace(/--.*$/gm, '');
});

// Helper to isolate a constraint block by its constraint name
function extractConstraint(sqlText, constraintName) {
  const regex = new RegExp(`CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(([\\s\\S]*?)\\)(?:\\s*,|\\s*;|$)`, 'i');
  const match = sqlText.match(regex);
  assert.ok(match, `Constraint ${constraintName} not found`);
  return match[1];
}

// =========================================================================
// 1. Transaction structure
// =========================================================================

describe('transaction structure', () => {
  test('contains BEGIN and COMMIT in code', () => {
    assert.match(sqlCode, /^\s*BEGIN\s*;/im, 'BEGIN not found in executable SQL');
    assert.match(sqlCode, /^\s*COMMIT\s*;/im, 'COMMIT not found in executable SQL');
  });
});

// =========================================================================
// 2. Forbidden patterns (checked against sqlCode)
// =========================================================================

describe('forbidden patterns', () => {
  test('no placeholders or "to complete" comments', () => {
    assert.doesNotMatch(sql, /placeholder/i, 'placeholder comment found');
    assert.doesNotMatch(sql, /à compléter/i, '"à compléter" comment found');
    assert.doesNotMatch(sql, /to be completed/i, '"to be completed" comment found');
    assert.doesNotMatch(sql, /TODO/i, 'TODO comment found');
  });

  test('no CREATE EXTENSION in code', () => {
    assert.doesNotMatch(sqlCode, /CREATE\s+EXTENSION/i, 'CREATE EXTENSION found in executable code');
  });

  test('no random() or base64 in code', () => {
    const lines = sqlCode.split('\n');
    for (const line of lines) {
      if (/gen_random_uuid|gen_random_bytes/i.test(line)) continue;
      assert.doesNotMatch(line, /\brandom\s*\(/i, `Forbidden random() found: ${line.trim()}`);
    }
    assert.doesNotMatch(sqlCode, /base64/i, 'base64 found in executable code');
  });

  test('no CREATE OR REPLACE FUNCTION in code', () => {
    assert.doesNotMatch(sqlCode, /CREATE\s+OR\s+REPLACE\s+FUNCTION/i, 'CREATE OR REPLACE FUNCTION found – must use CREATE FUNCTION');
  });

  test('no ambiguous RETURNING INTO id, reference, status in code', () => {
    assert.doesNotMatch(
      sqlCode,
      /RETURNING\s+id\s*,\s*reference\s*,\s*status\s+INTO\s+id\s*,\s*reference\s*,\s*status/i,
      'Ambiguous RETURNING ... INTO id, reference, status found'
    );
  });

  test('no DROP TABLE, DELETE FROM, TRUNCATE, CASCADE in code', () => {
    assert.doesNotMatch(sqlCode, /DROP\s+TABLE/i, 'DROP TABLE found in executable code');
    assert.doesNotMatch(sqlCode, /DELETE\s+FROM/i, 'DELETE FROM found in executable code');
    assert.doesNotMatch(sqlCode, /TRUNCATE/i, 'TRUNCATE found in executable code');
    assert.doesNotMatch(sqlCode, /CASCADE/i, 'CASCADE found in executable code');
  });

  test('no modifications to school donations_* tables in code', () => {
    assert.doesNotMatch(sqlCode, /donations_/i, 'Reference to donations_* table found in executable code');
  });
});

// =========================================================================
// 3. Cryptographic generation & Algorithm details
// =========================================================================

describe('cryptographic generation and RPC algorithm', () => {
  test('uses pg_catalog.gen_random_uuid()', () => {
    assert.match(sqlCode, /pg_catalog\.gen_random_uuid\(\)/, 'pg_catalog.gen_random_uuid() not found');
  });

  test('uses extensions.gen_random_bytes(8)', () => {
    assert.match(sqlCode, /extensions\.gen_random_bytes\(8\)/, 'extensions.gen_random_bytes(8) not found');
  });

  test('alphabet is ABCDEFGHJKLMNPQRSTUVWXYZ23456789', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    assert.ok(sql.includes(`'${alphabet}'`), 'Exact alphabet constant not found');
  });

  test('loop resets v_ref_suffix := \'\' in main loop', () => {
    assert.match(sqlCode, /v_ref_suffix\s*:=\s*''\s*;/i, 'v_ref_suffix := \'\' reset not found in loop');
  });

  test('contains FOR i IN 0..7 LOOP', () => {
    assert.match(sqlCode, /FOR\s+i\s+IN\s+0\.\.7\s+LOOP/i, 'FOR i IN 0..7 LOOP not found');
  });

  test('uses pg_catalog.get_byte(v_bytes, i) % 32', () => {
    assert.match(sqlCode, /pg_catalog\.get_byte\s*\(\s*v_bytes\s*,\s*i\s*\)\s*%\s*32/i, 'pg_catalog.get_byte(v_bytes, i) % 32 not found');
  });

  test('uses pg_catalog.substr(v_alphabet, v_char_idx + 1, 1)', () => {
    assert.match(sqlCode, /pg_catalog\.substr\s*\(\s*v_alphabet\s*,\s*v_char_idx\s*\+\s*1\s*,\s*1\s*\)/i, 'pg_catalog.substr(v_alphabet, v_char_idx + 1, 1) not found');
  });

  test('exact reference construction DON- + year + suffix', () => {
    assert.match(
      sqlCode,
      /v_inserted_reference\s*:=\s*'DON-'\s*\|\|\s*v_year\s*\|\|\s*'-'\s*\|\|\s*v_ref_suffix\s*;/i,
      'Exact reference DON- || v_year || - || v_ref_suffix construction not found'
    );
  });

  test('loop increments v_attempt := v_attempt + 1 on collision', () => {
    assert.match(sqlCode, /v_attempt\s*:=\s*v_attempt\s*\+\s*1\s*;/i, 'v_attempt := v_attempt + 1 not found');
  });

  test('checks v_attempt >= v_max_attempts before raising exception', () => {
    assert.match(sqlCode, /IF\s+v_attempt\s*>=\s*v_max_attempts\s+THEN/i, 'IF v_attempt >= v_max_attempts not found');
  });

  test('immediate return after successful insertion (RETURN QUERY SELECT ...; RETURN;)', () => {
    assert.match(
      sqlCode,
      /RETURN\s+QUERY\s+SELECT\s+v_inserted_id\s*,\s*v_inserted_reference\s*,\s*v_inserted_status\s*;\s*RETURN\s*;/i,
      'RETURN QUERY SELECT v_inserted_id, v_inserted_reference, v_inserted_status; RETURN; not found'
    );
  });
});

// =========================================================================
// 4. Strict function signature validation
// =========================================================================

describe('strict function signature validation', () => {
  const expectedParams = [
    { name: 'p_full_name', type: 'text' },
    { name: 'p_role', type: 'text' },
    { name: 'p_company_name', type: 'text' },
    { name: 'p_sector', type: 'text' },
    { name: 'p_sub_sector', type: 'text' },
    { name: 'p_regulation_declaration', type: 'text' },
    { name: 'p_other_sector_details', type: 'text' },
    { name: 'p_organization_type', type: 'text' },
    { name: 'p_support_type', type: 'text' },
    { name: 'p_license', type: 'text' },
    { name: 'p_country', type: 'text' },
    { name: 'p_target_markets', type: 'text' },
    { name: 'p_email', type: 'text' },
    { name: 'p_phone', type: 'text' },
    { name: 'p_website', type: 'text' },
    { name: 'p_project_description', type: 'text' },
    { name: 'p_language', type: 'text' },
    { name: 'p_consent', type: 'boolean' },
  ];

  test('signature has exactly 18 parameters in exact order with exact types', () => {
    const funcMatch = sqlCode.match(/CREATE\s+FUNCTION\s+public\.create_donation_proposal\s*\(([\s\S]*?)\)\s*RETURNS\s+TABLE/i);
    assert.ok(funcMatch, 'CREATE FUNCTION public.create_donation_proposal (...) RETURNS TABLE not found');
    const paramBlock = funcMatch[1].trim();
    const rawParams = paramBlock.split(',').map(p => p.trim()).filter(Boolean);

    assert.strictEqual(rawParams.length, 18, `Expected exactly 18 parameters, got ${rawParams.length}`);

    rawParams.forEach((raw, idx) => {
      const parts = raw.split(/\s+/);
      const name = parts[0];
      const type = parts[1]?.toLowerCase();
      const expected = expectedParams[idx];

      assert.strictEqual(name, expected.name, `Param #${idx + 1} expected name ${expected.name}, got ${name}`);
      assert.strictEqual(type, expected.type, `Param #${idx + 1} (${name}) expected type ${expected.type}, got ${type}`);
    });
  });

  test('no client parameters for id, reference, or status', () => {
    const funcMatch = sqlCode.match(/CREATE\s+FUNCTION\s+public\.create_donation_proposal\s*\(([\s\S]*?)\)\s*RETURNS\s+TABLE/i);
    const paramBlock = funcMatch[1];
    assert.doesNotMatch(paramBlock, /\bp_id\b/i, 'Forbidden parameter p_id found');
    assert.doesNotMatch(paramBlock, /\bp_reference\b/i, 'Forbidden parameter p_reference found');
    assert.doesNotMatch(paramBlock, /\bp_status\b/i, 'Forbidden parameter p_status found');
    assert.doesNotMatch(paramBlock, /\bid\b\s+uuid/i, 'Forbidden parameter id found');
    assert.doesNotMatch(paramBlock, /\breference\b\s+text/i, 'Forbidden parameter reference found');
    assert.doesNotMatch(paramBlock, /\bstatus\b\s+text/i, 'Forbidden parameter status found');
  });
});

// =========================================================================
// 5. INSERT / VALUES mapping validation
// =========================================================================

describe('INSERT and VALUES mapping in RPC', () => {
  test('explicit insertion assigns v_inserted_id, v_inserted_reference, and pending literal', () => {
    const insertMatch = sqlCode.match(
      /INSERT\s+INTO\s+public\.donation_proposals\s+AS\s+dp\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/i
    );
    assert.ok(insertMatch, 'INSERT INTO public.donation_proposals AS dp (...) VALUES (...) RETURNING not found');

    const cols = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
    const vals = insertMatch[2].split(',').map(v => v.trim());

    assert.strictEqual(cols.length, vals.length, 'Column count and value count must match in INSERT');

    // Check id
    const idIdx = cols.indexOf('id');
    assert.ok(idIdx !== -1, 'id column not found in INSERT');
    assert.strictEqual(vals[idIdx], 'v_inserted_id', 'id must receive v_inserted_id');

    // Check reference
    const refIdx = cols.indexOf('reference');
    assert.ok(refIdx !== -1, 'reference column not found in INSERT');
    assert.strictEqual(vals[refIdx], 'v_inserted_reference', 'reference must receive v_inserted_reference');

    // Check status
    const statusIdx = cols.indexOf('status');
    assert.ok(statusIdx !== -1, 'status column not found in INSERT');
    assert.strictEqual(vals[statusIdx], "'pending'", "status must receive literal 'pending'");

    // Verify none of id, reference, status are passed from client parameters
    for (const val of vals) {
      assert.doesNotMatch(val, /^p_id$/i, 'id must not come from client parameter');
      assert.doesNotMatch(val, /^p_reference$/i, 'reference must not come from client parameter');
      assert.doesNotMatch(val, /^p_status$/i, 'status must not come from client parameter');
    }
  });
});

// =========================================================================
// 6. Table columns and length constraints
// =========================================================================

describe('table columns and mandatory limits (BETWEEN 1 AND limit)', () => {
  const mandatoryLimits = {
    full_name: 100,
    role: 100,
    company_name: 200,
    country: 100,
    target_markets: 300,
    email: 254,
    phone: 30,
    project_description: 5000,
  };

  for (const [field, limit] of Object.entries(mandatoryLimits)) {
    test(`${field} uses BETWEEN 1 AND ${limit}`, () => {
      const constraintBlock = extractConstraint(sqlCode, `chk_${field}_len`);
      const pattern = new RegExp(`char_length\\(btrim\\(${field}\\)\\)\\s+BETWEEN\\s+1\\s+AND\\s+${limit}`, 'i');
      assert.match(constraintBlock, pattern, `BETWEEN 1 AND ${limit} for ${field} not found in chk_${field}_len`);
    });
  }

  const optionalLimits = {
    license: 200,
    website: 2048,
    other_sector_details: 500,
  };

  for (const [field, limit] of Object.entries(optionalLimits)) {
    test(`${field} optional with max ${limit}`, () => {
      const constraintBlock = extractConstraint(sqlCode, `chk_${field}_len`);
      const pattern = new RegExp(
        `${field}\\s+IS\\s+NULL\\s+OR\\s+char_length\\(btrim\\(${field}\\)\\)\\s+BETWEEN\\s+1\\s+AND\\s+${limit}`,
        'i'
      );
      assert.match(constraintBlock, pattern, `Optional BETWEEN 1 AND ${limit} for ${field} not found in chk_${field}_len`);
    });
  }
});

// =========================================================================
// 7. Format constraints (exact phone regex {7,14}, reject {1,14})
// =========================================================================

describe('format constraints', () => {
  test('reference format CHECK', () => {
    const block = extractConstraint(sqlCode, 'chk_reference_format');
    assert.ok(
      block.includes("reference ~ '^DON-[0-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'"),
      'Reference format regex CHECK not found in chk_reference_format'
    );
  });

  test('consent must be true', () => {
    const block = extractConstraint(sqlCode, 'chk_consent_true');
    assert.match(block, /consent\s*=\s*true/i, 'consent = true CHECK not found in chk_consent_true');
  });

  test('email format CHECK', () => {
    const block = extractConstraint(sqlCode, 'chk_email_format');
    assert.match(block, /email\s*~\s*'[^']+'/, 'email regex CHECK not found in chk_email_format');
  });

  test('phone E.164 format CHECK requires {7,14} and rejects {1,14}', () => {
    const block = extractConstraint(sqlCode, 'chk_phone_e164');
    assert.match(block, /phone\s*~\s*'\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/i, 'phone E.164 regex with {7,14} not found');
    assert.doesNotMatch(block, /\{1,14\}/, 'Outdated {1,14} regex found in chk_phone_e164');
  });
});

// =========================================================================
// 8. Isolated enumeration constraints
// =========================================================================

describe('isolated enumeration constraints', () => {
  const enums = {
    sector: ['finance','telecom','equipment','mobility_services','after_school_services','insurance','transport','ngo_institutions','otherRegulated','other'],
    sub_sector: ['transport','insurance','afterSchool','otherRegulated'],
    regulation_declaration: ['yes','no'],
    organization_type: ['ngo','foundation','association','international_institution','cooperation_agency','public_body','sponsor_company','other'],
    support_type: ['future_financial_donation','equipment_donation','school_sponsorship','educational_project_funding','skills_sponsorship','other_proposal'],
    language: ['fr','en','es','ar','it','de','pt','zh','ru'],
    status: ['pending','under_review','approved','rejected','archived'],
  };

  for (const [name, values] of Object.entries(enums)) {
    test(`${name} enum constraint (chk_${name}) contains exactly its ${values.length} allowed values in isolation`, () => {
      const block = extractConstraint(sqlCode, `chk_${name}`);
      for (const v of values) {
        assert.ok(block.includes(`'${v}'`), `Value '${v}' missing from isolated chk_${name} block: ${block}`);
      }
    });
  }
});

// =========================================================================
// 9. Isolated conditional constraints
// =========================================================================

describe('isolated conditional constraints', () => {
  test('chk_sub_sector_mobility_services isolated block', () => {
    const block = extractConstraint(sqlCode, 'chk_sub_sector_mobility_services');
    assert.match(block, /sector\s*=\s*'mobility_services'/i);
    assert.match(block, /sub_sector\s+IS\s+NOT\s+NULL/i);
  });

  test('chk_regulation_and_other_for_other_sector isolated block with non-empty check', () => {
    const block = extractConstraint(sqlCode, 'chk_regulation_and_other_for_other_sector');
    assert.match(block, /sector\s*=\s*'other'/i);
    assert.match(block, /regulation_declaration\s+IS\s+NOT\s+NULL/i);
    assert.match(block, /other_sector_details\s+IS\s+NOT\s+NULL/i);
    assert.match(block, /char_length\(btrim\(other_sector_details\)\)\s*>=\s*1/i);
  });

  test('chk_organization_type_for_ngo_institutions isolated block', () => {
    const block = extractConstraint(sqlCode, 'chk_organization_type_for_ngo_institutions');
    assert.match(block, /sector\s*=\s*'ngo_institutions'/i);
    assert.match(block, /organization_type\s+IS\s+NOT\s+NULL/i);
  });

  test('chk_license_required isolated block with non-empty check', () => {
    const block = extractConstraint(sqlCode, 'chk_license_required');
    assert.match(block, /finance/i);
    assert.match(block, /insurance/i);
    assert.match(block, /otherRegulated/i);
    assert.match(block, /license\s+IS\s+NOT\s+NULL/i);
    assert.match(block, /char_length\(btrim\(license\)\)\s*>=\s*1/i);
  });
});

// =========================================================================
// 10. Row Level Security & Privileges
// =========================================================================

describe('row level security and privileges in executable code', () => {
  test('RLS enabled and no CREATE POLICY in code', () => {
    assert.match(sqlCode, /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i, 'ENABLE ROW LEVEL SECURITY not found');
    assert.doesNotMatch(sqlCode, /CREATE\s+POLICY/i, 'CREATE POLICY found in executable code');
  });

  test('table privileges revoked from PUBLIC, anon, authenticated, service_role', () => {
    assert.match(
      sqlCode,
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.donation_proposals\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
      'REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated, service_role not found'
    );
  });

  test('no direct GRANT on table to service_role', () => {
    assert.doesNotMatch(
      sqlCode,
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(?:TABLE\s+)?public\.donation_proposals[^;]*TO\s+service_role/i,
      'Direct GRANT on table to service_role found in code'
    );
  });

  test('function REVOKE/GRANT uses full 18-param signature (17 text, boolean)', () => {
    const sigLines = sqlCode.split('\n').filter(l => /(?:REVOKE|GRANT)\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.create_donation_proposal\s*\(/i.test(l));
    assert.strictEqual(sigLines.length, 4, `Expected exactly 4 REVOKE/GRANT lines, found ${sigLines.length}`);
    for (const line of sigLines) {
      const sigMatch = line.match(/\(([^)]+)\)/);
      assert.ok(sigMatch, `Cannot extract signature from line: ${line.trim()}`);
      const types = sigMatch[1].split(',').map(t => t.trim().toLowerCase());
      assert.strictEqual(types.length, 18, `Expected 18 types, got ${types.length} in: ${line.trim()}`);
      assert.strictEqual(types.filter(t => t === 'text').length, 17, 'Expected 17 text types');
      assert.strictEqual(types[17], 'boolean', '18th type must be boolean');
    }
  });

  test('SECURITY DEFINER and safe search_path (no public)', () => {
    assert.match(sqlCode, /SECURITY\s+DEFINER/i, 'SECURITY DEFINER not found');
    const spMatch = sqlCode.match(/SET\s+search_path\s*=\s*([^\n;]+)/i);
    assert.ok(spMatch, 'SET search_path not found');
    const schemas = spMatch[1].split(',').map(s => s.trim().toLowerCase());
    assert.ok(!schemas.includes('public'), `search_path must not contain public, got: ${spMatch[1]}`);
    assert.ok(schemas.includes('pg_catalog'), 'pg_catalog not in search_path');
    assert.ok(schemas.includes('extensions'), 'extensions not in search_path');
  });
});
