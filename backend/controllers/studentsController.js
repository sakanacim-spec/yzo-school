const { supabase } = require('../utils/supabase');

/**
 * GET /api/students
 * Recherche d'élèves par nom, prénom ou classe.
 * Pour les parents : restreint STRICTEMENT aux élèves liés au parent.
 */
async function listStudents(req, res) {
    const { nom, prenom, classe, search } = req.query;
    const parentId = req.user ? req.user.id : null;
    const role = req.user ? req.user.role : null;

    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // Pour les parents : confinement strict aux élèves de la famille
        if (role === 'parent') {
            const { data: links, error: lErr } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('student_id')
                .eq('parent_id', parentId);

            if (lErr) throw lErr;
            const linkedIds = (links || []).map(l => l.student_id);

            if (linkedIds.length === 0) {
                return res.json({ students: [], total: 0 });
            }

            let query = supabase
                .from(`students_${schoolSlug}`)
                .select('*')
                .in('id', linkedIds);

            if (search || nom) {
                const q = (search || nom).toLowerCase().trim();
                query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`);
            }

            const { data: students, error } = await query
                .order('nom', { ascending: true })
                .limit(100);

            if (error) throw error;

            const results = (students || []).map(s => ({
                ...s,
                is_linked: true
            }));

            return res.json({ students: results, total: results.length });
        }

        // Pour les personnels d'établissement (direction, enseignants, comptable, etc.)
        let query = supabase
            .from(`students_${schoolSlug}`)
            .select('*');

        if (search || nom) {
            const q = (search || nom).toLowerCase().trim();
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

        // Vérifier quels élèves sont déjà liés à ce parent (si parentId)
        let linkedIds = [];
        if (parentId) {
            const { data: links } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('student_id')
                .eq('parent_id', parentId);
            if (links) linkedIds = links.map(l => l.student_id);
        }

        const results = (students || []).map(s => ({
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
 * Contrôle strict d'autorisation : le parent ne peut lier que les élèves dont le numéro
 * correspond à son profil officiel, ou action réservée à l'administration de l'école.
 */
async function linkStudentToParent(req, res) {
    const { id: tokenUserId, role, telephone: tokenPhone } = req.user;
    const { studentId, studentIds, parentId: requestedParentId } = req.body;

    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    const isSchoolAdmin = ['admin', 'directeur', 'directeur_general', 'comptable', 'superadmin'].includes(role);
    const targetParentId = (isSchoolAdmin && requestedParentId) ? requestedParentId : tokenUserId;

    if (!isSchoolAdmin && role !== 'parent') {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    const idsToLink = Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
    if (idsToLink.length === 0) {
        return res.status(400).json({ error: 'Au moins un studentId est requis.' });
    }

    try {
        // 1. Charger le profil parent pour obtenir le numéro de téléphone officiel
        const { data: parentProfile, error: pErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, telephone, phone_normalized, role')
            .eq('id', targetParentId)
            .maybeSingle();

        if (pErr || !parentProfile) {
            return res.status(404).json({ error: 'Profil parent introuvable dans cet établissement.' });
        }

        const parentPhone = String(parentProfile.phone_normalized || parentProfile.telephone || tokenPhone || '').trim();

        // 2. Charger les élèves cibles dans l'établissement
        const { data: targetStudents, error: sErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('id, telephone_parent, telephone_parent_normalized')
            .in('id', idsToLink);

        if (sErr || !targetStudents || targetStudents.length === 0) {
            return res.status(404).json({ error: 'Élève(s) introuvable(s) dans cet établissement.' });
        }

        // Pour un utilisateur parent : vérification obligatoire de concordance téléphonique
        if (!isSchoolAdmin) {
            const normParent = parentPhone.replace(/\D/g, '');

            for (const student of targetStudents) {
                const sParentPhone = String(student.telephone_parent_normalized || student.telephone_parent || '').trim();
                const normStudentParent = sParentPhone.replace(/\D/g, '');

                const isPhoneMatch = normParent && normStudentParent && (
                    normParent === normStudentParent ||
                    normParent.endsWith(normStudentParent) ||
                    normStudentParent.endsWith(normParent)
                );

                if (!isPhoneMatch) {
                    return res.status(403).json({
                        error: "Liaison non autorisée : Le numéro de téléphone de votre compte ne correspond pas au dossier de cet élève."
                    });
                }
            }
        }

        // 3. Insertion idempotente des liens
        const validStudentIds = targetStudents.map(s => s.id);
        const { data: existingLinks } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('student_id')
            .eq('parent_id', targetParentId)
            .in('student_id', validStudentIds);

        const alreadyLinkedIds = (existingLinks || []).map(l => l.student_id);
        const newIdsToLink = validStudentIds.filter(sId => !alreadyLinkedIds.includes(sId));

        if (newIdsToLink.length > 0) {
            const rowsToInsert = newIdsToLink.map(sId => ({
                parent_id: targetParentId,
                student_id: sId
            }));

            const { error: insErr } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .insert(rowsToInsert);

            if (insErr && insErr.code !== '23505') {
                throw insErr;
            }
        }

        // Auto-assignation des badges
        for (const sId of validStudentIds) {
            await _autoAssignBadges(targetParentId, sId, schoolSlug);
        }

        return res.status(201).json({
            message: `${validStudentIds.length} élève(s) lié(s) avec succès.`
        });
    } catch (err) {
        console.error('Link Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la liaison des élèves.' });
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

/**
 * DELETE /api/students/unlink/:studentId
 * Retire la liaison parent-élève.
 */
async function unlinkStudentFromParent(req, res) {
    const { id: tokenUserId, role, schoolSlug } = req.user;
    const { studentId } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!studentId) {
        return res.status(400).json({ error: "studentId est requis." });
    }

    const isSchoolAdmin = ['admin', 'directeur', 'directeur_general', 'superadmin'].includes(role);
    const parentId = isSchoolAdmin ? (req.query.parentId || tokenUserId) : tokenUserId;

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
