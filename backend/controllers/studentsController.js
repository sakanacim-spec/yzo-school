const { supabase } = require('../utils/supabase');

/**
 * GET /api/students
 * Recherche d'élèves par nom, prénom ou classe.
 */
async function listStudents(req, res) {
    const { nom, prenom, classe, search } = req.query;
    const parentId = req.user ? req.user.id : null;

    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        let query = supabase
            .from(`students_${schoolSlug}`)
            .select('*');

        if (search || nom) {
            const q = (search || nom).toLowerCase().trim();
            // Recherche flexible : nom, prénom, ou combinaison
            query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`);
        }

        if (prenom && !search && prenom !== nom) {
            query = query.ilike('prenom', `%${prenom}%`);
        }

        if (classe) {
            query = query.ilike('classe', `%${classe}%`);
        }

        const { data: students, error } = await query
            .order('nom', { ascending: true })
            .limit(100);

        if (error) throw error;

        // Vérifier quels élèves sont déjà liés à ce parent
        let linkedIds = [];
        if (parentId) {
            const { data: links } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('student_id')
                .eq('parent_id', parentId);
            if (links) linkedIds = links.map(l => l.student_id);
        }

        const results = students.map(s => ({
            ...s,
            is_linked: linkedIds.includes(s.id)
        }));

        return res.json({ students: results, total: results.length });
    } catch (err) {
        console.error('ListStudents Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération des élèves.' });
    }
}

/**
 * GET /api/students/count
 * Compte le nombre total d'élèves dans la base
 */
async function countStudents(req, res) {
    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        const { count, error } = await supabase
            .from(`students_${schoolSlug}`)
            .select('*', { count: 'exact', head: true });

        if (error) throw error;
        return res.json({ count: count || 0 });
    } catch (err) {
        console.error('CountStudents Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors du comptage.' });
    }
}

/**
 * POST /api/students/link
 * Lie un ou plusieurs élèves à un parent.
 */
async function linkStudentToParent(req, res) {
    const { id: parentId } = req.user;
    const { studentId, studentIds } = req.body;

    // Supporter à la fois un ID unique ou un tableau d'IDs (Multi-select)
    const idsToLink = Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);

    if (idsToLink.length === 0) {
        return res.status(400).json({ error: "Au moins un studentId est requis." });
    }

    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // En l'absence d'index unique composite (parent_id, student_id) sur la table parent_student, 
        // l'upsert onConflict échoue. On utilise donc des inserts individuels.
        const errors = [];
        for (const sId of idsToLink) {
            const { error } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .insert({ parent_id: parentId, student_id: sId });
            
            // On ignore l'erreur si le lien existe déjà (code 23505 = duplicate key)
            if (error && error.code !== '23505') {
                errors.push(`${sId}: ${error.message}`);
            }
        }

        if (errors.length > 0 && errors.length === idsToLink.length) {
            throw new Error("Toutes les liaisons ont échoué : " + errors.join(', '));
        }

        // Auto-assignation des badges de base
        for (const sId of idsToLink) {
            await _autoAssignBadges(parentId, sId, schoolSlug);
        }

        return res.status(201).json({
            message: `${idsToLink.length} élève(s) lié(s) avec succès.`
        });
    } catch (err) {
        console.error('Link Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la liaison des élèves : ' + err.message });
    }
}

async function _autoAssignBadges(parentId, studentId, schoolSlug) {
    try {
        const { data: student } = await supabase
            .from(`students_${schoolSlug}`)
            .select('*')
            .eq('id', studentId)
            .single();

        if (!student) return;

        const addBadge = async (code, label, description, icon) => {
            const { data: exists, error } = await supabase
                .from(`badges_${schoolSlug}`)
                .select('id')
                .eq('parent_id', parentId)
                .eq('student_id', studentId)
                .eq('code', code)
                .single();

            // Ignore PGRST116 (No rows found) which is expected, 
            // and 42P01 (Table missing) to be resilient
            if (error && !['PGRST116', '42P01'].includes(error.code)) {
                console.warn(`⚠️ Badge error [${code}]:`, error.message);
                return;
            }

            if (!exists) {
                const { error: insErr } = await supabase.from(`badges_${schoolSlug}`).insert({
                    parent_id: parentId,
                    student_id: studentId,
                    code,
                    label,
                    description,
                    icon,
                    earned_at: new Date().toISOString()
                });
                if (insErr && insErr.code !== '42P01') console.warn(`⚠️ Badge insert error:`, insErr.message);
            }
        };

        await addBadge('welcome', 'Parent Responsable', 'Compte créé et enfant enregistré', '⭐');

        if (student.status === 'Soldé') {
            await addBadge('fully_paid', 'Paiement Complet', 'Scolarité entièrement réglée', '🏆');
        }

        const ratio = student.ecolage > 0 ? student.deja_paye / student.ecolage : 0;
        if (ratio >= 0.5 && student.status !== 'Soldé') {
            await addBadge('half_paid', '2ème Tranche Validée', 'Plus de 50% de la scolarité payée', '🥈');
        }
    } catch (err) {
        console.error('Badge Error:', err.message);
    }
}

async function unlinkStudentFromParent(req, res) {
    const { id: parentId } = req.user;
    const { studentId } = req.params;
    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!studentId) {
        return res.status(400).json({ error: "studentId est requis." });
    }

    try {
        const { error } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .delete()
            .eq('parent_id', parentId)
            .eq('student_id', studentId);

        if (error) throw error;

        return res.json({ message: "Enfant retiré avec succès." });
    } catch (err) {
        console.error('Unlink Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la suppression du lien.' });
    }
}

module.exports = { listStudents, linkStudentToParent, unlinkStudentFromParent, countStudents };
