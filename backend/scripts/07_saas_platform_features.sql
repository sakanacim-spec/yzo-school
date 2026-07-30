-- ============================================================
-- MIGRATION SUPABASE — SaaS Platform Features (SuperAdmin)
-- ============================================================

-- 1. Table globale pour les paramètres de la plateforme
CREATE TABLE IF NOT EXISTS global_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertion des paramètres par défaut s'ils n'existent pas
INSERT INTO global_settings (key, value, description)
VALUES 
    ('default_commission_rate', '20', 'Taux de commission par défaut pour les nouveaux ambassadeurs (%)'),
    ('subscription_price_fcfa', '150000', 'Prix par défaut de l''abonnement SaaS annuel (FCFA)')
ON CONFLICT (key) DO NOTHING;

-- 2. Table pour l'historique comptable des revenus SaaS
CREATE TABLE IF NOT EXISTS saas_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    type VARCHAR(50) NOT NULL, -- ex: 'subscription', 'setup_fee'
    description TEXT,
    payment_method VARCHAR(50), -- ex: 'fedapay', 'cash', 'bank_transfer'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table pour les annonces globales (Broadcast)
CREATE TABLE IF NOT EXISTS global_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info', -- 'info', 'warning', 'success', 'error'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vérification
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('global_settings', 'saas_transactions', 'global_announcements');
