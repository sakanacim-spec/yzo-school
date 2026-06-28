DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'app_settings_%') 
    LOOP
        BEGIN
            EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS payment_gateway text DEFAULT ''none''';
            EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS payment_public_key text';
            EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS payment_secret_key text';
        EXCEPTION WHEN duplicate_column THEN 
        END;
    END LOOP;
END $$;
