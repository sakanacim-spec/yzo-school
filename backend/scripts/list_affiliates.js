require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: affiliates, error } = await supabase
        .from('affiliates')
        .select('*');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Ambassadeurs:', affiliates);
    }
}

run();
