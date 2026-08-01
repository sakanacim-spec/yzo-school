DO $$ 
DECLARE 
    tbl record;
BEGIN 
    FOR tbl IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename LIKE 'app_settings_%'
    LOOP 
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS classes JSONB;', tbl.tablename); 
    END LOOP; 
END $$;
