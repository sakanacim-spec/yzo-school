'use strict';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--verify-read-only') {
    console.error('VÉRIFICATION_BLOQUÉE : ARGUMENT_REQUIS');
    process.exitCode = 1;
    return;
}

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

require('dotenv').config({
    path: path.resolve(__dirname, '../../.env'),
    quiet: true
});

async function runVerification() {
    const pgPortStr = process.env.PGPORT;
    const pgPort = pgPortStr && /^[0-9]+$/.test(pgPortStr) ? Number(pgPortStr) : NaN;
    if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE || !process.env.PGPASSWORD || !process.env.PGSSLROOTCERT || isNaN(pgPort) || pgPort < 1 || pgPort > 65535) {
        console.error('CONFIGURATION_PG : VARIABLE_ABSENTE');
        process.exitCode = 1;
        return;
    }

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

    const client = new Client(pgConfig);
    const failures = [];
    let transactionStarted = false;
    let rollbackSucceeded = false;
    let connectionClosed = false;

    try {
        await client.connect();

        await client.query('BEGIN READ ONLY');
        transactionStarted = true;

        const roCheck = await client.query('SHOW transaction_read_only');
        if (roCheck.rows[0].transaction_read_only !== 'on') {
            throw new Error('Erreur : Session de vérification non sécurisée en lecture seule.');
        }

        console.log('🔍 DÉBUT DE LA VÉRIFICATION POST-MIGRATION (LECTURE SEULE)...');

        const targets = [
            'activity_logs_tgvuyhkgjlkjl',
            'campaigns_complexe_scolaire_la_grace',
            'campaigns_new_academy',
            'campaigns_rom_le_fidel',
            'campaigns_test_academy',
            'classe_matieres_tgvuyhkgjlkjl',
            'matieres_tgvuyhkgjlkjl'
        ];

        // 1. Vérifier que les 7 tables cibles sont toujours présentes et RLS active
        for (const t of targets) {
            const presenceRes = await client.query(`
                SELECT c.relname, c.relrowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind IN ('r', 'p')
            `, [t]);
            if (presenceRes.rows.length !== 1) {
                failures.push(`Table ${t} absente ou de type incorrect.`);
            } else {
                const rls = presenceRes.rows[0].relrowsecurity;
                if (rls !== true) {
                    failures.push(`Table ${t} RLS inactive.`);
                }
            }
        }

        // 2. Vérifier le nombre final exact de politiques service_role (doit être 77)
        const countRes = await client.query(`
            SELECT count(*) as count
            FROM pg_policies
            WHERE schemaname = 'public'
              AND left(policyname, 25) = 'service_role_full_access_'
        `);
        const finalCount = Number(countRes.rows[0].count);
        if (finalCount !== 77) {
            failures.push(`Nombre de politiques service_role incorrect : trouvé ${finalCount}, attendu 77.`);
        }

        // 3. Vérifier que chaque politique service_role_full_access_ est correcte (attendu 77 lignes)
        const polRes = await client.query(`
            SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'public'
              AND left(policyname, 25) = 'service_role_full_access_'
        `);

        if (polRes.rows.length !== 77) {
            failures.push(`Nombre de lignes retournées de politiques service_role incorrect : trouvé ${polRes.rows.length}, attendu 77.`);
        }

        for (const r of polRes.rows) {
            const isServiceRoleOnly = r.roles === '{service_role}';
            const isPermissive = r.permissive === 'PERMISSIVE';
            const isCmdAll = r.cmd === 'ALL';
            const isQualTrue = r.qual === 'true';
            const isCheckTrue = r.with_check === 'true';

            if (!isServiceRoleOnly || !isPermissive || !isCmdAll || !isQualTrue || !isCheckTrue) {
                failures.push(`Politique ${r.policyname} sur ${r.tablename} non conforme structurellement.`);
            }
        }

        // 4. Vérifier drop_school_tables privilèges de sécurité
        const execRes = await client.query(`
            SELECT
                EXISTS (
                    SELECT 1
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                    WHERE n.nspname = 'public'
                      AND p.oid = 'public.drop_school_tables(text)'::regprocedure
                      AND a.grantee = 0
                      AND a.privilege_type = 'EXECUTE'
                ) as public_execute,
                has_function_privilege('anon', 'public.drop_school_tables(text)'::regprocedure, 'execute') as anon_execute,
                has_function_privilege('authenticated', 'public.drop_school_tables(text)'::regprocedure, 'execute') as auth_execute,
                has_function_privilege('service_role', 'public.drop_school_tables(text)'::regprocedure, 'execute') as service_execute,
                has_function_privilege('postgres', 'public.drop_school_tables(text)'::regprocedure, 'execute') as postgres_execute
        `);
        const row = execRes.rows[0];

        if (row.public_execute === true) {
            failures.push("drop_school_tables est exécutable par PUBLIC.");
        }
        if (row.anon_execute === true) {
            failures.push("drop_school_tables est exécutable par anon.");
        }
        if (row.auth_execute === true) {
            failures.push("drop_school_tables est exécutable par authenticated.");
        }
        if (row.service_execute === false) {
            failures.push("drop_school_tables n'est plus exécutable par service_role.");
        }
        if (row.postgres_execute === false) {
            failures.push("drop_school_tables n'est plus exécutable par postgres.");
        }

        // Détecter tout autre bénéficiaire EXECUTE via aclexplode
        const aclExposedRes = await client.query(`
            SELECT
                COALESCE(r.rolname, 'PUBLIC') as grantee_name
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            LEFT JOIN pg_roles r ON r.oid = a.grantee
            WHERE n.nspname = 'public'
              AND p.oid = 'public.drop_school_tables(text)'::regprocedure
              AND a.grantee != 0
              AND COALESCE(r.rolname, '') NOT IN ('service_role', 'postgres')
              AND a.privilege_type = 'EXECUTE'
        `);

        if (aclExposedRes.rows.length > 0) {
            for (const exposed of aclExposedRes.rows) {
                failures.push(`drop_school_tables possède un bénéficiaire EXECUTE non autorisé : ${exposed.grantee_name}.`);
            }
        }

        // 5. Synthèse des résultats
        if (failures.length > 0) {
            console.error('\n🚨 ÉCHEC DE LA VÉRIFICATION POST-MIGRATION :');
            for (const fail of failures) {
                console.error(`  - ${fail}`);
            }
            throw new Error(`VÉRIFICATION_P0_NON_CONFORME (${failures.length})`);
        }

        console.log('✅ TOUTES LES VÉRIFICATIONS SONT PARFAITEMENT CONFORMES.');

    } catch (e) {
        console.error('❌ ÉCHEC DE LA VÉRIFICATION :', e.message);
        process.exitCode = 1;
    } finally {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
                rollbackSucceeded = true;
            } catch (_) {}
        }
        if (client) {
            try {
                await client.end();
                connectionClosed = true;
            } catch (_) {}
        }
    }

    console.log(`ROLLBACK : ${rollbackSucceeded ? 'SUCCÈS' : 'ÉCHEC'}`);
    console.log(`CONNEXION_FERMÉE : ${connectionClosed ? 'OUI' : 'NON'}`);
}

runVerification();
