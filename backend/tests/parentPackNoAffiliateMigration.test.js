const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('P23 sécurise le chemin Pack Parent sans ambassadeur actif', () => {
    const migrationPath = path.join(__dirname, '../scripts/migration_p23_fix_parent_pack_no_affiliate.sql');
    const raw = fs.readFileSync(migrationPath, 'utf8');
    const content = raw.replace(/\s+/g, ' ');

    assert.ok(raw.startsWith('-- Migration P23:'), 'La migration doit être versionnée P23');
    assert.ok(content.includes('BEGIN;') && content.trim().endsWith('COMMIT;'), 'La migration doit être transactionnelle');
    assert.ok(content.includes('process_parent_pack_webhook_event'), 'Le handler Pack Parent doit être ciblé');
    assert.ok(content.includes("'v_affiliate RECORD,'".replace(',', ';')), 'La déclaration RECORD source doit être explicitement ciblée');
    assert.ok(content.includes("'v_affiliate public.affiliates%ROWTYPE,'".replace(',', ';')), 'Un %ROWTYPE nul-safe doit remplacer RECORD');
    assert.ok(content.includes('unexpected parent_pack webhook handler definition'), 'La migration doit échouer si le handler attendu a changé');
    assert.ok(content.includes('EXECUTE v_handler_definition'), 'La fonction corrigée doit être réinstallée');
    assert.ok(!content.includes('process_fedapay_webhook_event_v2_legacy('), 'P18 ne doit pas être modifiée');
    assert.ok(!/\bDROP\b|\bDELETE\b/.test(content), 'P23 ne doit supprimer aucune donnée ni objet');
});
