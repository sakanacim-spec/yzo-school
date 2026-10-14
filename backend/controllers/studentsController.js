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
    const { studentId, studentIds, parentId: requestedParentId, targetParentId: requestedTargetParentId } = req.body;
    const bodyParentId = requestedParentId || requestedTargetParentId;

    const schoolSlug = req.user ? req.user.schoolSlug : null;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    const isSchoolAdmin = ['admin', 'directeur', 'directeur_general', 'superadmin'].includes(role);

    // Contrôle strict de l'identité :
    // Un utilisateur avec le rôle parent ne peut JAMAIS spécifier de parentId ou targetParentId arbitraire dans la requête.
    if (!isSchoolAdmin) {
        if (role !== 'parent') {
            return res.status(403).json({ error: 'Permission refusée.' });
        }
        if (bodyParentId && String(bodyParentId) !== String(tokenUserId)) {
            return res.status(403).json({ error: 'Usurpation d\'identité interdite : vous ne pouvez demander un rattachement que pour votre propre compte.' });
        }
    }

    const targetParentId = (isSchoolAdmin && bodyParentId) ? bodyParentId : tokenUserId;

    const idsToLink = Array.isArray(studentIds) ? studentIds : (studentId ? [studentId] : []);
    if (idsToLink.length === 0) {
        return res.status(400).json({ error: 'Au moins un studentId est requis.' });
    }

    try {
        // 1. Charger le profil parent pour obtenir le numéro de téléphone officiel et le nom
        const { data: parentProfile, error: pErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, phone_normalized, role')
            .eq('id', targetParentId)
            .maybeSingle();

        if (pErr || !parentProfile) {
            return res.status(404).json({ error: 'Profil parent introuvable dans cet établissement.' });
        }

        const parentPhone = String(parentProfile.phone_normalized || parentProfile.telephone || tokenPhone || '').trim();
        const parentName = String(parentProfile.nom || 'Parent').trim();

        // 2. Charger les élèves cibles dans l'établissement
        // Load target students – always use the IN query which works for both single and multiple IDs.
        const { data: targetStudents, error: sErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('id, nom, prenom, classe, telephone_parent, telephone_parent_normalized')
            .in('id', idsToLink);
        if (sErr) {
            // Propagate Supabase error as a 500 response.
            return res.status(500).json({ error: 'Erreur lors de la récupération des élèves.' });
        }
        if (!targetStudents || targetStudents.length === 0) {
            // No matching students found – reject the request.
            return res.status(404).json({ error: 'Élève(s) introuvable(s) dans cet établissement.' });
        }

        // Fonction locale de normalisation E.164 stricte sans déduction arbitraire de pays ni contournement regex
        const toStrictE164 = (phone, normalizedField) => {
            const norm = String(normalizedField || '').trim();
            if (norm) {
                try {
                    return normalizePhone(norm);
                } catch {
                    return null;
                }
            }
            const raw = String(phone || '').trim();
            if (!raw) return null;
            try {
                return normalizePhone(raw);
            } catch {
                return null;
            }
        };

        const parentE164 = toStrictE164(parentProfile.telephone || tokenPhone, parentProfile.phone_normalized);

        // Pour un utilisateur parent : vérification obligatoire de concordance téléphonique
        if (!isSchoolAdmin) {
            if (!parentE164) {
                return res.status(403).json({
                    error: "Liaison non autorisée : Le numéro de téléphone de votre compte est incomplet ou invalide."
                });
            }

            for (const student of targetStudents) {
                const studentE164 = toStrictE164(student.telephone_parent, student.telephone_parent_normalized);
                // Concordance automatique uniquement si les deux numéros sont normalisés et strictement égaux
                const isPhoneMatch = !!(studentE164 && parentE164 === studentE164);

                if (!isPhoneMatch) {
                    return res.status(403).json({
                        error: "Liaison non autorisée : Le numéro de téléphone de votre compte ne correspond pas au dossier de cet élève."
                    });
                }
            }
        }

        // ====================================================================
        // Option A : Création exclusive de demande 'pending' pour parents et administrateurs
        // Aucune création directe de lien local ou global
        // Aucune approbation automatique via RPC
        // ====================================================================
        let createdCount = 0;
        let alreadyPendingCount = 0;
        let alreadyPendingVerificationCount = 0;
        let alreadyLinkedCount = 0;

        for (const student of targetStudents) {
            const studentE164 = toStrictE164(student.telephone_parent, student.telephone_parent_normalized);
            const isPhoneMatch = !!(parentE164 && studentE164 && parentE164 === studentE164);

            // Vérifier l'existence d'un lien actif ou historique déjà présent dans parent_student_<schoolSlug>
            const { data: existingLocalLink, error: existingLinkErr } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('student_id')
                .eq('parent_id', targetParentId)
                .eq('student_id', student.id)
                .maybeSingle();

            if (existingLinkErr) {
                console.error('Erreur lors de la vérification du lien local existant:', existingLinkErr);
                return res.status(500).json({ error: 'Erreur interne lors de la vérification du lien.' });
            }

            if (existingLocalLink) {
                alreadyLinkedCount++;
                continue;
            }

            // Insertion sécurisée de la demande d'approbation
            const { data: insertReq, error: reqErr } = await supabase
                .from('parent_student_link_requests')
                .insert({
                    school_slug: schoolSlug,
                    parent_id: targetParentId,
                    student_id: String(student.id),
                    parent_phone_normalized: parentE164 || String(parentPhone).replace(/\D/g, ''),
                    parent_name: parentName,
                    student_name: `${student.prenom || ''} ${student.nom || ''}`.trim(),
                    student_class: student.classe || null,
                    phone_matched: isPhoneMatch,
                    status: 'pending',
                    source: 'manual_request'
                })
                .select('id')
                .maybeSingle();

            if (reqErr) {
                // Fail-closed si la table de migration n'est pas encore déployée
                if (reqErr.code === '42P01') {
                    return res.status(503).json({
                        error: 'FEATURE_UNAVAILABLE',
                        message: "Le service de demande de rattachement est temporairement indisponible."
                    });
                }
                // Protection anti-doublon (index uq_link_requests_single_pending_review ou uq_link_requests_single_approved)
                if (reqErr.code === '23505') {
                    // Recherche de la demande active correspondante (status 'pending' ou 'pending_verification')
                    const { data: pendingReq, error: pendingErr } = await supabase
                        .from('parent_student_link_requests')
                        .select('id, status')
                        .eq('school_slug', schoolSlug)
                        .eq('parent_id', targetParentId)
                        .eq('student_id', String(student.id))
                        .in('status', ['pending', 'pending_verification'])
                        .maybeSingle();

                    if (pendingErr) {
                        console.error('Error reading pending request:', pendingErr);
                        return res.status(500).json({ error: 'Erreur interne lors de la lecture de la demande pending.' });
                    }
                    if (pendingReq) {
                        if (pendingReq.status === 'pending') {
                            alreadyPendingCount++;
                            continue;
                        }
                        if (pendingReq.status === 'pending_verification') {
                            alreadyPendingVerificationCount++;
                            continue;
                        }
                    }

                    // Aucune demande pending correspondante retrouvée : rejet sécurisé fail-closed
                    console.warn('Duplicate insert but no matching pending request found.');
                    return res.status(400).json({ error: 'Conflit de doublon sans demande pending correspondante.' });
                }

                console.error('Erreur insertion parent_student_link_requests:', reqErr);
                return res.status(500).json({ error: 'Erreur lors de la soumission de la demande de rattachement.' });
            }

            // Vérification stricte de confirmation Supabase avec UUID valide (fail-closed)
            if (!insertReq || !insertReq.id || !isValidUUID(insertReq.id)) {
                console.error('Incohérence insertion Supabase : demande non confirmée avec UUID valide:', { targetParentId, studentId: student.id, insertReq });
                return res.status(500).json({ error: 'Erreur interne lors de la confirmation de la demande de rattachement.' });
            }

            createdCount++;
        }

        const hasPendingRequests = createdCount > 0 || alreadyPendingCount > 0;

        // Cas où tous les élèves sélectionnés possèdent déjà un lien local actif
        // Aucune demande pending n'a été créée ou retrouvée : renvoi HTTP 200 immédiat
        if (!hasPendingRequests && alreadyPendingVerificationCount === 0 && alreadyLinkedCount > 0) {
            return res.status(200).json({
                message: "Les élèves sélectionnés sont déjà rattachés à votre compte.",
                status: 'already_linked',
                created: 0,
                alreadyPending: 0,
                alreadyPendingVerification: 0,
                alreadyLinked: alreadyLinkedCount,
                // Alias rétrocompatible déprécié (ne prouve pas une approbation directoriale formelle)
                alreadyApproved: alreadyLinkedCount
            });
        }

        // Cas où seule une ou plusieurs demandes 'pending_verification' existent
        // Aucune demande 'pending' créée ou retrouvée : renvoi HTTP 200 explicite et sécurisé (pas de 202)
        if (!hasPendingRequests && alreadyPendingVerificationCount > 0) {
            return res.status(200).json({
                message: "Une demande de rattachement est déjà en cours de vérification pour cet élève.",
                status: 'pending_verification',
                created: 0,
                alreadyPending: 0,
                alreadyPendingVerification: alreadyPendingVerificationCount,
                alreadyLinked: alreadyLinkedCount,
                // Alias rétrocompatible déprécié (ne prouve pas une approbation directoriale formelle)
                alreadyApproved: alreadyLinkedCount
            });
        }

        // Cas avec au moins une demande pending créée ou retrouvée (cas pur ou cas mixte) :
        // Renvoi HTTP 202 strictement réservé aux demandes réellement transmises ou en attente
        return res.status(202).json({
            message: "Votre demande de rattachement a été transmise à la direction de l'établissement pour validation.",
            status: 'pending',
            created: createdCount,
            alreadyPending: alreadyPendingCount,
            alreadyPendingVerification: alreadyPendingVerificationCount,
            alreadyLinked: alreadyLinkedCount,
            // Alias rétrocompatible déprécié (ne prouve pas une approbation directoriale formelle)
            alreadyApproved: alreadyLinkedCount
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
    if (!isSchoolAdmin && req.query && req.query.parentId && req.query.parentId !== tokenUserId) {
        return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    const parentId = isSchoolAdmin ? ((req.query && req.query.parentId) || tokenUserId) : tokenUserId;

    try {
        if (typeof supabase.rpc !== 'function') {
            console.error('Unlink Error: supabase.rpc non disponible.');
            return res.status(500).json({ error: 'Service de détachement non disponible.' });
        }

        const { data: rpcData, error: rpcErr } = await supabase.rpc('unlink_parent_student_local', {
            p_school_slug: schoolSlug,
            p_parent_id: parentId,
            p_student_id: String(studentId),
            p_actor_id: tokenUserId
        });

        if (rpcErr) {
            console.error('Unlink RPC Error:', rpcErr.message || rpcErr);
            return res.status(500).json({ error: 'Erreur lors de la suppression du lien.' });
        }

        if (!rpcData || typeof rpcData !== 'object') {
            console.error('Unlink Error: Réponse RPC invalide.');
            return res.status(500).json({ error: 'Réponse RPC invalide.' });
        }

        if (!rpcData.success) {
            if (rpcData.error === 'LINK_NOT_FOUND') {
                return res.status(404).json({ error: rpcData.message || 'Lien introuvable.' });
            }
            if (rpcData.error === 'UNAUTHORIZED_ACTOR' || rpcData.error === 'ACTOR_NOT_IN_SCHOOL') {
                return res.status(403).json({ error: rpcData.message || 'Accès non autorisé.' });
            }
            if (rpcData.error === 'CONCURRENCY_LOCK_TIMEOUT') {
                return res.status(409).json({ error: rpcData.message || 'Conflit de verrouillage temporaire.' });
            }
            return res.status(500).json({ error: rpcData.message || 'Erreur lors de la suppression du lien.' });
        }

        return res.json({
            message: "Enfant retiré avec succès.",
            local_deleted: rpcData.local_deleted,
            has_other_legitimate_link: rpcData.has_other_legitimate_link,
            global_link_deactivated: rpcData.global_link_deactivated
        });
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
