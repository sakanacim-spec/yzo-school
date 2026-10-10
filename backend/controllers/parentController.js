const { supabase } = require('../utils/supabase');
const parentPackService = require('../services/parentPackService');
const { getAccessStatesForLocalIds, ACCESS_STATES } = parentPackService;
const { validateSlug, normalizeIdentityText, normalizeIdentityDate } = require('../utils/helpers');

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
    const { id: parentId, role, schoolSlug } = req.user;
    const { studentId } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role);

    try {
        if (!isStaff) {
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
        const { data: links, error: lErr } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', parentId);

        if (lErr) throw lErr;

        const studentIds = (links || []).map(l => l.student_id);

        let activeStudentIds = [];
        if (studentIds.length > 0) {
            const packStates = await getAccessStatesForLocalIds(parentId, schoolSlug, studentIds);
            activeStudentIds = studentIds.filter(id => packStates[id]?.accessAllowed);
        }

        if (activeStudentIds.length === 0) {
            return res.json({ badges: [] });
        }

        const { data: badges, error } = await supabase
            .from(`badges_${schoolSlug}`)
            .select(`
                *,
                student:student_id (nom, prenom, classe)
            `)
            .eq('parent_id', parentId)
            .in('student_id', activeStudentIds)
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
    const { role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    try {
        const { count, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('*', { count: 'exact', head: true })
            .eq('role', 'parent');

        if (error) {
            console.error('❌ [ActiveCount] Supabase error:', error.message);
            throw error;
        }
        return res.json({ count: count || 0 });
    } catch (err) {
        console.error('❌ [ActiveCount] handler error:', err);
        return res.status(500).json({ error: err.message });
    }
}

async function getAllParents(req, res) {
    const { role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    try {
        const { data, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, created_at, role')
            .eq('role', 'parent')
            .order('nom', { ascending: true });

        if (error) {
            console.error('❌ [ParentList] Supabase error:', error.message);
            throw error;
        }
        return res.json(data || []);
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
    const { id: parentId, role, schoolSlug } = req.user;
    const { studentId } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role);

    try {
        if (!isStaff) {
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
        }

        if (!isStaff) {
            const packStates = await getAccessStatesForLocalIds(parentId, schoolSlug, [studentId]);
            const studentState = packStates[studentId];
            if (!studentState || !studentState.accessAllowed) {
                return res.status(403).json({
                    error: "Accès Parent Pack suspendu pour cet enfant.",
                    code: "PACK_SUSPENDED"
                });
            }
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

        let parentPackAccess = {};
        let activeStudentIds = [];
        if (studentIds.length > 0) {
            try {
                parentPackAccess = await getAccessStatesForLocalIds(parentId, schoolSlug, studentIds);
                activeStudentIds = studentIds.filter(id => parentPackAccess[id]?.accessAllowed);
            } catch (err) {
                console.error('[getParentData] Parent Pack Engine Error:', err);
                for (const id of studentIds) {
                    parentPackAccess[id] = { state: 'ACCESS_UNAVAILABLE', accessAllowed: false };
                }
                activeStudentIds = [];
            }
        }

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

        // 4. Paramètres de l'école (Logo, Nom, etc. via schéma clé-valeur)
        const { data: dbSettingsRows } = await supabase
            .from(`app_settings_${schoolSlug}`)
            .select('*');

        const settingsMap = new Map();
        (dbSettingsRows || []).forEach(r => {
            if (r.key) settingsMap.set(r.key, r.value);
        });

        const safeJsonParse = (val, fallback = null) => {
            if (!val) return fallback;
            try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return fallback; }
        };

        const { data: schoolInfo } = await supabase
            .from('schools')
            .select('name, country, address, phone, slogan, ministry, email')
            .eq('slug', schoolSlug)
            .single();
        
        const appSettings = {
            appName: settingsMap.get('app_name') || schoolInfo?.name || null,
            schoolName: settingsMap.get('school_name') || schoolInfo?.name || null,
            schoolYear: settingsMap.get('school_year') || null,
            schoolLogo: settingsMap.get('school_logo') || null,
            schoolStamp: settingsMap.get('school_stamp') || null,
            messageRemerciement: settingsMap.get('message_remerciement') || null,
            messageRappel: settingsMap.get('message_rappel') || null,
            tranches: safeJsonParse(settingsMap.get('tranches'), []),
            schoolCountry: schoolInfo?.country || null,
            schoolAddress: schoolInfo?.address || null,
            schoolPhone: schoolInfo?.phone || null,
            schoolSlogan: schoolInfo?.slogan || null,
            schoolMinistry: schoolInfo?.ministry || null,
            schoolEmail: schoolInfo?.email || null
        };

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
            let dbNotes = [];
            if (activeStudentIds.length > 0) {
                const { data } = await supabase
                    .from(`notes_${schoolSlug}`)
                    .select('*')
                    .in('eleve_id', activeStudentIds);
                dbNotes = data || [];
            }
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

        // 6.5 Devoirs et Présences
        let devoirs = [];
        let presences = [];
        
        if (studentIds.length > 0) {
            // Get classes of ACTIVE children
            const activeStudents = students.filter(s => activeStudentIds.includes(s.id));
            const classesOfChildren = [...new Set(activeStudents.map(s => s.classe).filter(Boolean))];
            
            if (classesOfChildren.length > 0) {
                const { data: dbDevoirs } = await supabase
                    .from(`devoirs_${schoolSlug}`)
                    .select('*')
                    .in('classe', classesOfChildren);
                    
                devoirs = (dbDevoirs || []).map(d => ({
                    id: d.id,
                    dateDonnee: d.date_donnee,
                    dateRendu: d.date_rendu,
                    matiere: d.matiere,
                    description: d.description,
                    classe: d.classe,
                    professeurNom: d.professeur_nom,
                    fichierUrl: d.fichier_url || null
                }));
            }
            
            let dbPresences = [];
            if (activeStudentIds.length > 0) {
                const { data } = await supabase
                    .from(`presences_${schoolSlug}`)
                    .select('*')
                    .in('student_id', activeStudentIds);
                dbPresences = data || [];
            }
                
            presences = (dbPresences || []).map(p => ({
                id: p.id,
                eleveId: p.student_id,
                eleveNom: p.eleve_nom,
                elevePrenom: p.eleve_prenom,
                eleveClasse: p.eleve_classe,
                date: p.date,
                heure: p.heure,
                statut: p.statut
            }));
        }


        // 7. Badges
        let badges = [];
        try {
            let dbBadges = [];
            let bErr = null;
            if (activeStudentIds.length > 0) {
                const result = await supabase
                    .from(`badges_${schoolSlug}`)
                    .select(`
                        *,
                        student:student_id (nom, prenom, classe)
                    `)
                    .eq('parent_id', parentId)
                    .in('student_id', activeStudentIds)
                    .order('earned_at', { ascending: false });
                dbBadges = result.data;
                bErr = result.error;
            }
            
            if (bErr && bErr.code !== '42P01') throw bErr;
            
            badges = (dbBadges || []).map(b => ({
                ...b,
                student_nom: b.student?.nom,
                student_prenom: b.student?.prenom,
                classe: b.student?.classe
            }));

            // Proactif : Si le parent a des enfants mais aucun badge, on tente une génération auto
            if (badges.length === 0 && activeStudentIds.length > 0) {
                for (const sId of activeStudentIds) {
                    await _autoAssignBadgesSync(parentId, sId, schoolSlug);
                }
                // Optionnel : Re-fetch après génération (ou juste attendre la prochaine sync)
            }
        } catch (err) {
            console.warn('[getParentData] Badge retrieval failed:', err.message);
        }

        // 9. E-Learning / Ressources pour les parents
        let resources = [];
        try {
            const activeStudentsForResources = students.filter(s => activeStudentIds.includes(s.id));
            const studentClasses = Array.from(new Set(activeStudentsForResources.map(s => s.classe).filter(Boolean)));
            if (studentClasses.length > 0) {
                const { data: dbResources } = await supabase
                    .from(`resources_${schoolSlug}`)
                    .select('*')
                    .in('classe', studentClasses);
                resources = (dbResources || []).map(r => ({
                    id: r.id,
                    titre: r.titre,
                    description: r.description || '',
                    type: r.type,
                    url: r.url,
                    classe: r.classe,
                    matiere: r.matiere,
                    professeurId: r.professeurId || r.professeurid || '',
                    professeurNom: r.professeurNom || r.professeurnom || '',
                    createdAt: r.createdAt || r.createdat || ''
                }));
            }
        } catch (err) {
            console.warn('[getParentData] E-Learning retrieval failed:', err.message);
        }

        return res.json({
            parentPackAccess,
            announcements: announcements || [],
            announcementReads: (announcementReads || []).map(r => ({
                announcementId: r.announcement_id,
                parentId: r.parent_id,
                readAt: r.read_at,
                remindAt: r.remind_at || null
            })),
            unreadMessages: unreadMessages || 0,
            appSettings,
            students,
            notes,
            matieres,
            classeMatieres,
            badges,
            devoirs,
            presences,
            resources
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

async function toggleDevoirComplete(req, res) {
    const { devoirId } = req.params;
    const { studentId, completed } = req.body;
    const parentId = req.user.id;
    const { schoolSlug } = req.user;

    if (!devoirId || !studentId) {
        return res.status(400).json({ error: 'Paramètres manquants.' });
    }

    try {
        const tbl = (name) => `${name}_${schoolSlug}`;

        // 1. Vérifier que le parent a bien l'élève dans ses enfants
        const { data: link, error: linkErr } = await supabase
            .from(tbl('parent_student'))
            .select('*')
            .eq('parent_id', parentId)
            .eq('student_id', studentId)
            .single();

        if (linkErr || !link) {
            return res.status(403).json({ error: 'Accès refusé pour cet élève.' });
        }

        const packStates = await getAccessStatesForLocalIds(parentId, schoolSlug, [studentId]);
        if (!packStates[studentId] || !packStates[studentId].accessAllowed) {
            return res.status(403).json({
                error: 'Accès Parent Pack suspendu pour cet enfant.',
                code: 'PACK_SUSPENDED'
            });
        }

        // 2. Récupérer le devoir
        const { data: devoir, error: devoirErr } = await supabase
            .from(tbl('devoirs'))
            .select('*')
            .eq('id', devoirId)
            .single();

        if (devoirErr || !devoir) {
            return res.status(404).json({ error: 'Devoir non trouvé.' });
        }

        // 3. Parser et modifier la description
        let desc = devoir.description || '';
        const marker = '\n[COMPLETED_STUDENTS]:';
        const idx = desc.indexOf(marker);
        
        let cleanDesc = idx !== -1 ? desc.substring(0, idx) : desc;
        let listStr = idx !== -1 ? desc.substring(idx + marker.length) : '';
        let completedIds = listStr ? listStr.split(',').filter(Boolean) : [];

        if (completed) {
            if (!completedIds.includes(studentId)) {
                completedIds.push(studentId);
            }
        } else {
            completedIds = completedIds.filter(id => id !== studentId);
        }

        const newDesc = completedIds.length > 0 
            ? `${cleanDesc}${marker}${completedIds.join(',')}` 
            : cleanDesc;

        // 4. Mettre à jour dans la base
        const { error: updateErr } = await supabase
            .from(tbl('devoirs'))
            .update({ description: newDesc })
            .eq('id', devoirId);

        if (updateErr) throw updateErr;

        return res.json({ success: true, description: newDesc });
    } catch (err) {
        console.error('Error toggling devoir completion:', err.message);
        return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
}

/**
 * GET /api/parent/global-children
 * Returns the global portfolio of children for the authenticated parent.
 */
async function getGlobalPortfolio(req, res) {
    const parentId = req.user?.id;
    if (!parentId) return res.status(401).json({ error: 'Non authentifié.' });

    res.set('Cache-Control', 'no-store');

    try {
        const { data: links, error: linksErr } = await supabase
            .from('parent_child_links')
            .select('student_global_id, first_linked_at')
            .eq('parent_ref', parentId);

        if (linksErr) {
            console.error('Erreur récupération portfolio links:', linksErr);
            return res.status(500).json({ error: 'Erreur serveur.' });
        }

        if (!links || links.length === 0) {
            return res.json({ children: [] });
        }

        const linksByGlobalId = {};
        for (const l of links) {
            if (l && l.student_global_id && !linksByGlobalId[l.student_global_id]) {
                linksByGlobalId[l.student_global_id] = l;
            }
        }
        const globalIds = Object.keys(linksByGlobalId);
        if (globalIds.length === 0) {
            return res.json({ children: [] });
        }

        let packStates = {};
        try {
            packStates = await parentPackService.getAccessStatesForGlobalIds(parentId, globalIds);
        } catch (packErr) {
            console.error('Erreur évaluation Parent Pack portfolio:', packErr);
            return res.status(500).json({ error: 'Erreur serveur.' });
        }

        const validChildren = [];

        for (const globalId of globalIds) {
            const { data: mappings, error: mErr } = await supabase
                .from('student_global_mappings')
                .select('school_slug, student_local_id')
                .eq('student_global_id', globalId);

            if (mErr) {
                console.error('Erreur récupération mappings:', mErr);
                return res.status(500).json({ error: 'Erreur serveur.' });
            }

            if (!mappings || mappings.length === 0) {
                continue;
            }

            let validDisplayName = null;
            let currentNomNorm = null;
            let currentPrenomNorm = null;
            let currentDobNorm = null;
            let isContradictory = false;
            let hasMissingHistory = false;
            let hasInvalidDob = false;

            for (const mapping of mappings) {
                let histSlug;
                try {
                    histSlug = validateSlug(mapping.school_slug);
                } catch (e) {
                    hasMissingHistory = true;
                    break;
                }

                const { data: histStudent, error: hsErr } = await supabase
                    .from(`students_${histSlug}`)
                    .select('nom, prenom, date_naissance')
                    .eq('id', mapping.student_local_id)
                    .maybeSingle();

                if (hsErr) {
                    console.error(`Erreur récupération historique ${histSlug}:`, hsErr);
                    return res.status(500).json({ error: 'Erreur serveur.' });
                }

                if (!histStudent) {
                    hasMissingHistory = true;
                    break;
                }

                const histNomNorm = normalizeIdentityText(histStudent.nom);
                const histPrenomNorm = normalizeIdentityText(histStudent.prenom);
                const histDobNorm = normalizeIdentityDate(histStudent.date_naissance);

                if (!histNomNorm || !histPrenomNorm || !histDobNorm) {
                    hasInvalidDob = true;
                    break;
                }

                if (!currentNomNorm) {
                    currentNomNorm = histNomNorm;
                    currentPrenomNorm = histPrenomNorm;
                    currentDobNorm = histDobNorm;
                    validDisplayName = `${histStudent.prenom.trim()} ${histStudent.nom.trim()}`;
                } else {
                    if (currentNomNorm !== histNomNorm || currentPrenomNorm !== histPrenomNorm || currentDobNorm !== histDobNorm) {
                        isContradictory = true;
                        break;
                    }
                }
            }

            if (!hasMissingHistory && !hasInvalidDob && !isContradictory && validDisplayName) {
                validChildren.push({
                    globalId,
                    displayName: validDisplayName,
                    mappings
                });
            }
        }

        const allSlugsSet = new Set();
        for (const child of validChildren) {
            for (const m of child.mappings) {
                try {
                    const cleanSlug = validateSlug(m.school_slug);
                    allSlugsSet.add(cleanSlug);
                } catch {}
            }
        }
        const allSlugs = [...allSlugsSet];

        const schoolsBySlug = {};
        if (allSlugs.length > 0) {
            try {
                const { data: schoolsData, error: sErr } = await supabase
                    .from('schools')
                    .select('slug, name')
                    .in('slug', allSlugs);

                if (sErr) {
                    console.error('Erreur récupération schools');
                    return res.status(500).json({ error: 'Erreur serveur.' });
                }

                (schoolsData || []).forEach(s => {
                    if (s && s.slug) schoolsBySlug[s.slug] = s;
                });
            } catch (schoolsErr) {
                console.error('Exception récupération schools');
                return res.status(500).json({ error: 'Erreur serveur.' });
            }
        }

        const VALID_PACK_STATES = new Set([
            ACCESS_STATES.PAID_ACTIVE,
            ACCESS_STATES.GRACE_ACTIVE,
            ACCESS_STATES.LEGACY_UNDECIDED,
            ACCESS_STATES.PACK_SUSPENDED
        ]);

        for (const child of validChildren) {
            const packState = packStates[child.globalId];
            if (!packState || !VALID_PACK_STATES.has(packState.state) || typeof packState.accessAllowed !== 'boolean') {
                console.error('État Parent Pack invalide ou absent');
                return res.status(500).json({ error: 'Erreur serveur.' });
            }
        }

        const childrenResponse = validChildren.map(child => {
            const distinctSlugs = [];
            const seenSlugs = new Set();
            for (const m of child.mappings) {
                try {
                    const cleanSlug = validateSlug(m.school_slug);
                    if (!seenSlugs.has(cleanSlug)) {
                        seenSlugs.add(cleanSlug);
                        distinctSlugs.push(cleanSlug);
                    }
                } catch {}
            }

            const childSchools = distinctSlugs.map(slug => ({
                school_slug: slug,
                school_name: schoolsBySlug[slug]?.name || slug
            }));

            const packState = packStates[child.globalId];

            const childAccess = {
                state: packState.state,
                accessAllowed: packState.accessAllowed
            };

            const linkInfo = linksByGlobalId[child.globalId];
            if (packState.state === ACCESS_STATES.GRACE_ACTIVE && linkInfo?.first_linked_at) {
                try {
                    const parsedDate = new Date(linkInfo.first_linked_at);
                    if (!isNaN(parsedDate.getTime())) {
                        childAccess.grace_expires_at = new Date(parsedDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    }
                } catch {}
            }

            return {
                student_global_id: child.globalId,
                display_name: child.displayName,
                schools: childSchools,
                access: childAccess
            };
        });

        return res.json({ children: childrenResponse });
    } catch (err) {
        console.error('Erreur getGlobalPortfolio:', err);
        return res.status(500).json({ error: 'Erreur serveur.' });
    }
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
    getParentData,
    toggleDevoirComplete,
    getGlobalPortfolio
};
