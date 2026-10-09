const { supabase } = require('../utils/supabase');
const { validateSlug, normalizeIdentityText, normalizeIdentityDate, normalizePhone, isValidUUID } = require('../utils/helpers');

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

            const results = await Promise.all((students || []).map(async (s) => {
                let photoUrl = s.photo_url;
                if (photoUrl && !photoUrl.startsWith('http')) {
                    try {
                        const { data: sData } = await supabase.storage
                            .from('student-photos')
                            .createSignedUrl(photoUrl, 900); // 15 minutes
                        if (sData?.signedUrl) photoUrl = sData.signedUrl;
                    } catch (e) {
                        console.error('Erreur signature photo:', e.message);
                    }
                }
                return {
                    ...s,
                    photo_url: photoUrl,
                    photo_storage_path: s.photo_url,
                    is_linked: true
                };
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

        const results = await Promise.all((students || []).map(async (s) => {
            let photoUrl = s.photo_url;
            if (photoUrl && !photoUrl.startsWith('http')) {
                try {
                    const { data: sData } = await supabase.storage
                        .from('student-photos')
                        .createSignedUrl(photoUrl, 900); // 15 minutes
                    if (sData?.signedUrl) photoUrl = sData.signedUrl;
                } catch (e) {
                    console.error('Erreur signature photo:', e.message);
                }
            }
            return {
                ...s,
                photo_url: photoUrl,
                photo_storage_path: s.photo_url,
                is_linked: linkedIds.includes(s.id)
            };
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
            for (const sId of newIdsToLink) {
                const { data: destStudent, error: sErr2 } = await supabase
                    .from(`students_${schoolSlug}`)
                    .select('nom, prenom, date_naissance')
                    .eq('id', sId)
                    .maybeSingle();

                if (sErr2) return res.status(500).json({ error: 'INTERNAL_ERROR' });
                if (!destStudent) return res.status(500).json({ error: 'INTERNAL_ERROR' });

                let rpcCalls = 0;
                let globalId = null;
                let destMappedReload = false;

                while (true) {
                    const { data: pLinks, error: pErrLinks } = await supabase.from('parent_child_links').select('student_global_id').eq('parent_ref', String(targetParentId));
                    if (pErrLinks) return res.status(500).json({ error: 'INTERNAL_ERROR' });

                    const expectedGlobalIds = [...new Set((pLinks || []).map(l => l.student_global_id))];

                    const { data: mData, error: mErrData } = await supabase.from('student_global_mappings').select('student_global_id').eq('school_slug', schoolSlug).eq('student_local_id', String(sId)).maybeSingle();
                    if (mErrData) return res.status(500).json({ error: 'INTERNAL_ERROR' });

                    if (mData) {
                        const exGx = mData.student_global_id;
                        const { data: exLink, error: exLinkErr } = await supabase.from('parent_child_links').select('*').eq('parent_ref', String(targetParentId)).eq('student_global_id', exGx).maybeSingle();
                        if (exLinkErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });

                        if (exLink) {
                            const { error: updErr } = await supabase.from('parent_child_links').update({ current_link_active: true }).eq('parent_ref', String(targetParentId)).eq('student_global_id', exGx);
                            if (updErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });
                            globalId = exGx;
                            break;
                        } else {
                            if (expectedGlobalIds.length > 0) {
                                const evalRes = await _evaluateSameChild(destStudent, expectedGlobalIds);
                                if (evalRes.status === 'INTERNAL_ERROR') return res.status(500).json({ error: 'INTERNAL_ERROR' });
                                if (evalRes.status === 'IDENTITY_EVIDENCE_INSUFFICIENT') return res.status(409).json({ error: 'IDENTITY_EVIDENCE_INSUFFICIENT' });
                                if (evalRes.status === 'IDENTITY_EVIDENCE_UNAVAILABLE') return res.status(503).json({ error: 'IDENTITY_EVIDENCE_UNAVAILABLE' });
                                if (evalRes.status === 'MULTIPLE_IDENTITY_MATCHES') return res.status(409).json({ error: 'MULTIPLE_IDENTITY_MATCHES' });
                                if (evalRes.status === 'MATCH') {
                                    if (evalRes.matchedGlobalId !== exGx) {
                                        return res.status(409).json({ error: 'GLOBAL_IDENTITY_OWNERSHIP_CONFLICT' });
                                    }
                                }
                            }

                            const { error: lErr } = await supabase.from('parent_child_links').insert({
                                parent_ref: String(targetParentId),
                                student_global_id: exGx,
                                first_linked_at: new Date().toISOString(),
                                current_link_active: true
                            });

                            if (lErr && lErr.code === '23505') {
                                const { data: verifyLink, error: verErr } = await supabase.from('parent_child_links').select('*').eq('parent_ref', String(targetParentId)).eq('student_global_id', exGx).maybeSingle();
                                if (verErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });
                                if (verifyLink) {
                                    const { error: rUpdErr } = await supabase.from('parent_child_links').update({ current_link_active: true }).eq('parent_ref', String(targetParentId)).eq('student_global_id', exGx);
                                    if (rUpdErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });
                                } else {
                                    return res.status(500).json({ error: 'INTERNAL_ERROR' });
                                }
                            } else if (lErr) {
                                return res.status(500).json({ error: 'INTERNAL_ERROR' });
                            }
                            globalId = exGx;
                            break;
                        }
                    } else {
                        if (destMappedReload) {
                            return res.status(500).json({ error: 'INTERNAL_ERROR' });
                        }

                        if (expectedGlobalIds.length > 0) {
                            const evalRes = await _evaluateSameChild(destStudent, expectedGlobalIds);
                            if (evalRes.status === 'INTERNAL_ERROR') return res.status(500).json({ error: 'INTERNAL_ERROR' });
                            if (evalRes.status === 'IDENTITY_EVIDENCE_INSUFFICIENT') return res.status(409).json({ error: 'IDENTITY_EVIDENCE_INSUFFICIENT' });
                            if (evalRes.status === 'IDENTITY_EVIDENCE_UNAVAILABLE') return res.status(503).json({ error: 'IDENTITY_EVIDENCE_UNAVAILABLE' });
                            if (evalRes.status === 'MULTIPLE_IDENTITY_MATCHES') return res.status(409).json({ error: 'MULTIPLE_IDENTITY_MATCHES' });
                            if (evalRes.status === 'MATCH') {
                                return res.status(409).json({ error: 'TRANSFER_REQUIRED', studentId: sId, target_student_global_id: evalRes.matchedGlobalId });
                            }
                        }

                        if (rpcCalls >= 3) {
                            return res.status(500).json({ error: 'INTERNAL_ERROR' });
                        }

                        rpcCalls++;
                        const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_and_link_new_global_student', {
                            p_school_slug: schoolSlug,
                            p_student_local_id: String(sId),
                            p_parent_ref: String(targetParentId),
                            p_expected_global_ids: expectedGlobalIds
                        });

                        if (rpcErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });
                        if (rpcRes && rpcRes.status === 'created') {
                            globalId = rpcRes.student_global_id;
                            break;
                        } else if (rpcRes && rpcRes.status === 'PORTFOLIO_CHANGED') {
                            continue;
                        } else if (rpcRes && rpcRes.status === 'DESTINATION_ALREADY_MAPPED') {
                            destMappedReload = true;
                            continue;
                        } else {
                            return res.status(500).json({ error: 'INTERNAL_ERROR' });
                        }
                    }
                }

                if (!globalId) {
                    return res.status(500).json({ error: 'INTERNAL_ERROR' });
                }

                const { error: insErr } = await supabase.from(`parent_student_${schoolSlug}`).insert({
                    parent_id: targetParentId,
                    student_id: sId
                });
                if (insErr && insErr.code !== '23505') {
                    throw insErr;
                }
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
        // P25-A : Désactiver le lien global D'ABORD sans toucher à first_linked_at
        const { data: mapping } = await supabase
            .from('student_global_mappings')
            .select('student_global_id')
            .eq('school_slug', schoolSlug)
            .eq('student_local_id', String(studentId))
            .maybeSingle();

        if (mapping) {
            const { error: updErr } = await supabase
                .from('parent_child_links')
                .update({ current_link_active: false })
                .eq('parent_ref', String(parentId))
                .eq('student_global_id', mapping.student_global_id);
            if (updErr) throw updErr;
        }

        // Ensuite, suppression locale
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

async function transferIdentity(req, res) {
    try {
        const { id: parent_ref, schoolSlug: rawSchoolSlug, telephone: tokenPhone } = req.user;
        const { studentId, target_student_global_id } = req.body;

        if (!parent_ref || !target_student_global_id || studentId === undefined || !rawSchoolSlug) {
            return res.status(400).json({ error: 'INVALID_PARAMETER' });
        }

        if (typeof studentId !== 'string' || studentId.trim() === '') {
            return res.status(400).json({ error: 'INVALID_PARAMETER' });
        }
        const safeStudentId = studentId.trim();

        if (!isValidUUID(target_student_global_id)) {
            return res.status(400).json({ error: 'INVALID_PARAMETER' });
        }

        let destination_school_slug;
        try {
            destination_school_slug = validateSlug(rawSchoolSlug);
        } catch (e) {
            return res.status(400).json({ error: 'INVALID_PARAMETER' });
        }

        // 3. TARGET GLOBAL STUDENT OWNERSHIP
        const { data: targetLink, error: targetLinkErr } = await supabase
            .from('parent_child_links')
            .select('student_global_id')
            .eq('parent_ref', String(parent_ref))
            .eq('student_global_id', target_student_global_id)
            .maybeSingle();

        if (targetLinkErr || !targetLink) {
            return res.status(403).json({ error: 'TARGET_NOT_OWNED' });
        }

        // 4. DESTINATION STUDENT OWNERSHIP
        const { data: parentProfile, error: pErr } = await supabase
            .from(`profiles_${destination_school_slug}`)
            .select('id, telephone, phone_normalized')
            .eq('id', parent_ref)
            .maybeSingle();

        if (pErr || !parentProfile) {
            return res.status(403).json({ error: 'DESTINATION_NOT_OWNED' });
        }

        const parentPhone = String(parentProfile.phone_normalized || parentProfile.telephone || tokenPhone || '').trim();

        const { data: destStudent, error: sErr } = await supabase
            .from(`students_${destination_school_slug}`)
            .select('id, nom, prenom, date_naissance, telephone_parent, telephone_parent_normalized')
            .eq('id', safeStudentId)
            .maybeSingle();

        if (sErr || !destStudent) {
            return res.status(403).json({ error: 'DESTINATION_NOT_OWNED' });
        }

        const sParentPhone = String(destStudent.telephone_parent_normalized || destStudent.telephone_parent || '').trim();

        let parentOwnsDest = false;
        if (parentPhone && sParentPhone) {
            try {
                if (normalizePhone(parentPhone) === normalizePhone(sParentPhone)) parentOwnsDest = true;
            } catch (e) {
                if (parentPhone === sParentPhone) parentOwnsDest = true;
            }
        } else if (parentPhone === sParentPhone && parentPhone) {
            parentOwnsDest = true;
        }

        if (!parentOwnsDest) {
            return res.status(403).json({ error: 'DESTINATION_NOT_OWNED' });
        }

        const destNom = normalizeIdentityText(destStudent.nom);
        const destPrenom = normalizeIdentityText(destStudent.prenom);
        const destDob = normalizeIdentityDate(destStudent.date_naissance);

        if (!destNom || !destPrenom || !destDob) {
            return res.status(422).json({ error: 'IDENTITY_EVIDENCE_INSUFFICIENT' });
        }

        // 5 & 6. ENUMERATE ALL HISTORICAL MAPPINGS
        const evalRes = await _evaluateSameChild(destStudent, [target_student_global_id]);
        if (evalRes.status === 'INTERNAL_ERROR') return res.status(500).json({ error: 'INTERNAL_ERROR' });
        if (evalRes.status === 'IDENTITY_EVIDENCE_INSUFFICIENT') return res.status(422).json({ error: 'IDENTITY_EVIDENCE_INSUFFICIENT' });
        if (evalRes.status === 'IDENTITY_EVIDENCE_UNAVAILABLE') return res.status(503).json({ error: 'IDENTITY_EVIDENCE_UNAVAILABLE' });
        if (evalRes.status === 'NO_MATCH' || evalRes.status === 'MULTIPLE_IDENTITY_MATCHES') {
            return res.status(409).json({ error: 'IDENTITY_CONFLICT' });
        }


        // 11. DESTINATION MAPPING PRECHECK (Moved after SAME-CHILD)
        const { data: existingMap, error: emErr } = await supabase
            .from('student_global_mappings')
            .select('student_global_id')
            .eq('school_slug', destination_school_slug)
            .eq('student_local_id', safeStudentId)
            .maybeSingle();

        if (emErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });

        if (existingMap) {
            if (existingMap.student_global_id === target_student_global_id) {
                return res.json({ status: 'already_mapped' });
            } else {
                return res.status(409).json({ error: 'MAPPING_CONFLICT' });
            }
        }

        // 12. MUTATION
        const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_parent_student_identity_transfer', {
            p_parent_ref: String(parent_ref),
            p_student_global_id: target_student_global_id,
            p_destination_school_slug: destination_school_slug,
            p_destination_student_local_id: safeStudentId
        });

        if (rpcError) {
            return res.status(500).json({ error: 'INTERNAL_ERROR' });
        }

        if (rpcResult && rpcResult.status === 'created') {
            return res.json({ status: 'created' });
        }
        if (rpcResult && rpcResult.status === 'already_mapped') {
            return res.json({ status: 'already_mapped' });
        }
        if (rpcResult && rpcResult.status === 'error') {
            if (rpcResult.message === 'MAPPING_CONFLICT') return res.status(409).json({ error: 'MAPPING_CONFLICT' });
            if (rpcResult.message === 'TARGET_NOT_OWNED') return res.status(403).json({ error: 'TARGET_NOT_OWNED' });
            if (rpcResult.message === 'INVALID_PARAMETER') return res.status(400).json({ error: 'INVALID_PARAMETER' });
            if (rpcResult.message === 'TARGET_NOT_FOUND') return res.status(404).json({ error: 'TARGET_NOT_FOUND' });
        }

        return res.status(500).json({ error: 'INTERNAL_ERROR' });

    } catch (err) {
        return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
}

async function _evaluateSameChild(destStudent, candidateGlobalIds) {
    const destNom = normalizeIdentityText(destStudent.nom);
    const destPrenom = normalizeIdentityText(destStudent.prenom);
    const destDob = normalizeIdentityDate(destStudent.date_naissance);

    if (!destNom || !destPrenom || !destDob) {
        return { status: 'IDENTITY_EVIDENCE_INSUFFICIENT' };
    }

    const matches = [];

    for (const gid of candidateGlobalIds) {
        const { data: mappings, error: mErr } = await supabase
            .from('student_global_mappings')
            .select('school_slug, student_local_id')
            .eq('student_global_id', gid);

        if (mErr) return { status: 'INTERNAL_ERROR' };
        if (!mappings || mappings.length === 0) {
            return { status: 'IDENTITY_EVIDENCE_INSUFFICIENT' };
        }

        let isMatch = true;
        for (const mapping of mappings) {
            let histSlug;
            try {
                histSlug = validateSlug(mapping.school_slug);
            } catch (err) {
                return { status: 'IDENTITY_EVIDENCE_UNAVAILABLE' };
            }

            const { data: histStudent, error: hsErr } = await supabase
                .from(`students_${histSlug}`)
                .select('nom, prenom, date_naissance')
                .eq('id', mapping.student_local_id)
                .maybeSingle();

            if (hsErr) return { status: 'INTERNAL_ERROR' };
            if (!histStudent) return { status: 'IDENTITY_EVIDENCE_UNAVAILABLE' };

            const histNom = normalizeIdentityText(histStudent.nom);
            const histPrenom = normalizeIdentityText(histStudent.prenom);
            const histDob = normalizeIdentityDate(histStudent.date_naissance);

            if (!histNom || !histPrenom || !histDob) {
                return { status: 'IDENTITY_EVIDENCE_INSUFFICIENT' };
            }

            if (histNom !== destNom || histPrenom !== destPrenom || histDob !== destDob) {
                isMatch = false;
                break;
            }
        }

        if (isMatch) {
            matches.push(gid);
        }
    }

    if (matches.length === 0) return { status: 'NO_MATCH' };
    if (matches.length === 1) return { status: 'MATCH', matchedGlobalId: matches[0] };
    return { status: 'MULTIPLE_IDENTITY_MATCHES' };
}

module.exports = { listStudents, linkStudentToParent, unlinkStudentFromParent, countStudents, transferIdentity };
