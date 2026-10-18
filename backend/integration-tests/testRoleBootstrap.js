'use strict';

/**
 * Identifiant constant de verrou consultatif PostgreSQL dédié à la création
 * idempotente des rôles Supabase dans l'environnement de test éphémère.
 * Ce verrou de session sérialise le bootstrap entre processus de tests concurrents.
 */
const ROLE_BOOTSTRAP_LOCK_ID = 918273645;

/**
 * Initialise de manière idempotente et protégée contre la concurrence multi-processus
 * les rôles factices 'anon', 'authenticated' et 'service_role' dans une base
 * PostgreSQL éphémère de test (CI), sous protection d'un verrou consultatif
 * de session (pg_advisory_lock).
 *
 * @param {import('pg').Client | import('pg').PoolClient} client
 */
async function bootstrapTestRoles(client) {
    await client.query('SELECT pg_advisory_lock($1);', [ROLE_BOOTSTRAP_LOCK_ID]);
    try {
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
                END IF;
            END $$;
        `);
    } finally {
        await client.query('SELECT pg_advisory_unlock($1);', [ROLE_BOOTSTRAP_LOCK_ID]);
    }
}

module.exports = {
    ROLE_BOOTSTRAP_LOCK_ID,
    bootstrapTestRoles
};
