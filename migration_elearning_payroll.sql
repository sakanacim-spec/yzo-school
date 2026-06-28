DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'students_%') 
    LOOP
        DECLARE
            school_slug text := substring(r.tablename from 10);
        BEGIN
            EXECUTE 'CREATE TABLE IF NOT EXISTS "resources_' || school_slug || '" (
                id text PRIMARY KEY,
                titre text NOT NULL,
                description text,
                type text NOT NULL,
                url text NOT NULL,
                classe text NOT NULL,
                matiere text NOT NULL,
                professeurId text,
                professeurNom text,
                createdAt text
            )';

            EXECUTE 'CREATE TABLE IF NOT EXISTS "payrolls_' || school_slug || '" (
                id text PRIMARY KEY,
                personnelId text NOT NULL,
                mois text NOT NULL,
                salaireBase numeric DEFAULT 0,
                primes numeric DEFAULT 0,
                deductions numeric DEFAULT 0,
                netAPayer numeric DEFAULT 0,
                statut text NOT NULL,
                datePaiement text,
                referencePaiement text
            )';
            
            EXECUTE 'CREATE TABLE IF NOT EXISTS "personnels_' || school_slug || '" (
                id text PRIMARY KEY,
                nom text NOT NULL,
                prenom text NOT NULL,
                role text NOT NULL,
                telephone text,
                email text
            )';
            
            EXECUTE 'CREATE TABLE IF NOT EXISTS "expenses_' || school_slug || '" (
                id text PRIMARY KEY,
                titre text NOT NULL,
                montant numeric NOT NULL,
                categorie text NOT NULL,
                date text NOT NULL,
                beneficiaire text,
                reference text,
                commentaire text,
                enregistrePar text
            )';
            
            EXECUTE 'CREATE TABLE IF NOT EXISTS "seances_' || school_slug || '" (
                id text PRIMARY KEY,
                classe text NOT NULL,
                matiere text NOT NULL,
                professeurId text NOT NULL,
                professeurNom text NOT NULL,
                date text NOT NULL,
                heureDebut text NOT NULL,
                heureFin text NOT NULL,
                statut text NOT NULL
            )';
            
        EXCEPTION WHEN OTHERS THEN 
            RAISE NOTICE 'Erreur %', SQLERRM;
        END;
    END LOOP;
END $$;
