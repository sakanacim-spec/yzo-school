require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('schools')
        .delete()
        .eq('slug', 'complexe_scolaire_la_plenitude');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success: Deleted orphaned school.', data);
    }
}

run();
