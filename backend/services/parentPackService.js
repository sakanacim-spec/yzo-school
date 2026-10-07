const { supabase } = require('../utils/supabase');

/**
 * Constantes d'accès P25
 */
const ACCESS_STATES = {
    PAID_ACTIVE: 'PAID_ACTIVE',
    GRACE_ACTIVE: 'GRACE_ACTIVE',
    LEGACY_UNDECIDED: 'LEGACY_UNDECIDED',
    PACK_SUSPENDED: 'PACK_SUSPENDED'
};

/**
 * Détermine l'état d'accès pour une liste de student_global_id.
 * Retourne un dictionnaire: { [student_global_id]: { state, accessAllowed } }
 */
async function getAccessStatesForGlobalIds(parentRef, studentGlobalIds) {
    if (!studentGlobalIds || studentGlobalIds.length === 0) return {};

    const result = {};

    // Initialisation par défaut sécurisée
    for (const gid of studentGlobalIds) {
        result[gid] = {
            state: ACCESS_STATES.PACK_SUSPENDED,
            accessAllowed: false
        };
    }

    // 1. Récupérer les liens parent-enfant (first_linked_at)
    const { data: links, error: linksErr } = await supabase
        .from('parent_child_links')
        .select('student_global_id, first_linked_at')
        .eq('parent_ref', parentRef)
        .in('student_global_id', studentGlobalIds);

    if (linksErr) throw linksErr;

    // 2. Récupérer les identifiants bénéficiant d'une couverture payée active
    // Utilise la RPC qui compare nativement p.start_date et p.end_date avec CURRENT_DATE
    const { data: paidData, error: rpcErr } = await supabase
        .rpc('get_active_parent_pack_subscriptions', {
            p_parent_ref: parentRef,
            p_student_global_ids: studentGlobalIds
        });

    if (rpcErr) throw rpcErr;

    // Le tableau renvoyé contient des objets { student_global_id: ... }
    const paidSet = new Set((paidData || []).map(row => row.student_global_id || row));

    const now = new Date();

    // Calcul des états (ordre de priorité P25)
    for (const gid of studentGlobalIds) {
        // A. Vérifier PAID_ACTIVE
        if (paidSet.has(gid)) {
            result[gid] = { state: ACCESS_STATES.PAID_ACTIVE, accessAllowed: true };
            continue;
        }

        const link = links?.find(l => l.student_global_id === gid);
        if (!link) {
            result[gid] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
            continue;
        }

        // B. Vérifier LEGACY_UNDECIDED
        if (link.first_linked_at === null) {
            result[gid] = { state: ACCESS_STATES.LEGACY_UNDECIDED, accessAllowed: true };
            continue;
        }

        const firstLinkedAt = new Date(link.first_linked_at);
        const expirationDate = new Date(firstLinkedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

        // C & D. Vérifier GRACE_ACTIVE / PACK_SUSPENDED
        if (now.getTime() < expirationDate.getTime()) {
            result[gid] = { state: ACCESS_STATES.GRACE_ACTIVE, accessAllowed: true };
        } else {
            result[gid] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
        }
    }

    return result;
}

/**
 * Utilitaire pour résoudre les identifiants locaux en identifiants globaux
 */
async function resolveGlobalIds(schoolSlug, studentLocalIds) {
    if (!studentLocalIds || studentLocalIds.length === 0) return {};

    const { data, error } = await supabase
        .from('student_global_mappings')
        .select('student_local_id, student_global_id')
        .eq('school_slug', schoolSlug)
        .in('student_local_id', studentLocalIds.map(String));

    if (error) throw error;

    const map = {};
    (data || []).forEach(row => {
        map[row.student_local_id] = row.student_global_id;
    });
    return map;
}

/**
 * Fonction combinée pour les contrôleurs
 */
async function getAccessStatesForLocalIds(parentRef, schoolSlug, studentLocalIds) {
    const globalIdsMap = await resolveGlobalIds(schoolSlug, studentLocalIds);
    const globalIds = Object.values(globalIdsMap);

    const states = await getAccessStatesForGlobalIds(parentRef, globalIds);

    const result = {};
    for (const localId of studentLocalIds) {
        const gid = globalIdsMap[String(localId)];
        if (gid && states[gid]) {
            result[localId] = states[gid];
        } else {
            result[localId] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
        }
    }

    return result;
}

module.exports = {
    ACCESS_STATES,
    getAccessStatesForGlobalIds,
    resolveGlobalIds,
    getAccessStatesForLocalIds
};
