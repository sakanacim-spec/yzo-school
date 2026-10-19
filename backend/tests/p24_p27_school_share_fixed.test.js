const { readFileSync } = require('fs');
const assert = require('assert').strict;

// Paths relative to this test file
const path = require('path');
const p24Path = path.resolve(__dirname, '../scripts/migration_p24_parent_pack_global_student_checkout.sql');
const p27Path = path.resolve(__dirname, '../scripts/migration_p27_parent_pack_reconciliation_defense.sql');

const p24 = readFileSync(p24Path, 'utf8');
const p27 = readFileSync(p27Path, 'utf8');

// 1. Ensure the deprecated column is not referenced
assert(!p24.includes('commission_rate_percentage'), 'P24 migration still references commission_rate_percentage');
assert(!p27.includes('commission_rate_percentage'), 'P27 migration still references commission_rate_percentage');

// 2. Verify the fixed 20 % formula is used
const formulaRegex = /v_school_share_minor\s*:=\s*FLOOR\([^;]*\*\s*20\s*\/\s*100\)::BIGINT;/i;
assert.ok(formulaRegex.test(p24), 'P4 does not contain the fixed 20 % school share formula');
assert.ok(formulaRegex.test(p27), 'P27 does not contain the fixed 20 % school share formula');

console.log('✅ P24/P27 school share formula tests passed');
