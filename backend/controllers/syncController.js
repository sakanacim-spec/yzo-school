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

    // Helper function pour générer les noms de table dynamiques
    const tbl = (name) => `${name}_${schoolSlug}`;

    try {
        if (replace) {
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
                // Mettre à jour la table schools (qui contient address, phone, slogan, ministry)
                const { error: schoolUpdateErr } = await supabase.from('schools').update({
                    address: appSettings.schoolAddress !== undefined ? appSettings.schoolAddress : null,
                    phone: appSettings.schoolPhone !== undefined ? appSettings.schoolPhone : null,
                    slogan: appSettings.schoolSlogan !== undefined ? appSettings.schoolSlogan : null,
                    ministry: appSettings.schoolMinistry !== undefined ? appSettings.schoolMinistry : null,
                    country: appSettings.schoolCountry !== undefined ? appSettings.schoolCountry : null,
                }).eq('slug', schoolSlug);

                if (schoolUpdateErr) console.error('❌ [Sync POST] Erreur MAJ schools:', schoolUpdateErr.message);

                const settingsPayload = {
                    id: 'global_settings',
                    app_name: appSettings.appName,
                    school_name: appSettings.schoolName,
                    school_year: appSettings.schoolYear,
                    school_logo: appSettings.schoolLogo,
                    school_stamp: appSettings.schoolStamp,
                    message_remerciement: appSettings.messageRemerciement,
                    message_rappel: appSettings.messageRappel,
                    tranches: appSettings.tranches || [],
                    payment_gateway: appSettings.paymentGateway || 'none',
                    payment_public_key: appSettings.paymentPublicKey || null,
                    payment_secret_key: appSettings.paymentSecretKey || null,
                    updated_at: new Date().toISOString()
                };

                const { error: settingsErr } = await supabase.from(tbl('app_settings')).upsert(settingsPayload, { onConflict: 'id' });
                
                if (settingsErr) {
                    if (settingsErr.code === 'PGRST204' || settingsErr.message?.includes('payment_gateway')) {
                        console.warn('⚠️ [Sync POST] Colonnes de paiement manquantes. Fallback sans les clés de paiement. Veuillez exécuter migration_payment.sql !');
                        delete settingsPayload.payment_gateway;
                        delete settingsPayload.payment_public_key;
                        delete settingsPayload.payment_secret_key;
                        const { error: fallbackErr } = await supabase.from(tbl('app_settings')).upsert(settingsPayload, { onConflict: 'id' });
                        if (fallbackErr) console.error('❌ [Sync POST] Erreur sauvegarde appSettings (Fallback):', fallbackErr.message);
                        else console.log('✅ [Sync POST] appSettings (Fallback) sauvegardés avec succès !');
                    } else {
                        console.error('❌ [Sync POST] Erreur sauvegarde appSettings:', settingsErr.message);
                    }
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

        await syncBasicArray(seances, 'seances');
        await syncBasicArray(expenses, 'expenses');
        await syncBasicArray(resources, 'resources');
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
        const { data: appSettings, error: settingsError } = await supabase.from(tbl('app_settings')).select('*').single();
        
        // Fetch school identity from the schools table (source of truth for address, phone, slogan, ministry)
        const { data: schoolData } = await supabase
            .from('schools')
            .select('name, country, address, phone, slogan, ministry')
            .eq('slug', schoolSlug)
            .single();
        
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
            appSettings: {
                appName: appSettings?.app_name || schoolData?.name || null,
                schoolName: appSettings?.school_name || schoolData?.name || null,
                schoolYear: appSettings?.school_year || null,
                schoolLogo: appSettings?.school_logo || null,
                schoolStamp: appSettings?.school_stamp || null,
                messageRemerciement: appSettings?.message_remerciement || null,
                messageRappel: appSettings?.message_rappel || null,
                tranches: appSettings?.tranches || [],
                paymentGateway: appSettings?.payment_gateway || 'none',
                paymentPublicKey: appSettings?.payment_public_key || null,
                paymentSecretKey: appSettings?.payment_secret_key || null,
                // Identity fields — primary source: app_settings, fallback: schools table
                schoolAddress: appSettings?.school_address || schoolData?.address || null,
                schoolPhone: appSettings?.school_phone || schoolData?.phone || null,
                schoolSlogan: appSettings?.school_slogan || schoolData?.slogan || null,
                schoolMinistry: appSettings?.school_ministry || schoolData?.ministry || null,
                schoolCountry: appSettings?.school_country || schoolData?.country || null,
                settings: appSettings?.settings || null
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
            devoirs: dbDevoirs ? dbDevoirs.map(d => ({
                id: d.id,
                dateDonnee: d.date_donnee,
                dateRendu: d.date_rendu,
                matiere: d.matiere,
                description: d.description,
                classe: d.classe,
                professeurNom: d.professeur_nom,
                fichierUrl: d.fichier_url
            })) : [],
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
            })),
            seances: dbSeances || [],
            expenses: dbExpenses || [],
            resources: dbResources || [],
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

async function uploadDevoirFile(req, res) {
    if (!req.user || !['professeur', 'admin', 'directeur', 'directeur_general'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Non autorisé à uploader des devoirs.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier.' });
    
    try {
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const { data, error } = await supabase.storage
            .from('devoirs')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            });
            
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
            .from('devoirs')
            .getPublicUrl(fileName);
            
        return res.json({ fichierUrl: publicUrl });
    } catch (err) {
        console.error('Erreur upload:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { syncFromFrontend, syncToFrontend, clearPresences, clearActivityLogs, clearStudents, deleteMatiere, deleteClasseMatiere, deleteNote, deleteStudent, uploadDevoirFile };
