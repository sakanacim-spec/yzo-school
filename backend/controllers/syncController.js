const { supabase } = require('../utils/supabase');
const { sendPushNotification } = require('../utils/webPush');

/**
 * POST /api/sync
 * Receives data from frontend and syncs to Supabase.
 * ⚡ MULTI-TABLE : Toutes les opérations utilisent des tables suffixées
 */
async function syncFromFrontend(req, res) {
    console.log('🔄 [Sync] Request received');

    if (!req.user) {
        return res.status(401).json({ error: 'Authentification requise.' });
    }

    const { students = [], presences = [], activityLogs = [], appSettings = null, replace = false, matieres = [], classeMatieres = [], notes = [] } = req.body;
    const { role, schoolSlug } = req.user;

    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    // Le schoolSlug est obligatoire pour synchroniser
    if (!schoolSlug) {
        return res.status(403).json({ error: 'Compte non associé à un établissement spécifique.' });
    }

    // Helper function pour générer les noms de table dynamiques
    const tbl = (name) => `${name}_${schoolSlug}`;

    try {
        if (replace) {
            console.log('🧹 [Sync] Mode Remplacer activé : Nettoyage universel de la base locale...');
            
            await supabase.from(tbl('presences')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from(tbl('parent_student')).delete().neq('student_id', '00000000-0000-0000-0000-000000000000');
            await supabase.from(tbl('payments')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            
            const { error: err4 } = await supabase.from(tbl('students')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (err4) throw new Error('Le serveur Supabase refuse la suppression : ' + err4.message);

            console.log('✨ [Sync] Base de données cloud remise à zéro (école uniquement).');
        }

        const CHUNK_SIZE = 500;

        // --- 1. Sync Students ---
        if (students.length > 0) {
            // Déduplication SÉMANTIQUE (Métier) pour éviter que le Cloud n'accumule des doublons
            // avec des IDs techniques différents.
            const uniqueStudentsMap = new Map();
            
            // Priorité : on garde le plus récent ou celui qui a le plus d'infos si doublon
            students.forEach(s => {
                const key = `${(s.nom || '').trim().toLowerCase()}|${((s.prenom || '')).trim().toLowerCase()}|${(s.classe || '').trim().toLowerCase()}`;
                if (!uniqueStudentsMap.has(key)) {
                    uniqueStudentsMap.set(key, s);
                } else {
                    const existing = uniqueStudentsMap.get(key);
                    // On garde celui qui est le plus complet ou le plus récent
                    const sDate = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
                    const eDate = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                    if (sDate > eDate || (s.historiquesPaiements?.length || 0) > (existing.historiquesPaiements?.length || 0)) {
                        uniqueStudentsMap.set(key, s);
                    }
                }
            });

            const uniqueStudents = Array.from(uniqueStudentsMap.values());

            const studentData = uniqueStudents.map(s => ({
                id: s.id,
                nom: s.nom,
                prenom: s.prenom || '',
                classe: s.classe || 'Inconnue',
                cycle: s.cycle || 'Primaire',
                ecolage: s.ecolage || 0,
                deja_paye: s.dejaPaye || 0,
                restant: s.restant || 0,
                status: s.status || 'Non soldé',
                telephone_parent: s.telephone || null,
                sexe: s.sexe || 'M',
                redoublant: s.redoublant || false,
                ecole_provenance: s.ecoleProvenance || '',
                date_naissance: s.dateNaissance || null,
                adsn: s.adsn || null,
                photo_url: s.photoUrl || null
            }));

            for (let i = 0; i < studentData.length; i += CHUNK_SIZE) {
                const chunk = studentData.slice(i, i + CHUNK_SIZE);
                await supabase.from(tbl('students')).upsert(chunk, { onConflict: 'id' });
            }

            // --- 2. Sync Payments ---
            const allPayments = [];
            students.forEach(s => {
                if (Array.isArray(s.historiquesPaiements)) {
                    s.historiquesPaiements.forEach(p => {
                        allPayments.push({
                            id: p.id,
                            student_id: s.id,
                            montant: p.montant,
                            date: p.date,
                            recu: p.recu || null,
                            note: p.note || null
                        });
                    });
                }
            });
            if (allPayments.length > 0) {
                for (let i = 0; i < allPayments.length; i += CHUNK_SIZE) {
                    const chunk = allPayments.slice(i, i + CHUNK_SIZE);
                    await supabase.from(tbl('payments')).upsert(chunk, { onConflict: 'id' });
                }
            }

            // --- 2b. Notifier les parents pour les NOUVEAUX paiements ---
            (async () => {
                try {
                    // Récupérer les IDs des paiements déjà existants pour éviter les doublons de notif
                    const paymentIds = allPayments.map(p => p.id);
                    const { data: existingPayments } = await supabase.from(tbl('payments')).select('id').in('id', paymentIds);
                    const existingIds = new Set((existingPayments || []).map(p => p.id));

                    for (const s of students) {
                        if (Array.isArray(s.historiquesPaiements) && s.historiquesPaiements.length > 0) {
                            // On ne notifie que si le dernier paiement est NOUVEAU
                            const lastP = s.historiquesPaiements[s.historiquesPaiements.length - 1];
                            if (existingIds.has(lastP.id)) continue; 

                            const studentName = (s.prenom || s.nom || 'votre enfant').split(' ')[0];
                            const msg = `💰 Paiement reçu : ${lastP.montant.toLocaleString()} FCFA pour ${studentName}. Nouveau reste : ${s.restant.toLocaleString()} FCFA. Merci !`;
                            
                            const { data: links } = await supabase.from(tbl('parent_student')).select('parent_id').eq('student_id', s.id);
                            if (links && links.length > 0) {
                                for (const link of links) {
                                    sendPushNotification(link.parent_id, schoolSlug, '📦 Reçu de paiement', msg, 'payment').catch(() => {});
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ [Sync Notif] Erreur paiements:', err.message);
                }
            })();
        }

        // --- 3. Sync Presences ---
        if (presences.length > 0) {
            const presenceData = presences.map(p => ({
                id: p.id,
                student_id: p.eleveId,
                eleve_nom: p.eleveNom,
                eleve_prenom: p.elevePrenom,
                eleve_classe: p.eleveClasse,
                date: p.date,
                heure: p.heure,
                statut: p.statut
            }));
            for (let i = 0; i < presenceData.length; i += CHUNK_SIZE) {
                const chunk = presenceData.slice(i, i + CHUNK_SIZE);
                await supabase.from(tbl('presences')).upsert(chunk, { onConflict: 'id' });
            }

            // --- 3b. Notifier les parents pour les Pointages NOUVEAUX ---
            (async () => {
                try {
                    const presenceIds = presences.map(p => p.id);
                    const { data: existingPres } = await supabase.from(tbl('presences')).select('id').in('id', presenceIds);
                    const existingIds = new Set((existingPres || []).map(p => p.id));

                    for (const p of presences) {
                        if (existingIds.has(p.id)) continue; // Déjà notifié ou déjà en base

                        const studentName = (p.elevePrenom || 'votre enfant').split(' ')[0];
                        const action = (p.statut || 'Entrée').toLowerCase() === 'entrée' ? 'est ARRIVÉ(E)' : 'est SORTI(E)';
                        const msg = `🔔 ${studentName} ${action} de l'établissement à ${p.heure}.`;
                        
                        const { data: links } = await supabase.from(tbl('parent_student')).select('parent_id').eq('student_id', p.eleveId);
                        if (links && links.length > 0) {
                            for (const link of links) {
                                sendPushNotification(link.parent_id, schoolSlug, '📍 Pointage École', msg, 'presence').catch(() => {});
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ [Sync Notif] Erreur pointages:', err.message);
                }
            })();
        }

        // --- 4. Sync Activity Logs ---
        if (activityLogs.length > 0) {
            const logData = activityLogs.map(l => ({
                id: l.id,
                utilisateur: l.utilisateur,
                utilisateur_role: l.utilisateurRole,
                action: l.action,
                description: l.description,
                date_heure: l.dateHeure
            }));
            for (let i = 0; i < logData.length; i += CHUNK_SIZE) {
                const chunk = logData.slice(i, i + CHUNK_SIZE);
                await supabase.from(tbl('activity_logs')).upsert(chunk, { onConflict: 'id' });
            }
        }

        // --- 5. Sync App Settings ---
        if (appSettings) {
            console.log('🎨 [Sync POST] Saving appSettings:', {
                appName: appSettings.appName,
                schoolName: appSettings.schoolName,
                hasLogo: !!appSettings.schoolLogo,
                logoLength: appSettings.schoolLogo?.length || 0,
                hasStamp: !!appSettings.schoolStamp,
                stampLength: appSettings.schoolStamp?.length || 0,
            });
            try {
                const { error: settingsErr } = await supabase.from(tbl('app_settings')).upsert({
                    id: 'global_settings',
                    app_name: appSettings.appName,
                    school_name: appSettings.schoolName,
                    school_year: appSettings.schoolYear,
                    school_logo: appSettings.schoolLogo,
                    school_stamp: appSettings.schoolStamp,
                    message_remerciement: appSettings.messageRemerciement,
                    message_rappel: appSettings.messageRappel,
                    tranches: appSettings.tranches || [],
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
                if (settingsErr) {
                    console.error('❌ [Sync POST] Erreur sauvegarde appSettings:', settingsErr.message);
                } else {
                    console.log('✅ [Sync POST] appSettings sauvegardés avec succès !');
                }
            } catch (settingsErr) {
                console.error('❌ [Sync POST] Exception appSettings:', settingsErr);
            }
        }

        // --- 6. Sync Academic Data ---
        if (matieres && matieres.length > 0) {
            try {
                const matieresData = matieres.map(m => ({
                    id: m.id,
                    nom: m.nom,
                    categorie: m.categorie
                }));
                const { error: matErr } = await supabase.from(tbl('matieres')).upsert(matieresData, { onConflict: 'id' });
                if (matErr) {
                    console.error('❌ [Sync POST] Erreur matieres:', matErr.message);
                } else {
                    console.log(`✅ [Sync POST] ${matieresData.length} matières sync.`);
                }
            } catch (matErr) {
                console.error('❌ [Sync POST] Exception matieres:', matErr);
            }
        }

        if (classeMatieres && classeMatieres.length > 0) {
            try {
                const cmData = classeMatieres.map(cm => ({
                    id: cm.id,
                    classe: cm.classe,
                    matiere_id: cm.matiereId,
                    professeur: cm.professeur || '',
                    coefficient: cm.coefficient || 1
                }));
                const { error: cmErr } = await supabase.from(tbl('classe_matieres')).upsert(cmData, { onConflict: 'id' });
                if (cmErr) {
                    console.error('❌ [Sync POST] Erreur classeMatieres:', cmErr.message);
                } else {
                    console.log(`✅ [Sync POST] ${cmData.length} classe-matières sync.`);
                }
            } catch (cmErr) {
                console.error('❌ [Sync POST] Exception classeMatieres:', cmErr);
            }
        }

        if (notes && notes.length > 0) {
            try {
                const chunkSize = 500;
                let notesOk = 0;
                let notesErr = null;
                for (let i = 0; i < notes.length; i += chunkSize) {
                    const chunk = notes.slice(i, i + chunkSize).map(n => ({
                        id: n.id,
                        eleve_id: n.eleveId,
                        matiere_id: n.matiereId,
                        periode: n.periode,
                        note_classe: n.noteClasse,
                        note_devoir: n.noteDevoir,
                        note_compo: n.noteCompo
                    }));
                    const { error: chunkErr } = await supabase.from(tbl('notes')).upsert(chunk, { onConflict: 'id' });
                    if (chunkErr) {
                        notesErr = chunkErr;
                        console.error(`❌ [Sync POST] Erreur notes (chunk ${i}-${i+chunk.length}):`, chunkErr.message, chunkErr.details);
                    } else {
                        notesOk += chunk.length;
                    }
                }
                if (notesErr) {
                    console.error(`❌ [Sync POST] ${notesOk}/${notes.length} notes sauvées, erreurs sur le reste.`);
                } else {
                    console.log(`✅ [Sync POST] ${notesOk} notes synchronisées avec succès !`);
                }
            } catch (notesException) {
                console.error('❌ [Sync POST] Exception notes:', notesException);
            }
        }

        console.log(`🎉 [Sync] Completed: ${students.length} students, etc.`);
        return res.json({ 
            message: 'Synchronisation cloud réussie.',
            count: students.length,
            presencesCount: presences.length,
            logsCount: activityLogs.length
        });

    } catch (err) {
        console.error('💥 [Sync] Fatal error:', err.message);
        return res.status(500).json({ error: 'Échec de la synchronisation cloud: ' + err.message });
    }
}


/**
 * GET /api/sync
 */
async function syncToFrontend(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentification requise.' });
    }

    const { role, schoolSlug } = req.user;
    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    if (!schoolSlug) {
        return res.status(403).json({ error: 'Compte non associé à un établissement.' });
    }

    const tbl = (name) => `${name}_${schoolSlug}`;

    try {
        const fetchTable = async (name, orderField = null, ascending = false) => {
            let q = supabase.from(tbl(name)).select('*');
            if (orderField) q = q.order(orderField, { ascending });
            const { data, error } = await q;
            if (error && error.code !== '42P01') throw error;
            return data || [];
        };

        const students = await fetchTable('students', 'nom');
        const payments = await fetchTable('payments', 'date');
        const presences = await fetchTable('presences', 'date');
        const logs = await fetchTable('activity_logs', 'date_heure');
        const links = await fetchTable('parent_student');
        const announcements = await fetchTable('announcements', 'created_at');
        const dbMatieres = await fetchTable('matieres');
        const dbClasseMatieres = await fetchTable('classe_matieres');
        const dbNotes = await fetchTable('notes');
        const announcementReads = await fetchTable('announcement_reads');
        
        const { data: appSettings, error: settingsError } = await supabase.from(tbl('app_settings')).select('*').single();
        console.log('🎨 [Sync GET] appSettings from DB:', {
            found: !!appSettings,
            error: settingsError?.message || null,
            hasLogo: !!appSettings?.school_logo,
            logoLength: appSettings?.school_logo?.length || 0,
            hasStamp: !!appSettings?.school_stamp,
            appName: appSettings?.app_name,
            schoolName: appSettings?.school_name,
        });

        const studentMap = new Map();
        students.forEach(s => {
            studentMap.set(s.id, {
                ...s,
                dejaPaye: s.deja_paye,
                telephone: s.telephone_parent,
                sexe: s.sexe || 'M',
                redoublant: s.redoublant || false,
                ecoleProvenance: s.ecole_provenance || '',
                dateNaissance: s.date_naissance || null,
                adsn: s.adsn || null,
                photoUrl: s.photo_url || null,
                historiquesPaiements: []
            });
        });

        payments.forEach(p => {
            const s = studentMap.get(p.student_id);
            if (s) {
                s.historiquesPaiements.push({
                    id: p.id,
                    studentId: p.student_id,
                    montant: p.montant,
                    date: p.date,
                    recu: p.recu,
                    note: p.note
                });
            }
        });

        return res.json({
            students: Array.from(studentMap.values()),
            presences: presences.map(pr => ({
                id: pr.id,
                eleveId: pr.student_id,
                eleveNom: pr.eleve_nom,
                elevePrenom: pr.eleve_prenom,
                eleveClasse: pr.eleve_classe,
                date: pr.date,
                heure: pr.heure,
                statut: pr.statut
            })),
            activityLogs: logs.map(l => ({
                id: l.id,
                utilisateur: l.utilisateur,
                utilisateurRole: l.utilisateur_role,
                action: l.action,
                description: l.description,
                dateHeure: l.date_heure
            })),
            links: links || [],
            appSettings: appSettings ? {
                appName: appSettings.app_name,
                schoolName: appSettings.school_name,
                schoolYear: appSettings.school_year,
                schoolLogo: appSettings.school_logo,
                schoolStamp: appSettings.school_stamp,
                messageRemerciement: appSettings.message_remerciement,
                messageRappel: appSettings.message_rappel,
                tranches: appSettings.tranches || []
            } : null,
            announcements: (announcements || []).map(a => ({
                id: a.id,
                titre: a.titre,
                message: a.message,
                cible: a.cible,
                importance: a.importance,
                createdBy: a.created_by,
                createdAt: a.created_at,
                date: a.created_at ? a.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
            })),
            matieres: dbMatieres ? dbMatieres.map(m => ({
                id: m.id,
                nom: m.nom,
                categorie: m.categorie
            })) : undefined,
            classeMatieres: dbClasseMatieres ? dbClasseMatieres.map(cm => ({
                id: cm.id,
                classe: cm.classe,
                matiereId: cm.matiere_id,
                professeur: cm.professeur,
                coefficient: cm.coefficient
            })) : undefined,
            notes: dbNotes ? dbNotes.map(n => ({
                id: n.id,
                eleveId: n.eleve_id,
                matiereId: n.matiere_id,
                periode: n.periode,
                noteClasse: n.note_classe !== undefined ? Number(n.note_classe) : null,
                noteDevoir: n.note_devoir !== undefined ? Number(n.note_devoir) : null,
                noteCompo: n.note_compo !== undefined ? Number(n.note_compo) : null
            })) : undefined,
            announcementReads: (announcementReads || []).map(r => ({
                announcementId: r.announcement_id,
                parentId: r.parent_id,
                readAt: r.read_at,
                remindAt: r.remind_at || null
            }))
        });

    } catch (err) {
        console.error('💥 [Sync] Fetch error:', err.message);
        return res.status(500).json({ error: 'Échec de la récupération des données: ' + err.message });
    }
}

async function clearPresences(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Action non autorisée.' });
    try {
        const { error } = await supabase.from(`presences_${req.user.schoolSlug}`).delete().neq('id', '00000000-0000-0000-0000-000000000000'); 
        if (error) throw error;
        return res.json({ message: 'Historique des présences vidé.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function clearActivityLogs(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Action non autorisée.' });
    try {
        const { error } = await supabase.from(`activity_logs_${req.user.schoolSlug}`).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return res.json({ message: 'Logs d\'activité vidés.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function clearStudents(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Action non autorisée.' });
    const schoolSlug = req.user.schoolSlug;
    try {
        const safeDelete = async (table, filterCol, filterVal) => {
            const { error } = await supabase.from(`${table}_${schoolSlug}`).delete().neq(filterCol, filterVal);
            if (error && error.code !== '42P01') throw error;
        };

        await safeDelete('parent_student', 'student_id', '00000000-0000-0000-0000-000000000000');
        await safeDelete('payments', 'id', '00000000-0000-0000-0000-000000000000');
        await safeDelete('students', 'id', '00000000-0000-0000-0000-000000000000');
        
        return res.json({ message: 'Base de données des élèves vidée.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function deleteMatiere(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Non autorisé.' });
    try {
        const { error } = await supabase.from(`matieres_${req.user.schoolSlug}`).delete().eq('id', req.params.id);
        if (error) throw error;
        return res.json({ success: true, message: 'Matière supprimée.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function deleteClasseMatiere(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Non autorisé.' });
    try {
        const { error } = await supabase.from(`classe_matieres_${req.user.schoolSlug}`).delete().eq('id', req.params.id);
        if (error) throw error;
        return res.json({ success: true, message: 'Liaison classe-matière supprimée.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function deleteNote(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Non autorisé.' });
    try {
        const { error } = await supabase.from(`notes_${req.user.schoolSlug}`).delete().eq('id', req.params.id);
        if (error) throw error;
        return res.json({ success: true, message: 'Note supprimée.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function deleteStudent(req, res) {
    if (!req.user || !['admin', 'directeur', 'directeur_general', 'comptable'].includes(req.user.role)) return res.status(403).json({ error: 'Non autorisé.' });
    try {
        await supabase.from(`parent_student_${req.user.schoolSlug}`).delete().eq('student_id', req.params.id);
        await supabase.from(`payments_${req.user.schoolSlug}`).delete().eq('student_id', req.params.id);
        await supabase.from(`presences_${req.user.schoolSlug}`).delete().eq('student_id', req.params.id);
        await supabase.from(`notes_${req.user.schoolSlug}`).delete().eq('eleve_id', req.params.id);
        const { error } = await supabase.from(`students_${req.user.schoolSlug}`).delete().eq('id', req.params.id);
        if (error) throw error;
        return res.json({ success: true, message: 'Élève supprimé.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { syncFromFrontend, syncToFrontend, clearPresences, clearActivityLogs, clearStudents, deleteMatiere, deleteClasseMatiere, deleteNote, deleteStudent };
