const { supabase } = require('../utils/supabase');

/**
 * GET /api/parent/dashboard
 */
async function getDashboard(req, res) {
    const { id: parentId, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    console.log('🔍 [Dashboard] Parent ID:', parentId);

    try {
        // Récupérer les ids des élèves liés via la table parent_student
        const { data: links, error: lErr } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', parentId);

        if (lErr) {
            console.error('❌ [Dashboard] Erreur récupération liens:', lErr);
            if (lErr.code === '42P01') return res.json({ students: [] });
            throw lErr;
        }

        console.log('📋 [Dashboard] Liens trouvés:', links?.length || 0);

        const studentIds = links.map(l => l.student_id);
        console.log('👨‍👩‍👧‍👦 [Dashboard] IDs élèves:', studentIds);

        if (studentIds.length === 0) {
            console.log('⚠️ [Dashboard] Aucun élève lié');
            return res.json({ students: [] });
        }

        const { data: students, error: sErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('*')
            .in('id', studentIds)
            .order('nom', { ascending: true });

        if (sErr) {
            console.error('❌ [Dashboard] Erreur récupération élèves:', sErr);
            throw sErr;
        }

        console.log('✅ [Dashboard] Élèves récupérés:', students?.length || 0);
        return res.json({ students: students || [] });
    } catch (err) {
        console.error('💥 [Dashboard] Erreur générale:', err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/parent/payments/:studentId
 */
async function getPayments(req, res) {
    const { id: parentId, schoolSlug } = req.user;
    const { studentId } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // Vérifier lien dans la table parent_student
        const { data: isLinked, error: lErr } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', parentId)
            .eq('student_id', studentId)
            .single();

        if (lErr || !isLinked) {
            return res.status(403).json({ error: 'Accès refusé ou enfant non lié.' });
        }

        const { data: student, error: sErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('*')
            .eq('id', studentId)
            .single();

        if (sErr) throw sErr;

        const { data: payments, error: pErr } = await supabase
            .from(`payments_${schoolSlug}`)
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false });

        if (pErr) throw pErr;

        return res.json({ student, payments });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/parent/badges
 */
async function getBadges(req, res) {
    const { id: parentId, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        const { data: badges, error } = await supabase
            .from(`badges_${schoolSlug}`)
            .select(`
                *,
                student:student_id (nom, prenom, classe)
            `)
            .eq('parent_id', parentId)
            .order('earned_at', { ascending: false });

        if (error) {
            // Gérer le cas où la table n'existe pas encore pour cette école
            if (error.code === '42P01') return res.json({ badges: [] });
            throw error;
        }

        const formatted = (badges || []).map(b => ({
            ...b,
            student_nom: b.student?.nom,
            student_prenom: b.student?.prenom,
            classe: b.student?.classe
        }));

        return res.json({ badges: formatted });
    } catch (err) {
        console.error('[getBadges] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/parent/active-count
 * Utilisé par l'admin pour voir le nombre de parents inscrits en temps réel
 */
async function getActiveParentsCount(req, res) {
    try {
        console.log('🔍 [ActiveCount] start');
        const schoolSlug = req.user ? req.user.schoolSlug : null;
        if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

        const { count, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('*', { count: 'exact', head: true })
            .eq('role', 'parent');

        if (error) {
            console.error('❌ [ActiveCount] Supabase error:', error.message);
            throw error;
        }
        console.log(`📊 [ActiveCount] parents count: ${count || 0}`);
        return res.json({ count: count || 0 });
    } catch (err) {
        console.error('❌ [ActiveCount] handler error:', err);
        return res.status(500).json({ error: err.message });
    }
}

async function getAllParents(req, res) {
    try {
        console.log('🔍 [ParentList] fetching all parents');
        const schoolSlug = req.user ? req.user.schoolSlug : null;
        if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

        const { data, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, created_at, role')
            .eq('role', 'parent')
            .order('nom', { ascending: true });

        if (error) {
            console.error('❌ [ParentList] Supabase error:', error.message);
            throw error;
        }
        console.log(`✅ [ParentList] returned ${data?.length || 0} items`);
        return res.json(data);
    } catch (err) {
        console.error('❌ [ParentList] handler error:', err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/parent/:id
 * Get a specific parent by ID (for admin purposes)
 */
async function getParentById(req, res) {
    const { id } = req.params;
    const { role, schoolSlug } = req.user;

    // Only admin can access this
    if (!['admin', 'directeur', 'directeur_general', 'comptable'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    try {
        console.log(`🔍 [ParentById] fetching parent ${id}`);
        const { data, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, created_at, role')
            .eq('id', id)
            .eq('role', 'parent')
            .single();

        if (error) {
            console.error('❌ [ParentById] Supabase error:', error.message);
            if (error.code === 'PGRST116') { // No rows returned
                return res.status(404).json({ error: 'Parent non trouvé.' });
            }
            throw error;
        }

        console.log(`✅ [ParentById] found parent: ${data.nom}`);
        return res.json({ success: true, data });
    } catch (err) {
        console.error('❌ [ParentById] handler error:', err);
        return res.status(500).json({ error: err.message });
    }
}

async function adminDeleteAccount(req, res) {
    const { parentId } = req.params;
    const { role, schoolSlug } = req.user;

    console.log(`🗑️ [AdminDelete] Attempting to delete parent ${parentId} by role ${role}`);

    // Seul le directeur peut supprimer des comptes
    if (!['admin', 'directeur', 'directeur_general'].includes(role)) {
        console.warn(`⚠️ [AdminDelete] Permission denied for role ${role}`);
        return res.status(403).json({ error: 'Permission refusée. Seul le Directeur Général peut supprimer des comptes.' });
    }

    try {
        console.log(`🗑️ [AdminDelete] Deleting parent ${parentId} from profiles`);
        const { error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .delete()
            .eq('id', parentId)
            .neq('role', 'directeur') // Sécurité : ne peut pas s'auto-supprimer via cette route
            .neq('role', 'comptable'); // Sécurité : ne peut pas supprimer le comptable général

        if (error) {
            console.error('❌ [AdminDelete] Supabase error:', error.message);
            throw error;
        }

        console.log(`✅ [AdminDelete] Parent ${parentId} deleted successfully`);
        return res.json({ message: 'Compte supprimé par l\'administrateur.' });
    } catch (err) {
        console.error('💥 [AdminDelete] Fatal error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la suppression: ' + err.message });
    }
}

/**
 * GET /api/parent/presences/:studentId
 */
async function getPresences(req, res) {
    const { id: parentId, schoolSlug } = req.user;
    const { studentId } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // Vérifier lien dans la table parent_student
        const { data: isLinked, error: lErr } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', parentId)
            .eq('student_id', studentId)
            .single();

        if (lErr || !isLinked) {
            return res.status(403).json({ error: 'Accès refusé ou enfant non lié.' });
        }

        const { data: presences, error: pErr } = await supabase
            .from(`presences_${schoolSlug}`)
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false })
            .order('heure', { ascending: false });

        if (pErr) throw pErr;

        return res.json({ presences: presences || [] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/parent/data
 * Retourne les données fraiches pour un parent loggé :
 * annonces, lectures d'annonces, messages non lus
 */
async function getParentData(req, res) {
    const { id: parentId, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // 0. Récupérer les IDs des enfants liés pour filtrer les notes
        const { data: links } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', parentId);
        
        const studentIds = (links || []).map(l => l.student_id);

        // 1. Annonces de l'école
        const { data: announcements } = await supabase
            .from(`announcements_${schoolSlug}`)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        // 2. Statut de lecture des annonces pour ce parent
        const { data: announcementReads } = await supabase
            .from(`announcement_reads_${schoolSlug}`)
            .select('*')
            .eq('parent_id', parentId);

        // 3. Compter les messages non lus
        const { count: unreadMessages } = await supabase
            .from(`messages_${schoolSlug}`)
            .select('id', { count: 'exact', head: true })
            .eq('read_status', false)
            .neq('sender_id', parentId);

        // 4. Paramètres de l'école (Logo, Nom, etc.)
        const { data: dbSettings } = await supabase
            .from(`app_settings_${schoolSlug}`)
            .select('*')
            .single();
        
        const appSettings = dbSettings ? {
            appName: dbSettings.app_name,
            schoolName: dbSettings.school_name,
            schoolYear: dbSettings.school_year,
            schoolLogo: dbSettings.school_logo,
            schoolStamp: dbSettings.school_stamp,
            messageRemerciement: dbSettings.message_remerciement,
            messageRappel: dbSettings.message_rappel,
            tranches: dbSettings.tranches || []
        } : null;

        // 5. Détails des élèves (enfants)
        let students = [];
        if (studentIds.length > 0) {
            const { data: dbStudents } = await supabase
                .from(`students_${schoolSlug}`)
                .select('*')
                .in('id', studentIds);
            
            students = (dbStudents || []).map(s => ({
                ...s,
                dejaPaye: s.deja_paye,
                telephone: s.telephone_parent,
                sexe: s.sexe || 'M',
                redoublant: s.redoublant || false,
                ecoleProvenance: s.ecole_provenance || '',
                dateNaissance: s.date_naissance || null,
                adsn: s.adsn || null,
                photoUrl: s.photo_url || null,
                historiquesPaiements: [] // Non requis pour le dashboard simple mais bon pour la cohérence
            }));
        }

        // 6. Données Académiques (pour le relevé de notes)
        let notes = [];
        let matieres = [];
        let classeMatieres = [];

        if (studentIds.length > 0) {
            // Récupérer les notes des enfants
            const { data: dbNotes } = await supabase
                .from(`notes_${schoolSlug}`)
                .select('*')
                .in('eleve_id', studentIds);
            notes = (dbNotes || []).map(n => ({
                id: n.id,
                eleveId: n.eleve_id,
                matiereId: n.matiere_id,
                periode: n.periode,
                noteClasse: n.note_classe !== undefined ? Number(n.note_classe) : null,
                noteDevoir: n.note_devoir !== undefined ? Number(n.note_devoir) : null,
                noteCompo: n.note_compo !== undefined ? Number(n.note_compo) : null
            }));

            // Récupérer toutes les matières
            const { data: dbMatieres } = await supabase
                .from(`matieres_${schoolSlug}`)
                .select('*');
            matieres = (dbMatieres || []).map(m => ({
                id: m.id,
                nom: m.nom,
                categorie: m.categorie
            }));

            // Récupérer les configurations de classe
            const { data: dbClasseMatieres } = await supabase
                .from(`classe_matieres_${schoolSlug}`)
                .select('*');
            classeMatieres = (dbClasseMatieres || []).map(cm => ({
                id: cm.id,
                classe: cm.classe,
                matiereId: cm.matiere_id,
                professeur: cm.professeur,
                coefficient: cm.coefficient
            }));
        }

        // 7. Badges
        let badges = [];
        try {
            const { data: dbBadges, error: bErr } = await supabase
                .from(`badges_${schoolSlug}`)
                .select(`
                    *,
                    student:student_id (nom, prenom, classe)
                `)
                .eq('parent_id', parentId)
                .order('earned_at', { ascending: false });
            
            if (bErr && bErr.code !== '42P01') throw bErr;
            
            badges = (dbBadges || []).map(b => ({
                ...b,
                student_nom: b.student?.nom,
                student_prenom: b.student?.prenom,
                classe: b.student?.classe
            }));

            // Proactif : Si le parent a des enfants mais aucun badge, on tente une génération auto
            if (badges.length === 0 && studentIds.length > 0) {
                for (const sId of studentIds) {
                    await _autoAssignBadgesSync(parentId, sId, schoolSlug);
                }
                // Optionnel : Re-fetch après génération (ou juste attendre la prochaine sync)
            }
        } catch (err) {
            console.warn('[getParentData] Badge retrieval failed:', err.message);
        }

        return res.json({
            announcements: announcements || [],
            announcementReads: announcementReads || [],
            unreadMessages: unreadMessages || 0,
            appSettings,
            students,
            notes,
            matieres,
            classeMatieres,
            badges
        });
    } catch (err) {
        console.error('[getParentData] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Helper proactif pour générer les badges manquants pendant la sync
 */
async function _autoAssignBadgesSync(parentId, studentId, schoolSlug) {
    try {
        const { data: student } = await supabase.from(`students_${schoolSlug}`).select('*').eq('id', studentId).single();
        if (!student) return;

        const addBadge = async (code, label, description, icon) => {
            const { data: exists } = await supabase.from(`badges_${schoolSlug}`).select('id').eq('parent_id', parentId).eq('student_id', studentId).eq('code', code).single();
            if (!exists) {
                await supabase.from(`badges_${schoolSlug}`).insert({
                    parent_id: parentId, student_id: studentId, code, label, description, icon, earned_at: new Date().toISOString()
                });
            }
        };

        // 1. Badge d'inscription
        await addBadge('welcome', 'Parent Responsable', 'Compte créé et enfant enregistré pour le suivi digital.', '🛡️');

        // 2. Badges financiers
        if (student.status === 'Soldé') {
            await addBadge('fully_paid', 'Mécène de l\'Éducation', 'Scolarité entièrement réglée pour l\'année en cours.', '🏆');
        }
        const ratio = student.ecolage > 0 ? student.deja_paye / student.ecolage : 0;
        if (ratio >= 0.5 && student.status !== 'Soldé') {
            await addBadge('half_paid', 'Partenaire Engagé', 'Plus de 50% de la scolarité validée avec succès.', '🥈');
        }

        // 3. Badges académiques (Proactif)
        // On récupère les notes pour voir si l'élève a une excellente moyenne
        const { data: notes } = await supabase.from(`notes_${schoolSlug}`).select('*').eq('eleve_id', studentId);
        if (notes && notes.length > 3) {
            const avg = notes.reduce((acc, n) => acc + (n.note_classe || 0) + (n.note_devoir || 0), 0) / (notes.length * 2);
            if (avg >= 15) {
                await addBadge('excellence', 'Fierté Académique', 'Votre enfant maintient une moyenne d\'excellence dans ses résultats.', '⭐');
            }
        }

        // 4. Badge d'assiduité
        const { data: presences } = await supabase.from(`presences_${schoolSlug}`).select('id').eq('student_id', studentId).limit(20);
        if (presences && presences.length >= 20) {
            await addBadge('attendance', 'Modèle de Ponctualité', 'Assiduité exemplaire constatée au cours des dernières semaines.', '⚡');
        }

    } catch (e) { /* ignore silent failure during sync */ }
}

module.exports = {
    getDashboard,
    getPayments,
    getBadges,
    getPresences,
    getActiveParentsCount,
    getAllParents,
    getParentById,
    adminDeleteAccount,
    getParentData
};
