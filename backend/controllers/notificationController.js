const { supabase } = require('../utils/supabase');
const { sendPushNotification, broadcastPushToSchool } = require('../utils/webPush');

/**
 * POST /api/notifications/send
 * Envoie une notification push à un ou plusieurs parents.
 * Body: { studentId?, message, type, title?, broadcastAll? }
 */
async function sendNotification(req, res) {
    const { studentId, message, type = 'general', title, broadcastAll = false } = req.body;
    const { schoolSlug, id: senderId } = req.user;

    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    if (!message) return res.status(400).json({ error: 'Message requis.' });

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
            // 1. Créer/update la conversation + ajouter un message dans la messagerie UNIQUEMENT si type === 'message'
            if (type === 'message') {
                const { data: conv, error: cErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .upsert({
                        parent_id: parentId,
                        admin_role: 'administration',
                        last_message: message,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'parent_id, admin_role' })
                    .select()
                    .single();

                if (!cErr && conv) {
                    await supabase.from(`messages_${schoolSlug}`).insert({
                        conversation_id: conv.id,
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
    const { schoolSlug } = req.user;

    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    if (!message || !title) return res.status(400).json({ error: 'title et message requis.' });

    try {
        const count = await broadcastPushToSchool(schoolSlug, title, message, 'announcement');
        return res.json({ success: true, count });
    } catch (err) {
        console.error('❌ broadcastAnnouncement Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { sendNotification, broadcastAnnouncement };
