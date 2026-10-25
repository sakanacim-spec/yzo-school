-- Audit script for Parent Pack migrations P19 → P27 (read‑only)
-- No DDL/DML, pure SELECTs. Designed to return one row per check.
-- Columns: migration | check_type | object_name | observed | expected | status

WITH
-- 1. Table presence checks (P19 foundation tables)
table_checks AS (
    SELECT
        'migration_p19_parent_pack_foundation.sql' AS migration,
        'table_presence' AS check_type,
        tbl.relname AS object_name,
        CASE WHEN tbl.relkind = 'r' THEN 'TABLE' ELSE 'MISSING' END AS observed,
        'TABLE' AS expected,
        CASE WHEN tbl.relkind = 'r' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_class tbl
    WHERE tbl.relname IN (
        'parent_pack_pricing','parent_pack_invitations','parent_subscriptions',
        'parent_subscription_periods','school_commission_ledger','school_payout_channels',
        'school_payouts','school_payout_items','school_payout_events'
    )
    AND tbl.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),

-- 2. Column presence in parent_subscriptions (P19)
column_checks AS (
    SELECT
        'migration_p19_parent_pack_foundation.sql' AS migration,
        'column_presence' AS check_type,
        format('parent_subscriptions.%s', column_name) AS object_name,
        data_type || (CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END) AS observed,
        CASE column_name
            WHEN 'student_ref' THEN 'text NOT NULL'
            WHEN 'parent_ref'  THEN 'text NOT NULL'
            WHEN 'school_slug' THEN 'text NOT NULL'
            WHEN 'pricing_id'  THEN 'uuid NOT NULL'
            WHEN 'status'      THEN 'text NOT NULL'
            ELSE data_type
        END AS expected,
        CASE WHEN column_name IN ('student_ref','parent_ref','school_slug','pricing_id','status') THEN 'OK' ELSE 'MISSING' END AS status
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_subscriptions'
      AND column_name IN ('student_ref','parent_ref','school_slug','pricing_id','status')
),

-- 3. Trigger presence (P19)
trigger_checks AS (
    SELECT
        'migration_p19_parent_pack_foundation.sql' AS migration,
        'trigger_presence' AS check_type,
        tg.tgname AS object_name,
        tg.tgtype::text AS observed,
        'BEFORE INSERT OR UPDATE' AS expected,
        CASE WHEN tg.tgname = 'trg_validate_period_payment_intent' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_trigger tg
    JOIN pg_class tbl ON tg.tgrelid = tbl.oid
    WHERE tbl.relname = 'parent_subscription_periods'
      AND tg.tgname = 'trg_validate_period_payment_intent'
),

-- 4. Legacy table rename checks (P20)
legacy_rename_checks AS (
    SELECT
        'migration_p20_archive_legacy_p14_for_parent_pack.sql' AS migration,
        'legacy_table_rename' AS check_type,
        legacy_name AS object_name,
        CASE WHEN to_regclass('public.'||legacy_name) IS NOT NULL THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        'EXISTS' AS expected,
        CASE WHEN to_regclass('public.'||legacy_name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
    FROM (VALUES
        ('legacy_p14_parent_subscriptions'),
        ('legacy_p14_parent_subscription_periods'),
        ('legacy_p14_school_commission_ledger'),
        ('legacy_p14_school_payout_channels'),
        ('legacy_p14_school_payouts'),
        ('legacy_p14_school_payout_items'),
        ('legacy_p14_school_payout_attempts'),
        ('legacy_p14_payout_channel_audits')
    ) AS v(legacy_name)
),

-- 5. Webhook handler signature (P21)
webhook_signature AS (
    SELECT
        'migration_p21_parent_pack_webhook.sql' AS migration,
        'function_signature' AS check_type,
        proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS object_name,
        pg_get_functiondef(p.oid) AS observed,
        'process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN)' AS expected,
        CASE WHEN proname = 'process_parent_pack_webhook_event' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_proc p
    WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND proname = 'process_parent_pack_webhook_event'
),

-- 6. P22 logic verification (expected strings present)
p22_logic AS (
    SELECT
        'migration_p22_fix_parent_pack_payment_intent_contract.sql' AS migration,
        'function_logic' AS check_type,
        'process_parent_pack_webhook_event' AS object_name,
        pg_get_functiondef(p.oid) AS observed,
        'uses expected_currency & sets processed_at = p_certified_payment_at' AS expected,
        CASE
            WHEN pg_get_functiondef(p.oid) ILIKE '%v_intent.expected_currency%'
                 AND pg_get_functiondef(p.oid) ILIKE '%processed_at = p_certified_payment_at%'
            THEN 'OK' ELSE 'DIFFERENT' END AS status
    FROM pg_proc p
    WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND proname = 'process_parent_pack_webhook_event'
),

-- 7. Unique constraint on parent_subscriptions.student_global_id (P23)
unique_student_global AS (
    SELECT
        'migration_p23_fix_parent_pack_no_affiliate.sql' AS migration,
        'unique_constraint' AS check_type,
        con.conname AS object_name,
        pg_get_constraintdef(con.oid) AS observed,
        'UNIQUE (student_global_id)' AS expected,
        CASE WHEN con.conname LIKE 'uq%student_global_id%' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_constraint con
    JOIN pg_class tbl ON con.conrelid = tbl.oid
    WHERE tbl.relname = 'parent_subscriptions'
      AND con.contype = 'u'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = tbl.oid AND a.attname = 'student_global_id' AND a.attnum = ANY(con.conkey))
),

-- 8. Columns added in P24 (student_global_id, etc.)
p24_columns AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'column_addition' AS check_type,
        format('parent_subscriptions.%s', col) AS object_name,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='parent_subscriptions' AND column_name=col)
            THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        col_def AS expected,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='parent_subscriptions' AND column_name=col)
            THEN 'OK' ELSE 'MISSING' END AS status
    FROM (VALUES
        ('student_global_id','uuid NULL'),
        ('billing_anchor_date','date NULL'),
        ('cumulative_months','integer NOT NULL DEFAULT 0')
    ) AS v(col, col_def)
),

-- 9. Global tables created in P24
p24_tables AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'table_creation' AS check_type,
        tbl.relname AS object_name,
        CASE WHEN tbl.relkind = 'r' THEN 'TABLE' ELSE 'MISSING' END AS observed,
        'TABLE' AS expected,
        CASE WHEN tbl.relkind = 'r' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_class tbl
    WHERE tbl.relname IN ('global_students','student_global_mappings','parent_child_links')
      AND tbl.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
),

-- 10. Primary key on parent_child_links (P24)
parent_child_pk AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'primary_key' AS check_type,
        'parent_child_links' AS object_name,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname='parent_child_links' AND c.contype='p')
            THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        'PRIMARY KEY (parent_ref, student_global_id)' AS expected,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname='parent_child_links' AND c.contype='p')
            THEN 'OK' ELSE 'MISSING' END AS status
),

-- 11. Foreign key parent_subscriptions.student_global_id → global_students (P24)
fk_student_global AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'foreign_key' AS check_type,
        'fk_parent_subs_global_student' AS object_name,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname='fk_parent_subs_global_student')
            THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        'FOREIGN KEY (student_global_id) REFERENCES public.global_students(student_global_id)' AS expected,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname='fk_parent_subs_global_student')
            THEN 'OK' ELSE 'MISSING' END AS status
),

-- 12. Unique index on parent_subscriptions.student_global_id (P24)
unique_idx_student_global AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'unique_index' AS check_type,
        'uq_parent_subscriptions_global_unique' AS object_name,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_class t ON i.indrelid = t.oid
            WHERE t.relname='parent_subscriptions' AND i.indisunique
              AND i.indkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname='student_global_id')])
            THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        'UNIQUE (student_global_id)' AS expected,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_index i
            JOIN pg_class t ON i.indrelid = t.oid
            WHERE t.relname='parent_subscriptions' AND i.indisunique
              AND i.indkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname='student_global_id')])
            THEN 'OK' ELSE 'MISSING' END AS status
),

-- 13. Helper functions from P25 (date_from_intvl) and P26 (smart_search)
helper_functions AS (
    SELECT
        'migration_p25_a_date_rpc.sql' AS migration,
        'function_signature' AS check_type,
        proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS object_name,
        pg_get_functiondef(p.oid) AS observed,
        'date_from_intvl(uuid, integer)' AS expected,
        CASE WHEN proname='date_from_intvl' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_proc p
    WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
      AND proname='date_from_intvl'
    UNION ALL
    SELECT
        'migration_p26_a1_smart_search.sql',
        'function_signature',
        proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        pg_get_functiondef(p.oid),
        'smart_search_parent_pack(text)',
        CASE WHEN proname='smart_search_parent_pack' THEN 'OK' ELSE 'MISSING' END
    FROM pg_proc p
    WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
      AND proname='smart_search_parent_pack'
),

-- 14. P27 column additions
p27_columns AS (
    SELECT
        'migration_p27_parent_pack_reconciliation_defense.sql' AS migration,
        'column_addition' AS check_type,
        format('parent_subscriptions.%s', col) AS object_name,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='parent_subscriptions' AND column_name=col)
            THEN 'EXISTS' ELSE 'ABSENT' END AS observed,
        col_def AS expected,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='parent_subscriptions' AND column_name=col)
            THEN 'OK' ELSE 'MISSING' END AS status
    FROM (VALUES
        ('billing_anchor_date','date NULL'),
        ('cumulative_months','integer NOT NULL DEFAULT 0')
    ) AS v(col, col_def)
),

-- 15. P27 gap‑recovery logic in prepare_parent_pack_checkout
p27_gap_logic AS (
    SELECT
        'migration_p27_parent_pack_reconciliation_defense.sql' AS migration,
        'function_logic_gap_recovery' AS check_type,
        'prepare_parent_pack_checkout' AS object_name,
        pg_get_functiondef(p.oid) AS observed,
        'uses v_start_date := p_certified_payment_at; v_anchor_date := v_start_date; v_cumulative_months := v_duration_months;' AS expected,
        CASE
            WHEN pg_get_functiondef(p.oid) ILIKE '%v_start_date := p_certified_payment_at%'
                 AND pg_get_functiondef(p.oid) ILIKE '%v_anchor_date := v_start_date%'
                 AND pg_get_functiondef(p.oid) ILIKE '%v_cumulative_months := v_duration_months%'
            THEN 'OK' ELSE 'DIFFERENT' END AS status
    FROM pg_proc p
    WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
      AND proname = 'prepare_parent_pack_checkout'
),

-- 16. parent_child_links structure verification (columns & PK)
parent_child_structure AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'table_structure' AS check_type,
        'parent_child_links' AS object_name,
        (SELECT string_agg(col || ':' || data_type, ', ')
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name='parent_child_links') AS observed,
        'parent_ref:text, student_global_id:uuid, first_linked_at:timestamp with time zone, current_link_active:boolean, PRIMARY KEY(parent_ref, student_global_id)' AS expected,
        CASE
            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_child_links' AND column_name='parent_ref' AND data_type='text')
                 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_child_links' AND column_name='student_global_id' AND udt_name='uuid')
                 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_child_links' AND column_name='current_link_active' AND data_type='boolean')
            THEN 'OK' ELSE 'DIFFERENT' END AS status
),

-- 17. Unique constraint on parent_subscriptions(parent_ref, student_global_id) (P24)
uniq_parent_child AS (
    SELECT
        'migration_p24_parent_pack_global_student_checkout.sql' AS migration,
        'unique_constraint' AS check_type,
        con.conname AS object_name,
        pg_get_constraintdef(con.oid) AS observed,
        'UNIQUE (parent_ref, student_global_id)' AS expected,
        CASE WHEN con.conname LIKE 'uq%parent_child%' OR con.conname LIKE 'uq%parent_ref_student_global_id%' THEN 'OK' ELSE 'MISSING' END AS status
    FROM pg_constraint con
    JOIN pg_class tbl ON con.conrelid = tbl.oid
    WHERE tbl.relname = 'parent_subscriptions'
      AND con.contype = 'u'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = tbl.oid AND a.attname = 'parent_ref' AND a.attnum = ANY(con.conkey))
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = tbl.oid AND a.attname = 'student_global_id' AND a.attnum = ANY(con.conkey))
)

SELECT * FROM (
    SELECT * FROM table_checks
    UNION ALL SELECT * FROM column_checks
    UNION ALL SELECT * FROM trigger_checks
    UNION ALL SELECT * FROM legacy_rename_checks
    UNION ALL SELECT * FROM webhook_signature
    UNION ALL SELECT * FROM p22_logic
    UNION ALL SELECT * FROM unique_student_global
    UNION ALL SELECT * FROM p24_columns
    UNION ALL SELECT * FROM p24_tables
    UNION ALL SELECT * FROM parent_child_pk
    UNION ALL SELECT * FROM fk_student_global
    UNION ALL SELECT * FROM unique_idx_student_global
    UNION ALL SELECT * FROM helper_functions
    UNION ALL SELECT * FROM p27_columns
    UNION ALL SELECT * FROM p27_gap_logic
    UNION ALL SELECT * FROM parent_child_structure
    UNION ALL SELECT * FROM uniq_parent_child
) AS all_checks
ORDER BY migration, check_type, object_name;
