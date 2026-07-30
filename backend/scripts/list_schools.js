require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: schools, error } = await supabase
        .from('schools')
        .select('*');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Schools:', schools);
    }
}

run();
