const { supabase } = require('../utils/supabase');

async function updateRole() {
    console.log('Tentative de mise à jour du rôle...');

    // Check if '0001' exists
    const { data: user, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('telephone', '0001')
        .single();

    if (fetchError) {
        console.error('Erreur lors de la recherche :', fetchError.message);
        return;
    }

    if (!user) {
        console.warn("L'utilisateur 0001 n'existe pas ou n'est pas trouvable");
        return;
    }

    console.log("Utilisateur trouvé :", user.telephone, "| Rôle actuel :", user.role);

    // Mettre à jour vers 'admin' ou 'directeur_general' -> 'directeur_general' seems more specific, or maybe 'admin'. 
    // In src/types/index.ts, role is `'admin' | 'directeur' | 'proviseur'...`. I will use 'directeur' or 'admin'. Let's use 'directeur' since the user mentions "Directeur Général". I will use 'admin' since the prompt says "admin" or "directeur_general".
    // I am going to use 'admin' as it gives full rights typically. Let's see how 'admin' is handled in the frontend later.
    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('telephone', '0001')
        .select()
        .single();

    if (updateError) {
        console.error('Erreur lors de la mise à jour :', updateError.message);
    } else {
        console.log('Mise à jour réussie :', updated);
    }
    process.exit(0);
}

updateRole();
