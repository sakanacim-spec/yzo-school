const args = process.argv.slice(2);

if (args.length !== 1 || args[0] !== '--verify-read-only') {
    console.error("VÉRIFICATION_BLOQUÉE : ARGUMENT_REQUIS");
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, quiet: true });
}

const pgPortRaw = process.env.PGPORT;
const port = pgPortRaw && /^[0-9]+$/.test(pgPortRaw)
    ? Number(pgPortRaw)
    : NaN;
if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE || !process.env.PGPASSWORD || isNaN(port) || port < 1 || port > 65535 || !process.env.PGSSLROOTCERT) {
    console.error("Configuration invalide.");
    process.exit(1);
}

const pgCa = fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8');

async function verify() {
    let client;
    try {
        const { execSync } = require('child_process');
        const branch = execSync('git branch --show-current').toString().trim();
        if (branch !== 'feature/e164-auth') {
            throw new Error(`Branche incorrecte: ${branch}`);
        }

        client = new Client({
            host: process.env.PGHOST,
            user: process.env.PGUSER,
            database: process.env.PGDATABASE,
            password: process.env.PGPASSWORD,
            port: port,
            ssl: {
                ca: pgCa,
                rejectUnauthorized: true
            },
            connectionTimeoutMillis: 10000,
            statement_timeout: 10000
        });

        await client.connect();

        await client.query('BEGIN READ ONLY');
        const res = await client.query('SHOW transaction_read_only');
        if (res.rows[0].transaction_read_only !== 'on') {
            throw new Error('Transaction is not read-only');
        }

        // Assert DEFAULT ACLs
        const targetRoles = ['postgres'];
        const objTypes = [{ type: 'r', expected: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] },
                          { type: 'S', expected: ['USAGE', 'SELECT', 'UPDATE'] },
                          { type: 'f', expected: ['EXECUTE'] }];

        for (const role of targetRoles) {
            for (const { type, expected } of objTypes) {
                const aclRes = await client.query(`
                    SELECT grantee.rolname as grantee, array_agg(privilege_type) as privs
                    FROM pg_default_acl a
                    JOIN pg_roles r_def ON a.defaclrole = r_def.oid
                    JOIN pg_namespace n ON a.defaclnamespace = n.oid
                    CROSS JOIN LATERAL aclexplode(a.defaclacl) privs
                    LEFT JOIN pg_roles grantee ON privs.grantee = grantee.oid
                    WHERE r_def.rolname = $1 AND n.nspname = 'public' AND a.defaclobjtype = $2
                    GROUP BY grantee.rolname, privs.grantee
                `, [role, type]);

                let srPrivs = [];
                for (const row of aclRes.rows) {
                    if (row.grantee === 'anon' || row.grantee === null) {
                        throw new Error(`Privilège interdit pour anon/PUBLIC sur type ${type} par ${role}`);
                    }
                    if (row.grantee === 'authenticated') {
                        throw new Error(`Privilège interdit pour authenticated sur type ${type} par ${role}`);
                    }
                    if (row.grantee === 'service_role') {
                        srPrivs = row.privs;
                    }
                }

                if (srPrivs.length === 0 || !expected.every(p => srPrivs.includes(p)) || !srPrivs.every(p => expected.includes(p))) {
                    throw new Error(`service_role manque de privilèges ou a des privilèges incorrects sur type ${type} par ${role}`);
                }
            }
        }

        // Assert function in pg_proc
        const funcRes = await client.query(`
            SELECT p.oid, format_type(prorettype, NULL) as ret, l.lanname, p.prosecdef, p.proconfig, p.prosrc,
                   pg_get_function_arguments(p.oid) as args, p.pronargdefaults, p.pronargs
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON p.prolang = l.oid
            WHERE n.nspname = 'public' AND p.proname = 'create_school_tables'
            AND pg_get_function_identity_arguments(p.oid) = 'school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid'
        `);

        if (funcRes.rows.length !== 1) {
            throw new Error(`Erreur: ${funcRes.rows.length} fonction(s) trouvée(s) pour create_school_tables`);
        }

        const func = funcRes.rows[0];
        if (func.ret !== 'json') throw new Error('Type de retour n\'est pas json');
        if (func.lanname !== 'plpgsql') throw new Error('Langage n\'est pas plpgsql');
        if (!func.prosecdef) throw new Error('prosecdef n\'est pas true');
        if (!func.proconfig || func.proconfig.length !== 1 || func.proconfig[0] !== 'search_path=public, pg_temp') {
            throw new Error('search_path incorrect ou absent');
        }
        if (func.pronargs !== 5) throw new Error('nombre exact d arguments = 5 attendu');
        if (func.pronargdefaults !== 4) throw new Error('pronargdefaults = 4 attendu');
        if (func.args !== 'school_slug text, admin_nom text DEFAULT NULL::text, admin_telephone text DEFAULT NULL::text, admin_phone_normalized text DEFAULT NULL::text, admin_auth_id uuid DEFAULT NULL::uuid') throw new Error('pg_get_function_arguments exact attendu');

        const expectedFamilies = [
            'profiles_', 'students_', 'parent_student_', 'payments_', 'presences_', 'devoirs_',
            'notes_', 'matieres_', 'classe_matieres_', 'activity_logs_', 'app_settings_',
            'resources_', 'payrolls_', 'personnels_', 'expenses_', 'seances_',
            'campaigns_', 'donations_'
        ];

        // Extraction of the tables_list array
        const listMatch = func.prosrc.match(/tables_list\s+text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]\s*;/);
        if (!listMatch) throw new Error("tables_list text[] := ARRAY[...] introuvable dans prosrc");

        const listContent = listMatch[1];
        const elementsMatch = listContent.match(/'([a-z0-9_]+)'\s*\|\|\s*school_slug/g);
        if (!elementsMatch) throw new Error("Aucun élément trouvé dans tables_list");

        const actualFamilies = elementsMatch.map(e => e.match(/'([a-z0-9_]+)'/)[1]);

        if (actualFamilies.length !== 18) throw new Error(`Exactement 18 éléments attendus dans tables_list, trouvés: ${actualFamilies.length}`);

        const actualSet = new Set(actualFamilies);
        if (actualSet.size !== 18) throw new Error("Doublons détectés dans tables_list");

        for (const f of expectedFamilies) {
            if (!actualSet.has(f)) throw new Error(`Famille manquante dans tables_list: ${f}`);
        }

        for (const f of actualFamilies) {
            if (!expectedFamilies.includes(f)) throw new Error(`Famille inattendue dans tables_list: ${f}`);
        }

        // Check CREATE TABLE exactly once for each of the 18 families
        for (const f of expectedFamilies) {
            const createRegex = new RegExp(`EXECUTE\\s+format\\(\\s*'\\s*CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.%I(?:(?!EXECUTE)[\\s\\S])*?'\\s*,\\s*'\\s*${f}'\\s*\\|\\|\\s*school_slug(?:\\s*,\\s*'[a-z0-9_]+'\\s*\\|\\|\\s*school_slug)*\\s*\\)`, 'gi');
            const occurrences = func.prosrc.match(createRegex);
            if (!occurrences || occurrences.length !== 1) {
                throw new Error(`La création de table pour la famille ${f} doit apparaître exactement 1 fois dans prosrc, trouvé: ${occurrences ? occurrences.length : 0}`);
            }
        }

        const expectedSecurityMechanisms = [
            "ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY",
            "REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated",
            "GRANT ALL ON TABLE public.%I TO service_role",
            "DROP POLICY IF EXISTS",
            "CREATE POLICY",
            "'service_role_full_access'",
            "FOR ALL TO service_role",
            "USING (true)",
            "WITH CHECK (true)"
        ];

        for (const c of expectedSecurityMechanisms) {
            if (!func.prosrc.includes(c)) throw new Error('Boucle de sécurité manquante ou incomplète: ' + c);
        }
        // Note: ce contrôle statique de prosrc sera complété ultérieurement par un test transactionnel avec ROLLBACK.

        const pubExec = await client.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_proc p
                CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                WHERE p.oid = $1 AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
            ) as has
        `, [func.oid]);
        const anonExec = await client.query("SELECT has_function_privilege('anon', $1, 'EXECUTE') as has", [func.oid]);
        const authExec = await client.query("SELECT has_function_privilege('authenticated', $1, 'EXECUTE') as has", [func.oid]);
        const srExec = await client.query("SELECT has_function_privilege('service_role', $1, 'EXECUTE') as has", [func.oid]);
        const pgExec = await client.query("SELECT has_function_privilege('postgres', $1, 'EXECUTE') as has", [func.oid]);

        if (pubExec.rows[0].has) throw new Error('PUBLIC a EXECUTE');
        if (anonExec.rows[0].has) throw new Error('anon a EXECUTE');
        if (authExec.rows[0].has) throw new Error('authenticated a EXECUTE');
        if (!srExec.rows[0].has) throw new Error('service_role manque EXECUTE');
        if (!pgExec.rows[0].has) throw new Error('postgres manque EXECUTE');

        await client.query('ROLLBACK');
        console.log('Toutes les assertions ont réussi.');
        process.exitCode = 0;

    } catch (e) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Erreur lors de la vérification:', e.message);
        process.exitCode = 1;
    } finally {
        if (client) await client.end();
    }
}

verify();
