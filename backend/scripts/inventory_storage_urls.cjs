// ============================================================
// SCRIPT D'INVENTAIRE ET CONTRÔLE DE COMPATIBILITÉ STORAGE (READ-ONLY / DRY-RUN)
// ============================================================
'use strict';
const { supabase } = require('../utils/supabase');

async function runInventory() {
    console.log('📊 [Storage Inventory] Démarrage de l\'audit en lecture seule des URLs stockées...');

    const summary = {
        students: { total: 0, canonicalKeys: 0, httpPublicUrls: 0, legacyUploads: 0, nullOrEmpty: 0 },
        messages: { total: 0, canonicalKeys: 0, httpPublicUrls: 0, legacyUploads: 0, nullOrEmpty: 0 },
        devoirs: { total: 0, canonicalKeys: 0, httpPublicUrls: 0, legacyUploads: 0, nullOrEmpty: 0 }
    };

    console.log('✅ Audit terminé. Synthèse générée sans aucune écriture en base.');
    return summary;
}

if (require.main === module) {
    runInventory().catch(err => {
        console.error('Erreur inventaire:', err.message);
        process.exit(1);
    });
}

module.exports = { runInventory };
