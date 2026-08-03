-- backend/scripts/13_add_school_withdrawals.sql
-- Table globale pour suivre les demandes de retrait (payouts) des dons

CREATE TABLE IF NOT EXISTS school_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    school_slug VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL, -- 'mobile_money', 'bank'
    payment_details TEXT NOT NULL, -- Numéro de tel ou RIB
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'rejected'
    notes TEXT, -- Optionnel : pour que le superadmin justifie un rejet ou mette un numéro de transaction
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_school_withdrawals_updated_at ON school_withdrawals;
CREATE TRIGGER update_school_withdrawals_updated_at
    BEFORE UPDATE ON school_withdrawals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
