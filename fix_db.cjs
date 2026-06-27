const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    // try inline_code_block
    const { data, error } = await supabase.rpc('inline_code_block', { sql_string: `
        CREATE TABLE IF NOT EXISTS public.devoirs_la_grace (
            id UUID PRIMARY KEY,
            date_donnee DATE NOT NULL,
            date_rendu DATE NOT NULL,
            matiere TEXT NOT NULL,
            description TEXT NOT NULL,
            classe TEXT NOT NULL,
            professeur_nom TEXT NOT NULL,
            fichier_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
        );
    ` });
    if (error) console.error('inline_code_block failed:', error);
    else console.log('Success inline_code_block:', data);
})();
