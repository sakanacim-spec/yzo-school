const { supabase } = require('../utils/supabase');
const { sendPushNotification, broadcastPushToSchool } = require('../utils/webPush');

/**
 * POST /api/notifications/send
 * Envoie une notification push à un ou plusieurs parents.
 * Body: { studentId?, message, type, title?, broadcastAll? }
 */
async function sendNotification(req, res) {
    const { studentId, message, type = 'general', title, broadcastAll = false } = req.body;
    const { schoolSlug, id: senderId, role } = req.user;

    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message requis.' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message trop long (max 2000 caractères).' });
    if (title && (typeof title !== 'string' || title.length > 200)) return res.status(400).json({ error: 'Titre trop long (max 200 caractères).' });

    const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'professeur', 'superadmin'].includes(role);
    if (!isStaff) {
        return res.status(403).json({ error: 'Permission refusée. Seul le personnel autorisé peut envoyer des notifications.' });
    }

    try {
        // ── CAS 1 : Broadcast à toute l'école (annonces) ──────────────
        if (broadcastAll) {
            const notifTitle = title || 'Annonce de l\'école';
            const count = await broadcastPushToSchool(schoolSlug, notifTitle, message, type);
            return res.json({ success: true, count, mode: 'broadcast' });
        }

        // ── CAS 2 : Notification vers les parents d'un élève spécifique ──
        if (!studentId) {
            return res.status(400).json({ error: 'studentId requis pour une notification individuelle.' });
        }

        // Vérifier que l'élève appartient bien à cet établissement
        const { data: student, error: sErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('id')
            .eq('id', studentId)
            .maybeSingle();

        if (sErr || !student) {
            return res.status(404).json({ error: 'Élève non trouvé dans cet établissement.' });
        }

        const { data: links, error: lErr } = await supabase
            .from(`parent_student_${schoolSlug}`)
            .select('parent_id')
            .eq('student_id', studentId);

        if (lErr) throw lErr;

        if (!links || links.length === 0) {
            return res.json({ success: true, count: 0, message: 'Aucun parent lié, aucune notification envoyée.' });
        }

        const parentIds = links.map(l => l.parent_id);
        const notifTitle = title || (type === 'presence' ? 'Pointage élève' : type === 'payment' ? 'Nouveau paiement' : 'Notification');

        for (const parentId of parentIds) {
            // 1. Créer/update la conversation + ajouter un message dans la messagerie si type === 'message' ou 'payment'
            if (type === 'message' || type === 'payment') {
                let convId;
                const { data: existing, error: findErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .select('*')
                    .eq('parent_id', parentId)
                    .eq('admin_role', 'administration');

                if (!findErr) {
                    if (existing && existing.length > 0) {
                        const { data: conv, error: upErr } = await supabase
                            .from(`conversations_${schoolSlug}`)
                            .update({
                                last_message: message,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', existing[0].id)
                            .select()
                            .single();
                        if (!upErr && conv) {
                            convId = conv.id;
                        }
                    } else {
                        const { data: conv, error: insErr } = await supabase
                            .from(`conversations_${schoolSlug}`)
                            .insert({
                                parent_id: parentId,
                                admin_role: 'administration',
                                last_message: message,
                                updated_at: new Date().toISOString()
                            })
                            .select()
                            .single();
                        if (!insErr && conv) {
                            convId = conv.id;
                        }
                    }
                }

                if (convId) {
                    await supabase.from(`messages_${schoolSlug}`).insert({
                        conversation_id: convId,
                        sender_id: senderId,
                        message_text: message,
                        read_status: false
                    });
                }
            }

            // 2. Envoi via Web Push (Toujours)
            await sendPushNotification(parentId, schoolSlug, notifTitle, message, type);
        }

        return res.json({ success: true, count: parentIds.length, mode: 'targeted' });

    } catch (err) {
        console.error('❌ Error sending notification:', err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/notifications/broadcast-announcement
 * Envoie une notification push pour une annonce à tous les parents
 */
async function broadcastAnnouncement(req, res) {
    const { title, message } = req.body;
    const { schoolSlug, role } = req.user;

    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    if (!message || !title) return res.status(400).json({ error: 'title et message requis.' });
    if (typeof message !== 'string' || message.length > 2000) return res.status(400).json({ error: 'Message trop long (max 2000 caractères).' });
    if (typeof title !== 'string' || title.length > 200) return res.status(400).json({ error: 'Titre trop long (max 200 caractères).' });

    const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role);
    if (!isStaff) {
        return res.status(403).json({ error: 'Permission refusée. Seul le personnel autorisé peut diffuser des annonces.' });
    }

    try {
        const count = await broadcastPushToSchool(schoolSlug, title, message, 'announcement');
        return res.json({ success: true, count });
    } catch (err) {
        console.error('❌ broadcastAnnouncement Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { sendNotification, broadcastAnnouncement };
