require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const hashed = await bcrypt.hash('123456', 10);
    const { data, error } = await supabase
        .from('affiliates')
        .update({ password_hash: hashed })
        .eq('telephone', '90000000');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success: Password reset for 90000000 to 123456.', data);
    }
}

run();
