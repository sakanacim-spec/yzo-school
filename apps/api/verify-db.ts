import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually
const envPath = path.resolve(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim();
  }
});

const supabaseUrl = env['SAAS_SUPABASE_URL'];
const supabaseKey = env['SAAS_SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement manquantes dans .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDatabase() {
  console.log("🔍 Vérification de la base de données Supabase...");
  let allGood = true;

  // 1. Vérifier la table saas_tenants
  const { data: tenants, error: err1 } = await supabase.from('saas_tenants').select('*');
  if (err1) {
    console.error("❌ Erreur sur la table saas_tenants:", err1.message);
    allGood = false;
  } else {
    console.log(`✅ Table saas_tenants ok (${tenants.length} enregistrements trouvés)`);
    if (tenants.length === 0) {
        console.warn("⚠️  La table saas_tenants est vide. Avez-vous exécuté seed.sql ?");
        allGood = false;
    }
  }

  // 2. Vérifier la table saas_organizations
  const { data: orgs, error: err2 } = await supabase.from('saas_organizations').select('*');
  if (err2) {
    console.error("❌ Erreur sur la table saas_organizations:", err2.message);
    allGood = false;
  } else {
    console.log(`✅ Table saas_organizations ok (${orgs.length} enregistrements trouvés)`);
  }

  // 3. Vérifier la table saas_roles
  const { data: roles, error: err3 } = await supabase.from('saas_roles').select('*');
  if (err3) {
    console.error("❌ Erreur sur la table saas_roles:", err3.message);
    allGood = false;
  } else {
    console.log(`✅ Table saas_roles ok (${roles.length} enregistrements trouvés)`);
  }

  // 4. Vérifier la table saas_user_roles (qui posait problème)
  const { data: userRoles, error: err4 } = await supabase.from('saas_user_roles').select('*');
  if (err4) {
    console.error("❌ Erreur sur la table saas_user_roles:", err4.message);
    allGood = false;
  } else {
    console.log(`✅ Table saas_user_roles ok (${userRoles.length} enregistrements trouvés)`);
  }

  if (allGood) {
      console.log("\n🎉 SUCCÈS ! Les 3 fichiers SQL ont été exécutés correctement.");
  } else {
      console.log("\n❌ Il semble y avoir un problème avec au moins l'un des fichiers SQL.");
  }
}

verifyDatabase();
