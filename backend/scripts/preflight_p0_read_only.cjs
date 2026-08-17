'use strict';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--preflight-read-only') {
    console.error('PREFLIGHT_P0_BLOQUÉ : ARGUMENT_REQUIS');
    process.exitCode = 1;
    return;
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { Client } = require('pg');

require('dotenv').config({
    path: path.resolve(__dirname, '../../.env'),
    quiet: true
});

async function runPreflight() {
    let currentStep = 'INITIALISATION';
    let client = null;
    let transactionActive = false;
    let rollbackExecuted = 'NON';
    let connectionClosed = 'NON';
    let hasFailure = false;

    // 1. Contrôle de la branche Git
    currentStep = 'CONTROLE_BRANCHE_GIT';
    let currentBranch = 'INCONNUE';
    try {
        currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch (_) {
        currentBranch = 'ERREUR_GIT';
    }
    const branchValid = currentBranch === 'feature/e164-auth';

    // 2. Contrôle du fichier de migration et de son hash SHA-256
    currentStep = 'CONTROLE_HASH_SQL';
    const sqlFilePath = path.resolve(__dirname, 'migration_p0_confinement.sql');
    const expectedHash = '013FFA00721FA238C6F5B72FD3130CF585499A814E8360AF99A03EA42F8FA13C';
    let hashMatch = false;

    if (fs.existsSync(sqlFilePath)) {
        const fileBuffer = fs.readFileSync(sqlFilePath);
        const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
        hashMatch = (actualHash === expectedHash);
    }

    // 3. Contrôle des variables d'environnement et de la configuration PG
    currentStep = 'CONTROLE_CONFIG_PG';
    const pgPortStr = process.env.PGPORT;
    const pgPort = pgPortStr && /^[0-9]+$/.test(pgPortStr) ? Number(pgPortStr) : NaN;
    const envVarsPresent = Boolean(
        process.env.PGHOST &&
        process.env.PGUSER &&
        process.env.PGDATABASE &&
        process.env.PGPASSWORD &&
        process.env.PGSSLROOTCERT &&
        !isNaN(pgPort) &&
        pgPort >= 1 &&
        pgPort <= 65535
    );

    let certValid = false;
    if (process.env.PGSSLROOTCERT && fs.existsSync(process.env.PGSSLROOTCERT)) {
        try {
            const certStat = fs.statSync(process.env.PGSSLROOTCERT);
            if (certStat.size > 0) {
                certValid = true;
            }
        } catch (_) {}
    }

    // 4. Correspondance d'environnement (Projet Supabase vs PGHOST/PGUSER)
    currentStep = 'CONTROLE_CORRESPONDANCE_ENVIRONNEMENT';
    let envMatch = false;
    try {
        let expectedRef = null;
        if (process.env.SUPABASE_URL) {
            const urlMatch = process.env.SUPABASE_URL.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in|net)/i);
            if (urlMatch) {
                expectedRef = urlMatch[1].toLowerCase();
            }
        }

        let hostRef = null;
        if (process.env.PGHOST) {
            const hostMatch = process.env.PGHOST.match(/^db\.([a-z0-9-]+)\.supabase\.(?:co|in|net)/i) ||
                             process.env.PGHOST.match(/^([a-z0-9-]+)\.pooler\.supabase\.(?:co|in|net)/i);
            if (hostMatch) {
                hostRef = hostMatch[1].toLowerCase();
            }
        }

        let userRef = null;
        if (process.env.PGUSER) {
            const userMatch = process.env.PGUSER.match(/^postgres\.([a-z0-9-]+)$/i);
            if (userMatch) {
                userRef = userMatch[1].toLowerCase();
            }
        }

        if (expectedRef) {
            if (hostRef && hostRef === expectedRef) {
                envMatch = true;
            } else if (userRef && userRef === expectedRef) {
                envMatch = true;
            }
        }
    } catch (_) {
        envMatch = false;
    }

    // Arrêt local obligatoire avant toute connexion si un contrôle local échoue
    if (!branchValid || !hashMatch || !envVarsPresent || !certValid || !envMatch) {
        console.log(`BRANCHE : ${currentBranch}`);
        console.log(`HASH_MIGRATION_CONFORME : ${hashMatch ? 'OUI' : 'NON'}`);
        console.log(`ENVIRONNEMENT_CORRESPONDANT : ${envMatch ? 'OUI' : 'NON'}`);
        console.log(`CONFIGURATION_PG_VALIDE : ${envVarsPresent ? 'OUI' : 'NON'}`);
        console.log(`CERTIFICAT_VALIDE : ${certValid ? 'OUI' : 'NON'}`);
        console.log('CONNEXION_DB : NON');
        console.log('PREFLIGHT_P0 : ÉCHEC_LOCAL');
        process.exitCode = 1;
        return;
    }

    let targetTablesExpected = 7;
    let targetTablesPresent = 'NON';
    let rlsInitialStateValid = 'NON';
    let initialPoliciesExpected = 70;
    let initialPoliciesValid = 'NON';
    let partialStateDetected = 'NON';
    let dropFunctionUnique = 'NON';
    let privPublicInitialValid = 'NON';
    let privAnonInitialValid = 'NON';
    let privAuthInitialValid = 'NON';
    let privServiceInitialValid = 'NON';
    let privPostgresInitialValid = 'NON';
    let initialPrivilegesValid = 'NON';
    let transactionReadOnly = 'NON';

    try {
        currentStep = 'CONNEXION_POSTGRES';
        const pgCa = fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8');
        const pgConfig = {
            host: process.env.PGHOST,
            user: process.env.PGUSER,
            database: process.env.PGDATABASE,
            password: process.env.PGPASSWORD,
            port: pgPort,
            ssl: {
                ca: pgCa,
                rejectUnauthorized: true
            },
            connectionTimeoutMillis: 5000,
            options: '-c default_transaction_read_only=on -c statement_timeout=15000'
        };

        client = new Client(pgConfig);
        await client.connect();

        currentStep = 'TRANSACTION_READ_ONLY';
        await client.query('BEGIN READ ONLY');
        transactionActive = true;

        const roCheck = await client.query('SHOW transaction_read_only');
        if (roCheck.rows[0] && roCheck.rows[0].transaction_read_only === 'on') {
            transactionReadOnly = 'OUI';
        } else {
            hasFailure = true;
            throw new Error('TRANSACTION_READ_ONLY_NON_ACTIVE');
        }

        // 5. Contrôle des 7 tables cibles et de leur état RLS initial
        currentStep = 'VERIFICATION_TABLES_CIBLES';
        const targetTables = [
            'activity_logs_tgvuyhkgjlkjl',
            'campaigns_complexe_scolaire_la_grace',
            'campaigns_new_academy',
            'campaigns_rom_le_fidel',
            'campaigns_test_academy',
            'classe_matieres_tgvuyhkgjlkjl',
            'matieres_tgvuyhkgjlkjl'
        ];

        const targetTablesRes = await client.query(`
            SELECT c.relname, c.relrowsecurity, c.relkind
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = ANY($1::text[])
              AND c.relkind IN ('r', 'p')
        `, [targetTables]);

        if (targetTablesRes.rows.length === 7) {
            targetTablesPresent = 'OUI';
            // Dans l'état pré-migration, RLS est initialement désactivé sur les 7 tables cibles
            const allRlsDisabled = targetTablesRes.rows.every(r => r.relrowsecurity === false);
            if (allRlsDisabled) {
                rlsInitialStateValid = 'OUI';
            } else {
                rlsInitialStateValid = 'NON';
                hasFailure = true;
            }
        } else {
            targetTablesPresent = 'NON';
            hasFailure = true;
        }

        // 6. Décompte et structure des politiques initiales (70 attendues)
        currentStep = 'VERIFICATION_POLITIQUES_RLS';
        const policiesRes = await client.query(`
            SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'public'
              AND left(policyname, 25) = 'service_role_full_access_'
        `);

        const totalPolicies = policiesRes.rows.length;
        const targetTablePolicies = policiesRes.rows.filter(r => targetTables.includes(r.tablename));
        const nonTargetPolicies = policiesRes.rows.filter(r => !targetTables.includes(r.tablename));

        let nonTargetPoliciesConform = true;
        for (const p of nonTargetPolicies) {
            const isPublicRole = p.roles === '{public}' || (Array.isArray(p.roles) && p.roles.length === 1 && p.roles[0] === 'public');
            if (p.permissive !== 'PERMISSIVE' || !isPublicRole || p.cmd !== 'ALL' || p.qual !== 'true' || p.with_check !== 'true') {
                nonTargetPoliciesConform = false;
                break;
            }
        }

        // Vérification qu'aucune politique ciblant exposed roles n'existe sur les 7 tables cibles
        const targetExposedPolRes = await client.query(`
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = ANY($1::text[])
              AND left(policyname, 25) != 'service_role_full_access_'
              AND (
                roles IS NULL
                OR roles::text[] && ARRAY['public', 'PUBLIC', 'anon', 'ANON', 'authenticated', 'AUTHENTICATED']
              )
        `, [targetTables]);

        const hasExposedPoliciesOnTargets = targetExposedPolRes.rows.length > 0;

        if (totalPolicies === 70 && targetTablePolicies.length === 0 && nonTargetPoliciesConform && !hasExposedPoliciesOnTargets) {
            initialPoliciesValid = 'OUI';
            partialStateDetected = 'NON';
        } else if (totalPolicies === 77 && targetTablePolicies.length === 7) {
            hasFailure = true;
            initialPoliciesValid = 'NON';
            partialStateDetected = 'OUI_DÉJÀ_APPLIQUÉE';
        } else {
            hasFailure = true;
            initialPoliciesValid = 'NON';
            partialStateDetected = 'OUI_PARTIEL_INVALIDE';
        }

        // 7. Vérification de la fonction unique public.drop_school_tables(text) et des privilèges
        currentStep = 'VERIFICATION_FONCTION_DROP';
        const funcRes = await client.query(`
            SELECT p.oid,
                   EXISTS (
                       SELECT 1
                       FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
                   ) as public_execute,
                   has_function_privilege('anon', p.oid, 'execute') as anon_execute,
                   has_function_privilege('authenticated', p.oid, 'execute') as auth_execute,
                   has_function_privilege('service_role', p.oid, 'execute') as service_execute,
                   has_function_privilege('postgres', p.oid, 'execute') as postgres_execute
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
              AND p.proname = 'drop_school_tables'
              AND oidvectortypes(p.proargtypes) = 'text'
        `);

        if (funcRes.rows.length === 1) {
            dropFunctionUnique = 'OUI';
            const fRow = funcRes.rows[0];

            privPublicInitialValid = fRow.public_execute === true ? 'OUI' : 'NON';
            privAnonInitialValid = fRow.anon_execute === true ? 'OUI' : 'NON';
            privAuthInitialValid = fRow.auth_execute === true ? 'OUI' : 'NON';
            privServiceInitialValid = fRow.service_execute === true ? 'OUI' : 'NON';
            privPostgresInitialValid = fRow.postgres_execute === true ? 'OUI' : 'NON';

            if (
                fRow.public_execute === true &&
                fRow.anon_execute === true &&
                fRow.auth_execute === true &&
                fRow.service_execute === true &&
                fRow.postgres_execute === true
            ) {
                initialPrivilegesValid = 'OUI';
            } else {
                initialPrivilegesValid = 'NON';
                hasFailure = true;
                if (partialStateDetected === 'NON') {
                    partialStateDetected = 'OUI_PRIVILÈGES_PARTIELLEMENT_MIGRÉS';
                }
            }
        } else {
            dropFunctionUnique = 'NON';
            hasFailure = true;
        }

    } catch (err) {
        hasFailure = true;
        console.log(`ERREUR_PG_CODE : ${err && err.code ? err.code : 'SANS_CODE'}`);
        console.log(`ÉTAPE_ÉCHEC : ${currentStep}`);
    } finally {
        if (client && transactionActive) {
            try {
                await client.query('ROLLBACK');
                rollbackExecuted = 'OUI';
            } catch (_) {}
        }
        if (client) {
            try {
                await client.end();
                connectionClosed = 'OUI';
            } catch (_) {}
        }
    }

    const allSuccess = !hasFailure &&
                       branchValid &&
                       hashMatch &&
                       envMatch &&
                       transactionReadOnly === 'OUI' &&
                       targetTablesPresent === 'OUI' &&
                       rlsInitialStateValid === 'OUI' &&
                       initialPoliciesValid === 'OUI' &&
                       partialStateDetected === 'NON' &&
                       dropFunctionUnique === 'OUI' &&
                       initialPrivilegesValid === 'OUI';

    console.log(`BRANCHE : ${currentBranch}`);
    console.log(`HASH_MIGRATION_CONFORME : ${hashMatch ? 'OUI' : 'NON'}`);
    console.log(`ENVIRONNEMENT_CORRESPONDANT : ${envMatch ? 'OUI' : 'NON'}`);
    console.log(`TRANSACTION_READ_ONLY : ${transactionReadOnly}`);
    console.log(`TABLES_CIBLES_ATTENDUES : ${targetTablesExpected}`);
    console.log(`TABLES_CIBLES_PRÉSENTES : ${targetTablesPresent}`);
    console.log(`ÉTAT_RLS_INITIAL_VALIDE : ${rlsInitialStateValid}`);
    console.log(`POLITIQUES_INITIALES_ATTENDUES : ${initialPoliciesExpected}`);
    console.log(`POLITIQUES_INITIALES_VALIDES : ${initialPoliciesValid}`);
    console.log(`ÉTAT_PARTIEL_DÉTECTÉ : ${partialStateDetected}`);
    console.log(`FONCTION_DROP_UNIQUE : ${dropFunctionUnique}`);
    console.log(`PRIVILÈGES_PUBLIC_INITIAUX_VALIDES : ${privPublicInitialValid}`);
    console.log(`PRIVILÈGES_ANON_INITIAUX_VALIDES : ${privAnonInitialValid}`);
    console.log(`PRIVILÈGES_AUTH_INITIAUX_VALIDES : ${privAuthInitialValid}`);
    console.log(`PRIVILÈGES_SERVICE_INITIAUX_VALIDES : ${privServiceInitialValid}`);
    console.log(`PRIVILÈGES_POSTGRES_INITIAUX_VALIDES : ${privPostgresInitialValid}`);
    console.log(`PRIVILÈGES_INITIAUX_VALIDES : ${initialPrivilegesValid}`);
    console.log(`ROLLBACK : ${rollbackExecuted}`);
    console.log(`CONNEXION_FERMÉE : ${connectionClosed}`);
    console.log(`PREFLIGHT_P0 : ${allSuccess ? 'SUCCÈS' : 'ÉCHEC'}`);

    process.exitCode = allSuccess ? 0 : 1;
}

runPreflight();
