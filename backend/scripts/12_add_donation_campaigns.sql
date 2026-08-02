-- backend/scripts/12_add_donation_campaigns.sql
-- Ajoute les tables 'campaigns_[schoolSlug]' et 'donations_[schoolSlug]' pour toutes les écoles existantes.

DO $$ 
DECLARE 
    school_record RECORD;
    table_name_campaigns TEXT;
    table_name_donations TEXT;
    sql_create_campaigns TEXT;
    sql_create_donations TEXT;
BEGIN
    FOR school_record IN SELECT slug FROM schools LOOP
        table_name_campaigns := 'campaigns_' || school_record.slug;
        table_name_donations := 'donations_' || school_record.slug;

        -- Création de la table des campagnes (Crowdfunding)
        sql_create_campaigns := format('
            CREATE TABLE IF NOT EXISTS %I (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                goal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                current_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                currency VARCHAR(10) DEFAULT ''FCFA'',
                status VARCHAR(50) DEFAULT ''active'',
                image_url TEXT,
                created_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        ', table_name_campaigns);
        EXECUTE sql_create_campaigns;

        -- Création de la table des dons
        sql_create_donations := format('
            CREATE TABLE IF NOT EXISTS %I (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                campaign_id UUID REFERENCES %I(id) ON DELETE CASCADE,
                donor_name VARCHAR(255),
                donor_email VARCHAR(255),
                donor_phone VARCHAR(50),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT ''FCFA'',
                payment_method VARCHAR(50),
                transaction_id VARCHAR(255),
                status VARCHAR(50) DEFAULT ''pending'',
                message TEXT,
                is_anonymous BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        ', table_name_donations, table_name_campaigns);
        EXECUTE sql_create_donations;

    END LOOP;
END $$;
