const { supabase } = require('../utils/supabase');
const { sendPushNotification } = require('../utils/webPush');

/**
 * Récupère les conversations pour l'utilisateur connecté
 */
async function getConversations(req, res) {
    const { id, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        let query = supabase.from(`conversations_${schoolSlug}`).select(`
            *,
            parent:parent_id (id, nom, telephone)
        `);

        if (role === 'parent') {
            query = query.eq('parent_id', id);
        } else if (role === 'comptable') {
            query = query.eq('admin_role', 'comptabilite');
        } else {
            // Autres admins voient l'administration
            query = query.eq('admin_role', 'administration');
        }

        const { data, error } = await query.order('updated_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        if (err.code === '42P01') {
            return res.status(500).json({ 
                error: 'Le service de messagerie n\'est pas encore configuré pour cet établissement.',
                detail: 'Table conversations manquante. Contactez l\'administrateur.'
            });
        }
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Récupère les messages d'une conversation
 */
async function getMessages(req, res) {
    const { conversationId } = req.params;
    const { id: userId, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // Vérifier l'existence et l'appartenance de la conversation
        const { data: conv, error: convErr } = await supabase
            .from(`conversations_${schoolSlug}`)
            .select('*')
            .eq('id', conversationId)
            .maybeSingle();

        if (convErr) throw convErr;
        if (!conv) {
            return res.status(404).json({ error: 'Conversation non trouvée.' });
        }

        const isParentOwner = (role === 'parent' && conv.parent_id === userId);
        const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role);

        if (!isParentOwner && !isStaff) {
            return res.status(403).json({ error: 'Accès non autorisé à cette conversation.' });
        }

        const { data, error } = await supabase
            .from(`messages_${schoolSlug}`)
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Marquer comme lu pour le récepteur
        await supabase
            .from(`messages_${schoolSlug}`)
            .update({ read_status: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId);

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Envoie un message
 */
async function sendMessage(req, res) {
    const { conversationId, text, imageUrl, targetRole } = req.body;
    const { id, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        let convId = conversationId;

        // Si une conversation existante est fournie, vérifier la participation
        if (convId) {
            const { data: conv, error: convErr } = await supabase
                .from(`conversations_${schoolSlug}`)
                .select('*')
                .eq('id', convId)
                .maybeSingle();

            if (convErr) throw convErr;
            if (!conv) {
                return res.status(404).json({ error: 'Conversation non trouvée.' });
            }

            const isParentOwner = (role === 'parent' && conv.parent_id === id);
            const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superviseur', 'proviseur', 'censeur', 'superadmin'].includes(role);

            if (!isParentOwner && !isStaff) {
                return res.status(403).json({ error: 'Accès non autorisé à cette conversation.' });
            }
        }

        // Si parent initie sans conversationId
        if (!convId && role === 'parent') {
            const adminRole = targetRole || 'administration';
            const { data: existing, error: findErr } = await supabase
                .from(`conversations_${schoolSlug}`)
                .select('*')
                .eq('parent_id', id)
                .eq('admin_role', adminRole);

            if (findErr) throw findErr;

            if (existing && existing.length > 0) {
                const { data: conv, error: upErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .update({
                        last_message: text || 'Photo',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing[0].id)
                    .select()
                    .single();

                if (upErr) throw upErr;
                convId = conv.id;
            } else {
                const { data: conv, error: insErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .insert({
                        parent_id: id,
                        admin_role: adminRole,
                        last_message: text || 'Photo',
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (insErr) throw insErr;
                convId = conv.id;
            }
        }

        // Si admin initie sans conversationId (via bouton Contacter)
        if (!convId && role !== 'parent') {
            // Autoriser Admin, Directeur, DG et Comptable à initier
            const allowedRoles = ['admin', 'directeur', 'directeur_general', 'comptable'];
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({ error: "Action restreinte. Seul le Directeur ou le Comptable peut initier un contact." });
            }

            const { parentId, adminRole } = req.body;
            if (!parentId) return res.status(400).json({ error: "parentId manquant pour l'initiation." });

            const targetAdminRole = adminRole || (role === 'comptable' ? 'comptabilite' : 'administration');
            const { data: existing, error: findErr } = await supabase
                .from(`conversations_${schoolSlug}`)
                .select('*')
                .eq('parent_id', parentId)
                .eq('admin_role', targetAdminRole);

            if (findErr) throw findErr;

            if (existing && existing.length > 0) {
                const { data: conv, error: upErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .update({
                        last_message: text || 'Photo',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing[0].id)
                    .select()
                    .single();

                if (upErr) throw upErr;
                convId = conv.id;
            } else {
                const { data: conv, error: insErr } = await supabase
                    .from(`conversations_${schoolSlug}`)
                    .insert({
                        parent_id: parentId,
                        admin_role: targetAdminRole,
                        last_message: text || 'Photo',
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (insErr) throw insErr;
                convId = conv.id;
            }
        }

        const { data: message, error } = await supabase
            .from(`messages_${schoolSlug}`)
            .insert({
                conversation_id: convId,
                sender_id: id,
                message_text: text,
                image_url: imageUrl
            })
            .select()
            .single();

        if (error) throw error;

        // Update conversation
        const { data: updatedConv } = await supabase.from(`conversations_${schoolSlug}`)
            .update({
                last_message: text || 'Photo',
                updated_at: new Date().toISOString()
            })
            .eq('id', convId)
            .select()
            .single();

        // ─────────────────────────────────────────────
        // 🔔 NOTIFICATIONS PUSH
        // ─────────────────────────────────────────────
        if (updatedConv) {
            if (role === 'parent') {
                // Le parent écrit à l'école -> Notifier les admins concernés
                const targetAdminRole = updatedConv.admin_role === 'comptabilite' ? 'comptable' : 'admin';
                
                // Chercher tous les profils ayant ce rôle (on inclut aussi le directeur/DG pour qu'ils soient au courant)
                const { data: admins } = await supabase
                    .from(`profiles_${schoolSlug}`)
                    .select('id, role')
                    .in('role', [targetAdminRole, 'directeur', 'directeur_general']);

                if (admins && admins.length > 0) {
                    const title = `Nouveau message (Parent)`;
                    for (const admin of admins) {
                        // On évite de s'auto-notifier si jamais (peu probable ici)
                        if (admin.id !== id) {
                            sendPushNotification(admin.id, schoolSlug, title, text || 'Nouvelle image', 'message').catch(console.error);
                        }
                    }
                }
            } else {
                // L'école écrit au parent -> Notifier le parent
                const title = `Nouveau message de l'école`;
                sendPushNotification(updatedConv.parent_id, schoolSlug, title, text || 'Nouvelle image', 'message').catch(console.error);
            }
        }

        return res.status(201).json(message);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Récupère le nombre de messages non lus pour l'utilisateur
 */
async function getUnreadCount(req, res) {
    const { id, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        if (role === 'parent') {
            const { data: convs, error: convErr } = await supabase
                .from(`conversations_${schoolSlug}`)
                .select('id')
                .eq('parent_id', id);

            if (convErr) throw convErr;
            if (!convs || convs.length === 0) return res.json(0);

            const convIds = convs.map(c => c.id);
            const { count, error } = await supabase
                .from(`messages_${schoolSlug}`)
                .select('id', { count: 'exact', head: true })
                .in('conversation_id', convIds)
                .neq('sender_id', id)
                .eq('read_status', false);

            if (error) throw error;
            return res.json(count || 0);
        } else {
            const targetRole = role === 'comptable' ? 'comptabilite' : 'administration';
            const { data: convs, error: convErr } = await supabase
                .from(`conversations_${schoolSlug}`)
                .select('id')
                .eq('admin_role', targetRole);

            if (convErr) throw convErr;
            if (!convs || convs.length === 0) return res.json(0);

            const convIds = convs.map(c => c.id);
            const { count, error } = await supabase
                .from(`messages_${schoolSlug}`)
                .select('id', { count: 'exact', head: true })
                .in('conversation_id', convIds)
                .neq('sender_id', id)
                .eq('read_status', false);

            if (error) throw error;
            return res.json(count || 0);
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function uploadImage(req, res) {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier.' });

    try {
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const { data, error } = await supabase.storage
            .from('messages')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('messages')
            .getPublicUrl(fileName);

        return res.json({ imageUrl: publicUrl });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function initiateConversation(req, res) {
    const { id, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    let { parentId, adminRole } = req.body;

    try {
        if (role === 'parent') {
            parentId = id;
            if (!adminRole) adminRole = 'administration';
        } else {
            if (!parentId) return res.status(400).json({ error: "parentId est requis." });
            if (!adminRole) adminRole = (role === 'comptable' ? 'comptabilite' : 'administration');
            
            const allowedRoles = ['admin', 'directeur', 'directeur_general', 'comptable'];
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({ error: "Action restreinte." });
            }
        }

        // Check if existing
        const { data: existing, error: existErr } = await supabase
            .from(`conversations_${schoolSlug}`)
            .select(`*, parent:parent_id (id, nom, telephone)`)
            .eq('parent_id', parentId)
            .eq('admin_role', adminRole)
            .maybeSingle();

        if (existErr) {
            throw existErr;
        }

        if (existing) {
            return res.json(existing);
        }

        // Create new
        const { data: inserted, error: insErr } = await supabase
            .from(`conversations_${schoolSlug}`)
            .insert({
                parent_id: parentId,
                admin_role: adminRole,
                last_message: 'Nouvelle discussion'
            })
            .select(`*, parent:parent_id (id, nom, telephone)`)
            .single();

        if (insErr) throw insErr;
        return res.json(inserted);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Supprime une conversation et ses messages associés
 */
async function deleteConversation(req, res) {
    const { id: conversationId } = req.params;
    const { id: userId, role, schoolSlug } = req.user;
    if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé.' });

    try {
        // Vérifier l'existence et l'appartenance de la conversation
        const { data: conv, error: convErr } = await supabase
            .from(`conversations_${schoolSlug}`)
            .select('*')
            .eq('id', conversationId)
            .maybeSingle();

        if (convErr) throw convErr;
        if (!conv) {
            return res.status(404).json({ error: 'Conversation non trouvée.' });
        }

        const isParentOwner = (role === 'parent' && conv.parent_id === userId);
        const isStaff = ['admin', 'directeur', 'directeur_general', 'comptable', 'superadmin'].includes(role);

        if (!isParentOwner && !isStaff) {
            return res.status(403).json({ error: 'Accès non autorisé pour supprimer cette conversation.' });
        }

        // Suppression des messages liés d'abord pour éviter les erreurs de clé étrangère
        await supabase
            .from(`messages_${schoolSlug}`)
            .delete()
            .eq('conversation_id', conversationId);

        // Suppression de la conversation
        const { error } = await supabase
            .from(`conversations_${schoolSlug}`)
            .delete()
            .eq('id', conversationId);

        if (error) throw error;
        
        return res.json({ success: true, message: 'Conversation supprimée avec succès.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { getConversations, getMessages, sendMessage, uploadImage, getUnreadCount, initiateConversation, deleteConversation };
