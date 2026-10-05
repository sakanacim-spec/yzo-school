const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('P22 corrige uniquement le contrat payment_intents du handler Pack Parent', () => {
    const p22Path = path.join(__dirname, '../scripts/migration_p22_fix_parent_pack_payment_intent_contract.sql');
    const p21Path = path.join(__dirname, '../scripts/migration_p21_parent_pack_webhook.sql');

    assert.ok(fs.existsSync(p22Path), 'La migration P22 doit exister');
    const raw = fs.readFileSync(p22Path, 'utf8');
    const content = raw.replace(/\s+/g, ' ');
    const p21 = fs.readFileSync(p21Path, 'utf8');

    assert.ok(raw.startsWith('-- Migration P22'), 'Le script est bien versionné P22');
    assert.ok(content.includes('BEGIN;') && content.trim().endsWith('COMMIT;'), 'P22 est transactionnelle');
    assert.ok(!content.includes('DROP FUNCTION') && !content.includes('DROP TABLE'), 'P22 ne supprime aucun objet');
    assert.ok(!content.includes('DELETE FROM'), 'P22 ne supprime aucune donnée');

    assert.ok(content.includes('process_parent_pack_webhook_event'), 'Seul le handler Pack Parent est ciblé');
    assert.ok(content.includes("'v_intent.currency'"), 'La référence P21 obsolète est détectée');
    assert.ok(content.includes("'v_intent.expected_currency'"), 'La colonne réelle expected_currency est imposée');
    assert.ok(content.includes("'completed_at = p_certified_payment_at'"), 'La finalisation P21 obsolète est détectée');
    assert.ok(content.includes("'processed_at = p_certified_payment_at'"), 'La colonne réelle processed_at est imposée');
    assert.ok(content.includes('EXECUTE v_handler_definition'), 'La fonction P21 est remplacée atomiquement');
    assert.ok(content.includes('unexpected parent_pack webhook handler definition'), 'P22 échoue si le handler ne correspond pas à P21');
    assert.ok(content.includes('contract correction was not applied'), 'P22 vérifie son résultat avant commit');

    assert.ok(p21.includes('RETURN public.process_fedapay_webhook_event_v2_legacy('), 'P21 préserve la délégation P18');
    assert.ok(!content.includes('process_fedapay_webhook_event_v2_legacy('), 'P22 ne modifie pas P18 ni le répartiteur v2');
});
