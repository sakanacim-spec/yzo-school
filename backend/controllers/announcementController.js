// ============================================================
// CONTROLLER — Annonces (avec Push Web en temps réel)
// ============================================================
const { supabase } = require('../utils/supabase');
const { sendPushNotification } = require('../utils/webPush');

/**
 * POST /api/announcements
 * Crée une annonce ET envoie une notification push à tous les parents liés.
 * Seul un admin/directeur/comptable peut publier des annonces.
 */
async function createAnnouncement(req, res) {
    const { role, id: adminId, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!['admin', 'directeur', 'directeur_general', 'comptable'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    const { id, titre, message, cible, importance, createdBy, createdAt } = req.body;

    if (!titre || !message) {
        return res.status(400).json({ error: 'Titre et message sont requis.' });
    }

    try {
        // 1. Sauvegarder l'annonce dans Supabase
        const announcementId = id || require('crypto').randomUUID();
        const { data: announcement, error: aErr } = await supabase
            .from(`announcements_${schoolSlug}`)
            .upsert({
                id: announcementId,
                titre,
                message,
                cible: cible || 'all',
                importance: importance || 'info',
                created_by: createdBy || 'Admin',
                created_at: createdAt || new Date().toISOString()
            }, { onConflict: 'id' })
            .select()
            .single();

        if (aErr) {
            console.error('❌ [Announcement] Erreur lors de la sauvegarde:', aErr.message);
            // On continue quand même pour envoyer les notifications
        }

        console.log(`📢 [Announcement] Annonce créée: "${titre}" (cible: ${cible || 'all'})`);

        // 2. Récupérer tous les parents ayant au moins un enfant lié
        let parentQuery = supabase
            .from(`parent_student_${schoolSlug}`)
            .select('parent_id');

        // Si la cible est une classe spécifique, filtrer
        if (cible && cible !== 'all') {
            // Récupérer les élèves de la classe ciblée
            const { data: classStudents, error: csErr } = await supabase
                .from(`students_${schoolSlug}`)
                .select('id')
                .eq('classe', cible);

            if (!csErr && classStudents && classStudents.length > 0) {
                const classStudentIds = classStudents.map(s => s.id);
                parentQuery = supabase
                    .from(`parent_student_${schoolSlug}`)
                    .select('parent_id')
                    .in('student_id', classStudentIds);
            }
        }

        const { data: links, error: lErr } = await parentQuery;

        if (lErr) {
            console.error('❌ [Announcement] Erreur récupération parents:', lErr.message);
            // On renvoie quand même un succès car l'annonce est sauvegardée
            return res.json({
                success: true,
                announcement: { id: announcementId, titre, message, cible, importance, createdBy, createdAt: createdAt || new Date().toISOString() },
                notificationsSent: 0,
                warning: 'Annonce sauvegardée mais notifications non envoyées.'
            });
        }

        // Déduplication des parentIds
        const parentIds = [...new Set((links || []).map(l => l.parent_id))];
        console.log(`📲 [Announcement] ${parentIds.length} parent(s) à notifier`);

        // 3. Envoyer les notifications push à tous les parents
        let notificationsSent = 0;
        const pushPromises = parentIds.map(async (parentId) => {
            try {
                await sendPushNotification(
                    parentId,
                    schoolSlug,
                    `📢 ${importance === 'urgent' ? '🚨 URGENT — ' : ''}${titre}`,
                    message,
                    'announcement'
                );
                notificationsSent++;
            } catch (pushErr) {
                console.warn(`⚠️ [Announcement] Push échoué pour parent ${parentId}:`, pushErr.message);
            }
        });

        // Attendre toutes les notifications (sans bloquer si certaines échouent)
        await Promise.allSettled(pushPromises);

        console.log(`✅ [Announcement] ${notificationsSent}/${parentIds.length} notifications envoyées`);

        return res.json({
            success: true,
            announcement: {
                id: announcementId,
                titre,
                message,
                cible: cible || 'all',
                importance: importance || 'info',
                createdBy: createdBy || 'Admin',
                createdAt: createdAt || new Date().toISOString()
            },
            notificationsSent,
            totalParents: parentIds.length
        });

    } catch (err) {
        console.error('💥 [Announcement] Erreur fatale:', err.message);
        return res.status(500).json({ error: 'Erreur interne: ' + err.message });
    }
}

/**
 * GET /api/announcements
 * Récupère les annonces depuis Supabase.
 * - Parent : annonces le concernant (cible = 'all' ou sa classe)
 * - Admin : toutes les annonces
 */
async function getAnnouncements(req, res) {
    const { role, id: userId, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        let query = supabase
            .from(`announcements_${schoolSlug}`)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        // Si c'est un parent, filtrer par ses classes d'enfants
        if (role === 'parent') {
            // Récupérer les classes des enfants liés
            const { data: links, error: lErr } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('student_id')
                .eq('parent_id', userId);

            if (!lErr && links && links.length > 0) {
                const studentIds = links.map(l => l.student_id);
                const { data: students } = await supabase
                    .from(`students_${schoolSlug}`)
                    .select('classe')
                    .in('id', studentIds);

                const classes = students ? [...new Set(students.map(s => s.classe))] : [];

                if (classes.length > 0) {
                    query = supabase
                        .from(`announcements_${schoolSlug}`)
                        .select('*')
                        .in('cible', ['all', ...classes])
                        .order('created_at', { ascending: false })
                        .limit(50);
                } else {
                    query = supabase
                        .from(`announcements_${schoolSlug}`)
                        .select('*')
                        .eq('cible', 'all')
                        .order('created_at', { ascending: false })
                        .limit(50);
                }
            } else {
                 // Si le parent n'a pas encore d'enfants liés, ou s'il y a eu erreur
                 query = supabase
                     .from(`announcements_${schoolSlug}`)
                     .select('*')
                     .eq('cible', 'all')
                     .order('created_at', { ascending: false })
                     .limit(50);
            }
        }

        const { data: announcements, error } = await query;

        if (error) {
            console.error('❌ [GetAnnouncements] Erreur:', error.message);
            if (error.code === '42P01') return res.json({ announcements: [] });
            throw error;
        }

        // Mapper vers le format frontend
        const mapped = (announcements || []).map(a => ({
            id: a.id,
            titre: a.titre,
            message: a.message,
            cible: a.cible,
            importance: a.importance,
            createdBy: a.created_by,
            createdAt: a.created_at,
            date: a.created_at ? a.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
        }));

        return res.json({ announcements: mapped });

    } catch (err) {
        console.error('💥 [GetAnnouncements] Erreur fatale:', err.message);
        return res.status(500).json({ error: 'Erreur interne: ' + err.message });
    }
}

/**
 * DELETE /api/announcements/:id
 * Supprime une annonce (admin seulement).
 */
async function deleteAnnouncement(req, res) {
    const { role, schoolSlug } = req.user;
    const { id } = req.params;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    if (!['admin', 'directeur', 'directeur_general', 'comptable'].includes(role)) {
        return res.status(403).json({ error: 'Permission refusée.' });
    }

    try {
        const { error } = await supabase
            .from(`announcements_${schoolSlug}`)
            .delete()
            .eq('id', id);

        if (error) throw error;

        return res.json({ success: true, message: 'Annonce supprimée.' });
    } catch (err) {
        console.error('❌ [DeleteAnnouncement] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/announcements/:id/read
 * Marque une annonce comme lue pour le parent actuel.
 */
async function acknowledgeRead(req, res) {
    const { id: announcementId } = req.params;
    const { id: parentId, schoolSlug } = req.user;

    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        const { error } = await supabase
            .from(`announcement_reads_${schoolSlug}`)
            .upsert({
                announcement_id: announcementId,
                parent_id: parentId,
                read_at: new Date().toISOString()
            }, { onConflict: 'announcement_id, parent_id' });

        if (error) {
            // Si la table n'existe pas, on tente de la créer (silencieusement ou log)
            console.error('❌ [ReadStatus] Erreur upsert:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true, message: 'Lecture enregistrée.' });
    } catch (err) {
        console.error('💥 [ReadStatus] Erreur fatale:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { createAnnouncement, getAnnouncements, deleteAnnouncement, acknowledgeRead };
