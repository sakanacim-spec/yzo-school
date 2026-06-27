const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    try {
        console.log("Checking devoirs_la_grace...");
        const { data, error } = await supabase.from('devoirs_la_grace').select('*');
        if (error) {
            console.error('Error selecting:', error);
            return;
        }
        console.log('Devoirs:', data);
        
        if (data.length === 0) {
            console.log("Inserting a test devoir...");
            const { error: insertErr } = await supabase.from('devoirs_la_grace').upsert([{
                id: '00000000-0000-0000-0000-000000000001',
                date_donnee: '2026-06-27',
                date_rendu: '2026-06-30',
                matiere: 'Mathématiques',
                description: 'Test devoir',
                classe: 'CP1',
                professeur_nom: 'Test Prof',
                fichier_url: null
            }], { onConflict: 'id' });
            
            if (insertErr) {
                console.error('Error inserting:', insertErr);
            } else {
                console.log('Inserted successfully!');
            }
        }
    } catch (err) {
        console.error('Exception:', err);
    }
})();
