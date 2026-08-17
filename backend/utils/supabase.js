'use strict';
const path = require('path');
const fs = require('fs');

const rootEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath, quiet: true });
}

const requiredVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
const missingVariables = requiredVariables.filter(name => !process.env[name]);

if (missingVariables.length > 0) {
    console.error('VARIABLE_ABSENTE');
    process.exitCode = 1;
    throw new Error('VARIABLE_ABSENTE');
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAdmin = supabase;

module.exports = { supabase, supabaseAdmin };
