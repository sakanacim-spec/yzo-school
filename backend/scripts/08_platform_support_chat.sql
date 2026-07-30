-- ============================================================
-- MIGRATION SUPABASE — SaaS Platform Support Chat
-- ============================================================

-- Table for support messages between School and SuperAdmin
CREATE TABLE IF NOT EXISTS platform_support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- 'school' or 'superadmin'
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les requêtes (filtrer par école ou chercher les non-lus)
CREATE INDEX IF NOT EXISTS idx_platform_support_school_id ON platform_support_messages(school_id);
CREATE INDEX IF NOT EXISTS idx_platform_support_is_read ON platform_support_messages(is_read);

-- Vérification
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'platform_support_messages';
