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

    const { students = [], presences = [], devoirs = [], activityLogs = [], appSettings = null, replace = false, matieres = [], classeMatieres = [], notes = [], seances = [], expenses = [], resources = [], payrolls = [], personnels = [] } = req.body;
    const { role, schoolSlug } = req.user;

    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'professeur'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    // Le schoolSlug est obligatoire pour synchroniser
    if (!schoolSlug) {
        return res.status(403).json({ error: 'Compte non associé à un établissement spécifique.' });
    }

    // Sécurité Lot 5B (SEC-011) : Seule la direction / administration peut demander une remise à zéro complète
    if (replace && !['admin', 'directeur', 'directeur_general', 'superadmin'].includes(role)) {
        return res.status(403).json({ error: "Permission refusée. Seule la direction peut remplacer l'ensemble des données." });
    }

    // Helper function pour générer les noms de table dynamiques
    const tbl = (name) => `${name}_${schoolSlug}`;

    try {
        if (replace) {
            if (!Array.isArray(students) || students.length === 0) {
                return res.status(400).json({ error: "Remplacement global refusé : la liste des élèves fournie est vide." });
            }
            console.log('🧹 [Sync] Mode Remplacer activé : Nettoyage universel de la base locale...');
            
            await supabase.from(tbl('presences')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from(tbl('devoirs')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
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

            const { normalizePhone } = require('../utils/helpers');
            let schoolCountryCode = null;
            if (schoolSlug) {
                const { data: sch } = await supabase.from('schools').select('country').eq('slug', schoolSlug).maybeSingle();
                if (sch) schoolCountryCode = sch.country;
            }

            const syncPhoneErrors = [];

            const studentData = uniqueStudents.map((s, idx) => {
                const rawPhone = s.telephone || s.telephone_parent || null;
                let normPhone = null;
                if (rawPhone && String(rawPhone).trim()) {
                    try {
                        normPhone = normalizePhone(rawPhone, schoolCountryCode);
                    } catch (e) {
                        normPhone = null;
                        syncPhoneErrors.push({
                            index: idx + 1,
                            nom: `${s.nom || ''} ${s.prenom || ''}`.trim(),
                            phone: rawPhone,
                            reason: e.message === 'COUNTRY_REQUIRED' ? 'COUNTRY_REQUIRED' : 'INVALID_PHONE'
                        });
                    }
                }

                return {
                    id: s.id,
                    nom: s.nom,
                    prenom: s.prenom || '',
                    classe: s.classe || 'Inconnue',
                    matricule: s.matricule || null,
                    genre: s.sexe || s.genre || 'M',
                    statut: s.status || s.statut || 'Actif',
                    ecolage: Number(s.ecolage) || 0,
                    deja_paye: Number(s.dejaPaye !== undefined ? s.dejaPaye : s.deja_paye) || 0,
                    telephone_parent: rawPhone ? String(rawPhone).trim() : null,
                    telephone_parent_normalized: normPhone,
                    date_naissance: s.dateNaissance || s.date_naissance || null,
                    updated_at: new Date().toISOString()
                };
            });

            for (let i = 0; i < studentData.length; i += CHUNK_SIZE) {
                const chunk = studentData.slice(i, i + CHUNK_SIZE);
                const { error: upsertErr } = await supabase.from(tbl('students')).upsert(chunk, { onConflict: 'id' });
                if (upsertErr) throw upsertErr;
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

                    // Charger les templates personnalisés des paramètres
                    const { data: dbSettings } = await supabase.from(tbl('app_settings')).select('message_remerciement, message_rappel').eq('id', 'global_settings').maybeSingle();
                    const templateRem = appSettings?.messageRemerciement || dbSettings?.message_remerciement;
                    const templateRap = appSettings?.messageRappel || dbSettings?.message_rappel;

                    for (const s of students) {
                        if (Array.isArray(s.historiquesPaiements) && s.historiquesPaiements.length > 0) {
                            // On ne notifie que si le dernier paiement est NOUVEAU
                            const lastP = s.historiquesPaiements[s.historiquesPaiements.length - 1];
                            if (existingIds.has(lastP.id)) continue; 

                            const isSolde = s.restant <= 0;
                            const template = isSolde ? templateRem : templateRap;
                            
                            let customMsg = null;
                            if (template) {
                                customMsg = template
                                    .replace(/{nom_eleve}/g, `${s.prenom} ${s.nom}`)
                                    .replace(/{reste_a_payer}/g, `${s.restant.toLocaleString()} FCFA`)
                                    .replace(/{classe}/g, s.classe)
                                    .replace(/{montant_paye}/g, `${lastP.montant.toLocaleString()} FCFA`);
                            }

                            const studentName = (s.prenom || s.nom || 'votre enfant').split(' ')[0];
                            const msg = customMsg || `💰 Paiement reçu : ${lastP.montant.toLocaleString()} FCFA pour ${studentName}. Nouveau reste : ${s.restant.toLocaleString()} FCFA. Merci !`;
                            
                            const { data: links } = await supabase.from(tbl('parent_student')).select('parent_id').eq('student_id', s.id);
                            if (links && links.length > 0) {
                                for (const link of links) {
                                    // 1. Enregistrer dans la messagerie
                                    let convId;
                                    const { data: existing } = await supabase
                                        .from(tbl('conversations'))
                                        .select('*')
                                        .eq('parent_id', link.parent_id)
                                        .eq('admin_role', 'administration');

                                    if (existing && existing.length > 0) {
                                        const { data: conv } = await supabase
                                            .from(tbl('conversations'))
                                            .update({
                                                last_message: msg,
                                                updated_at: new Date().toISOString()
                                            })
                                            .eq('id', existing[0].id)
                                            .select()
                                            .maybeSingle();
                                        if (conv) convId = conv.id;
                                    } else {
                                        const { data: conv } = await supabase
                                            .from(tbl('conversations'))
                                            .insert({
                                                parent_id: link.parent_id,
                                                admin_role: 'administration',
                                                last_message: msg,
                                                updated_at: new Date().toISOString()
                                            })
                                            .select()
                                            .maybeSingle();
                                        if (conv) convId = conv.id;
                                    }

                                    if (convId) {
                                        await supabase.from(tbl('messages')).insert({
                                            conversation_id: convId,
                                            sender_id: req.user.id,
                                            message_text: msg,
                                            read_status: false
                                        });
                                    }

                                    // 2. Envoyer push
                                    sendPushNotification(link.parent_id, schoolSlug, isSolde ? '🎉 Scolarité Soldée' : '💰 Reçu de paiement', msg, 'payment').catch(() => {});
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
                        const msg = `📍 ${studentName} ${action} de l'établissement à ${p.heure}.`;
                        
                        const { data: links } = await supabase.from(tbl('parent_student')).select('parent_id').eq('student_id', p.eleveId);
                        if (links && links.length > 0) {
                            for (const link of links) {
                                sendPushNotification(link.parent_id, schoolSlug, '🏫 Pointage École', msg, 'presence').catch(() => {});
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ [Sync Notif] Erreur pointages:', err.message);
                }
            })();
        }

        // --- 3c. Sync Devoirs ---
        if (devoirs.length > 0) {
            const devoirsData = devoirs.map(d => ({
                id: d.id,
                date_donnee: d.dateDonnee,
                date_rendu: d.dateRendu,
                matiere: d.matiere,
                description: d.description,
                classe: d.classe,
                professeur_nom: d.professeurNom,
                fichier_url: d.fichierUrl || null
            }));
            for (let i = 0; i < devoirsData.length; i += CHUNK_SIZE) {
                const chunk = devoirsData.slice(i, i + CHUNK_SIZE);
                await supabase.from(tbl('devoirs')).upsert(chunk, { onConflict: 'id' });
            }
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

        // --- 5. Sync App Settings (Clé-Valeur) ---
        if (appSettings) {
            console.log('🎨 [Sync POST] Saving appSettings (Key-Value):', {
                appName: appSettings.appName,
                schoolName: appSettings.schoolName,
                schoolYear: appSettings.schoolYear,
                hasLogo: !!appSettings.schoolLogo,
                hasStamp: !!appSettings.schoolStamp,
                hasClasses: !!appSettings.classes,
                hasTranches: !!appSettings.tranches
            });
            try {
                // Mettre à jour la table schools (address, phone, slogan, ministry, payout) sans journaliser les secrets
                const { error: schoolUpdateErr } = await supabase.from('schools').update({
                    address: appSettings.schoolAddress !== undefined ? appSettings.schoolAddress : null,
                    phone: appSettings.schoolPhone !== undefined ? appSettings.schoolPhone : null,
                    slogan: appSettings.schoolSlogan !== undefined ? appSettings.schoolSlogan : null,
                    ministry: appSettings.schoolMinistry !== undefined ? appSettings.schoolMinistry : null,
                    country: appSettings.schoolCountry !== undefined ? appSettings.schoolCountry : null,
                    payout_momo_number: appSettings.payoutMomoNumber !== undefined ? appSettings.payoutMomoNumber : null,
                    payout_method: appSettings.payoutMethod !== undefined ? appSettings.payoutMethod : 'momo',
                }).eq('slug', schoolSlug);

                if (schoolUpdateErr) console.error('❌ [Sync POST] Erreur MAJ schools:', schoolUpdateErr.message);

                const keyValues = [];
                const nowStr = new Date().toISOString();

                const addKeyVal = (key, val) => {
                    if (val !== undefined && val !== null) {
                        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        keyValues.push({ key, value: strVal, updated_at: nowStr });
                    }
                };

                addKeyVal('app_name', appSettings.appName);
                addKeyVal('school_name', appSettings.schoolName);
                addKeyVal('school_year', appSettings.schoolYear);
                addKeyVal('school_logo', appSettings.schoolLogo);
                addKeyVal('school_stamp', appSettings.schoolStamp);
                addKeyVal('message_remerciement', appSettings.messageRemerciement);
                addKeyVal('message_rappel', appSettings.messageRappel);
                addKeyVal('tranches', appSettings.tranches);
                addKeyVal('classes', appSettings.classes);
                addKeyVal('cycle_schedules', appSettings.cycleSchedules);
                addKeyVal('payment_gateway', appSettings.paymentGateway);
                addKeyVal('payment_public_key', appSettings.paymentPublicKey);
                addKeyVal('payment_secret_key', appSettings.paymentSecretKey);
                addKeyVal('bulletin_template', appSettings.bulletinTemplate);
                addKeyVal('bulletin_show_photo', appSettings.bulletinShowPhoto);
                addKeyVal('bulletin_show_rank', appSettings.bulletinShowRank);
                addKeyVal('bulletin_show_class_average', appSettings.bulletinShowClassAverage);
                addKeyVal('bulletin_show_appreciation', appSettings.bulletinShowAppreciation);
                addKeyVal('eval_configs', appSettings.evalConfigs);

                if (keyValues.length > 0) {
                    const { error: settingsErr } = await supabase.from(tbl('app_settings')).upsert(keyValues, { onConflict: 'key' });
                    if (settingsErr) {
                        console.error('❌ [Sync POST] Erreur sauvegarde appSettings (Key-Value):', settingsErr.message);
                    } else {
                        console.log(`✅ [Sync POST] ${keyValues.length} paramètres clés-valeurs sauvegardés.`);
                    }
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
                    code: m.categorie || null,
                    coefficient: 1
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
                    matiere: cm.matiereId,
                    professeurid: cm.professeurId || cm.professeur || null,
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

        const syncBasicArray = async (arr, tableName) => {
            if (arr && arr.length > 0) {
                try {
                    const chunkSize = 500;
                    for (let i = 0; i < arr.length; i += chunkSize) {
                        const chunk = arr.slice(i, i + chunkSize);
                        await supabase.from(tbl(tableName)).upsert(chunk, { onConflict: 'id' });
                    }
                    console.log(`✅ [Sync POST] ${arr.length} ${tableName} sync.`);
                } catch (e) {
                    console.error(`❌ [Sync POST] Erreur ${tableName}:`, e.message);
                }
            }
        };

        // --- Sync Seances with proper mapping to avoid DB constraint violations ---
        if (seances && seances.length > 0) {
            try {
                const seancesData = seances.map(s => ({
                    id: s.id,
                    classe: s.classe,
                    date: s.jour || 'Lundi',
                    heuredebut: s.heureDebut,
                    heurefin: s.heureFin,
                    matiere: s.matiereId || '',
                    professeurid: s.professeur || '',
                    professeurnom: s.couleur || 'bg-indigo-500',
                    statut: s.salle || 'default'
                }));
                for (let i = 0; i < seancesData.length; i += CHUNK_SIZE) {
                    const chunk = seancesData.slice(i, i + CHUNK_SIZE);
                    const { error } = await supabase.from(tbl('seances')).upsert(chunk, { onConflict: 'id' });
                    if (error) throw error;
                }
                console.log(`✅ [Sync POST] ${seances.length} seances sync.`);
            } catch (e) {
                console.error(`❌ [Sync POST] Erreur seances:`, e.message);
            }
        }

        // --- Sync Resources with proper mapping to avoid DB constraint violations ---
        if (resources && resources.length > 0) {
            try {
                const resourcesData = resources.map(r => ({
                    id: r.id,
                    titre: r.titre,
                    description: r.description || '',
                    type: r.type,
                    url: r.url,
                    classe: r.classe,
                    matiere: r.matiere,
                    professeurid: r.professeurId || r.professeurid || null,
                    professeurnom: r.professeurNom || r.professeurnom || null,
                    createdat: r.createdAt || r.createdat || null
                }));
                for (let i = 0; i < resourcesData.length; i += CHUNK_SIZE) {
                    const chunk = resourcesData.slice(i, i + CHUNK_SIZE);
                    const { error } = await supabase.from(tbl('resources')).upsert(chunk, { onConflict: 'id' });
                    if (error) throw error;
                }
                console.log(`✅ [Sync POST] ${resources.length} resources sync.`);
            } catch (e) {
                console.error(`❌ [Sync POST] Erreur resources:`, e.message);
            }
        }

        await syncBasicArray(expenses, 'expenses');
        await syncBasicArray(payrolls, 'payrolls');
        await syncBasicArray(personnels, 'personnels');

        console.log(`🚀 [Sync] Completed: ${students.length} students, etc.`);
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
    if (!['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'professeur'].includes(role)) {
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
            if (error && error.code !== '42P01' && error.code !== 'PGRST205' && error.code !== '42703') throw error;
            return data || [];
        };

        const students = await fetchTable('students', 'nom');
        const payments = await fetchTable('payments', 'date');
        const presences = await fetchTable('presences', 'date');
        const logs = await fetchTable('activity_logs', 'date_heure');
        const links = await fetchTable('parent_student');
        const announcements = await fetchTable('announcements', 'created_at');
        const dbDevoirs = await fetchTable('devoirs', 'date_donnee');
        const dbMatieres = await fetchTable('matieres');
        const dbClasseMatieres = await fetchTable('classe_matieres');
        const dbNotes = await fetchTable('notes');
        const announcementReads = await fetchTable('announcement_reads');
        const dbSeances = await fetchTable('seances', 'date');
        const dbExpenses = await fetchTable('expenses', 'date');
        const dbResources = await fetchTable('resources', 'created_at');
        const dbPayrolls = await fetchTable('payrolls', 'mois');
        
        // Fetch personnels from profiles table (staff only)
        const { data: dbPersonnels } = await supabase
            .from(tbl('profiles'))
            .select('id, nom, telephone, role')
            .in('role', ['admin', 'directeur', 'superviseur', 'surveillant', 'comptable', 'censeur', 'secretaire', 'professeur'])
            .order('nom');

        // Lecture des paramètres de configuration en clé-valeur
        const { data: appSettingsRows, error: settingsError } = await supabase.from(tbl('app_settings')).select('*');
        const settingsMap = new Map();
        (appSettingsRows || []).forEach(r => {
            if (r.key) settingsMap.set(r.key, r.value);
        });

        const safeJsonParse = (val, fallback = null) => {
            if (!val) return fallback;
            try {
                return typeof val === 'string' ? JSON.parse(val) : val;
            } catch {
                return fallback;
            }
        };
        
        // Fetch school identity from the schools table (source of truth for address, phone, slogan, ministry, payout)
        const { data: schoolData } = await supabase
            .from('schools')
            .select('name, country, address, phone, slogan, ministry, payout_momo_number, payout_method, subscription_plan, paid_tranches_count')
            .eq('slug', schoolSlug)
            .single();
        
        console.log('🎨 [Sync GET] appSettings from DB (Key-Value):', {
            keysCount: settingsMap.size,
            error: settingsError?.message || null,
            schoolYear: settingsMap.get('school_year'),
            appName: settingsMap.get('app_name'),
            schoolName: settingsMap.get('school_name') || schoolData?.name,
            payoutMomoNumber: schoolData?.payout_momo_number
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
            appSettings: {
                appName: settingsMap.get('app_name') || schoolData?.name || 'YZIOW',
                schoolName: settingsMap.get('school_name') || schoolData?.name || null,
                schoolYear: settingsMap.get('school_year') || null,
                schoolLogo: settingsMap.get('school_logo') || null,
                schoolStamp: settingsMap.get('school_stamp') || null,
                messageRemerciement: settingsMap.get('message_remerciement') || null,
                messageRappel: settingsMap.get('message_rappel') || null,
                classes: safeJsonParse(settingsMap.get('classes'), null),
                tranches: safeJsonParse(settingsMap.get('tranches'), []),
                cycleSchedules: safeJsonParse(settingsMap.get('cycle_schedules'), null),
                paymentGateway: settingsMap.get('payment_gateway') || 'none',
                paymentPublicKey: settingsMap.get('payment_public_key') || null,
                paymentSecretKey: settingsMap.get('payment_secret_key') || null,
                bulletinTemplate: settingsMap.get('bulletin_template') || 'officiel',
                bulletinShowPhoto: settingsMap.has('bulletin_show_photo') ? settingsMap.get('bulletin_show_photo') === 'true' : true,
                bulletinShowRank: settingsMap.has('bulletin_show_rank') ? settingsMap.get('bulletin_show_rank') === 'true' : true,
                bulletinShowClassAverage: settingsMap.has('bulletin_show_class_average') ? settingsMap.get('bulletin_show_class_average') === 'true' : true,
                bulletinShowAppreciation: settingsMap.has('bulletin_show_appreciation') ? settingsMap.get('bulletin_show_appreciation') === 'true' : true,
                evalConfigs: safeJsonParse(settingsMap.get('eval_configs'), null),
                // Identity fields — primary source: app_settings / schools table
                schoolAddress: schoolData?.address || null,
                schoolPhone: schoolData?.phone || null,
                schoolSlogan: schoolData?.slogan || null,
                schoolMinistry: schoolData?.ministry || null,
                schoolCountry: schoolData?.country || null,
                payoutMomoNumber: schoolData?.payout_momo_number || null,
                payoutMethod: schoolData?.payout_method || 'momo',
                subscriptionPlan: schoolData?.subscription_plan || null,
                paidTranchesCount: schoolData?.paid_tranches_count || 0
            },
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
            devoirs: dbDevoirs ? await Promise.all(dbDevoirs.map(async (d) => {
                let fichierUrl = d.fichier_url;
                if (fichierUrl && !fichierUrl.startsWith('http')) {
                    try {
                        const { data: sData } = await supabase.storage
                            .from('devoirs')
                            .createSignedUrl(fichierUrl, 1800); // 30 minutes
                        if (sData?.signedUrl) fichierUrl = sData.signedUrl;
                    } catch (e) {
                        console.error('Erreur signature devoir:', e.message);
                    }
                }
                return {
                    id: d.id,
                    dateDonnee: d.date_donnee,
                    dateRendu: d.date_rendu,
                    matiere: d.matiere,
                    description: d.description,
                    classe: d.classe,
                    professeurNom: d.professeur_nom,
                    fichierUrl: fichierUrl,
                    fichierStoragePath: d.fichier_url
                };
            })) : [],
            matieres: dbMatieres ? dbMatieres.map(m => ({
                id: m.id,
                nom: m.nom,
                categorie: m.code || '1-MATIERES LITTERAIRES'
            })) : undefined,
            classeMatieres: dbClasseMatieres ? dbClasseMatieres.map(cm => {
                const staffMatch = (dbPersonnels || []).find(p => p.id === cm.professeurid);
                return {
                    id: cm.id,
                    classe: cm.classe,
                    matiereId: cm.matiere,
                    professeurId: cm.professeurid || null,
                    professeur: staffMatch ? staffMatch.nom : (cm.professeurid || ''),
                    coefficient: cm.coefficient !== undefined ? Number(cm.coefficient) : 1
                };
            }) : undefined,
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
            })),
            seances: (dbSeances || []).map(s => ({
                id: s.id,
                classe: s.classe,
                jour: s.date || 'Lundi',
                heureDebut: s.heureDebut || s.heuredebut || '',
                heureFin: s.heureFin || s.heurefin || '',
                matiereId: s.matiere || '',
                professeur: s.professeurId || s.professeurid || '',
                salle: (s.statut === 'default') ? '' : (s.statut || ''),
                couleur: s.professeurNom || s.professeurnom || 'bg-indigo-500'
            })),
            expenses: dbExpenses || [],
            resources: (dbResources || []).map(r => ({
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
            })),
            payrolls: dbPayrolls || [],
            personnels: (dbPersonnels || []).map(p => ({
                id: p.id,
                nom: p.nom,
                prenom: '', // profiles table currently only holds 'nom'
                role: p.role,
                telephone: p.telephone
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
            if (error && error.code !== '42P01' && error.code !== 'PGRST205' && error.code !== '42703') throw error;
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

const { verifyFileMagicBytes } = require('../utils/helpers');

async function uploadDevoirFile(req, res) {
    if (!req.user || !['professeur', 'admin', 'directeur', 'directeur_general'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Non autorisé à uploader des devoirs.' });
    }
    if (!req.user.schoolSlug) {
        return res.status(403).json({ error: 'Établissement non identifié.' });
    }
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: 'Fichier manquant ou vide.' });
    }
    
    // Contrôle strict de la signature binaire réelle (PDF et Images vérifiés)
    const magicCheck = verifyFileMagicBytes(req.file.buffer, ['pdf', 'image']);
    if (!magicCheck.valid) {
        return res.status(400).json({ error: 'Contenu de fichier non conforme (document PDF ou image valide attendu).' });
    }

    try {
        const schoolSlug = req.user.schoolSlug;
        let detectedExt = magicCheck.detectedType || 'pdf';
        if (detectedExt === 'jpeg') detectedExt = 'jpg';
        const fileUUID = require('crypto').randomBytes(16).toString('hex');
        const fileName = `${schoolSlug}/${fileUUID}.${detectedExt}`;

        const { data, error } = await supabase.storage
            .from('devoirs')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });
            
        if (error) throw error;
        
        // Génération d'une URL signée privée à durée limitée (24 heures)
        const { data: signedData, error: signedErr } = await supabase.storage
            .from('devoirs')
            .createSignedUrl(fileName, 86400);

        if (signedErr || !signedData?.signedUrl) {
            throw signedErr || new Error('Impossible de générer l\'URL signée.');
        }
            
        return res.json({ fichierUrl: signedData.signedUrl, filePath: fileName });
    } catch (err) {
        console.error('Erreur upload:', err.message);
        return res.status(500).json({ error: 'Erreur lors du téléversement du devoir.' });
    }
}

module.exports = { syncFromFrontend, syncToFrontend, clearPresences, clearActivityLogs, clearStudents, deleteMatiere, deleteClasseMatiere, deleteNote, deleteStudent, uploadDevoirFile };
