const { supabase } = require('../utils/supabase');

// ==========================================
// ── MÉTHODES POUR L'ÉCOLE (DIRECTEUR) ─────
// ==========================================

// GET /api/support/messages
async function getSchoolMessages(req, res) {
    const { schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        const { data: school, error: sErr } = await supabase
            .from('schools')
            .select('id, slug')
            .eq('slug', schoolSlug)
            .maybeSingle();

        if (sErr || !school) {
            return res.status(403).json({ error: 'Établissement non trouvé.' });
        }

        const schoolId = school.id;

        const { data, error } = await supabase
            .from('platform_support_messages')
            .select('*')
            .eq('school_id', schoolId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Marquer comme lu les messages envoyés par le superadmin
        await supabase
            .from('platform_support_messages')
            .update({ is_read: true })
            .eq('school_id', schoolId)
            .eq('sender_type', 'superadmin')
            .eq('is_read', false);

        return res.json({ messages: data || [] });
    } catch (err) {
        console.error('getSchoolMessages Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération des messages.' });
    }
}

// POST /api/support/send
async function sendSchoolMessage(req, res) {
    const { schoolSlug } = req.user;
    const { message } = req.body;
    
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });
    if (!message) return res.status(400).json({ error: 'Message vide.' });

    try {
        const { data: school, error: sErr } = await supabase
            .from('schools')
            .select('id, slug')
            .eq('slug', schoolSlug)
            .maybeSingle();

        if (sErr || !school) {
            return res.status(403).json({ error: 'Établissement non trouvé.' });
        }

        const schoolId = school.id;

        const { data, error } = await supabase
            .from('platform_support_messages')
            .insert({
                school_id: schoolId,
                sender_type: 'school',
                message: message
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ message: 'Message envoyé', data });
    } catch (err) {
        console.error('sendSchoolMessage Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de l\'envoi du message.' });
    }
}

// ==========================================
// ── MÉTHODES POUR SUPERADMIN ──────────────
// ==========================================

// GET /superadmin/support/inbox
async function getSuperAdminInbox(req, res) {
    try {
        // Obtenir toutes les écoles
        const { data: schools, error: sErr } = await supabase
            .from('schools')
            .select('id, name, slug, status');
            
        if (sErr) throw sErr;

        // Obtenir tous les messages pour grouper (en prod on utiliserait une vue SQL ou un groupby)
        const { data: messages, error: mErr } = await supabase
            .from('platform_support_messages')
            .select('*')
            .order('created_at', { ascending: false });

        if (mErr) throw mErr;

        // Associer les messages aux écoles
        const inboxMap = {};
        schools.forEach(s => {
            inboxMap[s.id] = { school: s, messages: [], unreadCount: 0, lastMessageAt: null };
        });

        messages.forEach(m => {
            if (inboxMap[m.school_id]) {
                inboxMap[m.school_id].messages.push(m);
                if (m.sender_type === 'school' && !m.is_read) {
                    inboxMap[m.school_id].unreadCount++;
                }
                if (!inboxMap[m.school_id].lastMessageAt) {
                    inboxMap[m.school_id].lastMessageAt = m.created_at;
                }
            }
        });

        // Filtrer uniquement les écoles avec au moins un message
        const inbox = Object.values(inboxMap)
            .filter(item => item.messages.length > 0)
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

        return res.json({ inbox });
    } catch (err) {
        console.error('getSuperAdminInbox Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors du chargement de la boite de réception.' });
    }
}

// POST /superadmin/support/send/:schoolId
async function sendSuperAdminMessage(req, res) {
    const { schoolId } = req.params;
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message vide.' });

    try {
        const { data, error } = await supabase
            .from('platform_support_messages')
            .insert({
                school_id: schoolId,
                sender_type: 'superadmin',
                message: message
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ message: 'Message envoyé', data });
    } catch (err) {
        console.error('sendSuperAdminMessage Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de l\'envoi du message.' });
    }
}

// POST /superadmin/support/read/:schoolId
async function markSuperAdminRead(req, res) {
    const { schoolId } = req.params;
    try {
        await supabase
            .from('platform_support_messages')
            .update({ is_read: true })
            .eq('school_id', schoolId)
            .eq('sender_type', 'school')
            .eq('is_read', false);
            
        return res.json({ success: true });
    } catch (err) {
        console.error('markSuperAdminRead Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors du marquage en lu.' });
    }
}

module.exports = {
    getSchoolMessages,
    sendSchoolMessage,
    getSuperAdminInbox,
    sendSuperAdminMessage,
    markSuperAdminRead
};
