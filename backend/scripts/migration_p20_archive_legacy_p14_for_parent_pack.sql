-- Migration P20: archive empty legacy P14 Pack Parent schema before P19
--
-- Purpose: resolve the naming collision left by the old P14 prototype without
-- deleting data or using CASCADE. This migration only applies to environments
-- where that prototype exists and all of its tables are empty.
--
-- Operational order for legacy environments: run P20 first, then run the
-- already-versioned migration_p19_parent_pack_foundation.sql unchanged.

BEGIN;

DO $p20$
DECLARE
    v_legacy_tables CONSTANT text[] := ARRAY[
        'parent_subscriptions',
        'parent_subscription_periods',
        'school_commission_ledger',
        'school_payout_channels',
        'school_payouts',
        'school_payout_items',
        'school_payout_attempts',
        'payout_channel_audits'
    ];
    v_legacy_table text;
    v_archived_count integer;
    v_row_count bigint;
BEGIN
    -- A completed P20 is intentionally idempotent: every old object has been
    -- preserved under an explicit legacy_p14_ name.
    SELECT count(*)
      INTO v_archived_count
      FROM unnest(v_legacy_tables) AS t(table_name)
     WHERE to_regclass(format('public.%I', 'legacy_p14_' || t.table_name)) IS NOT NULL;

    IF v_archived_count = cardinality(v_legacy_tables) THEN
        RAISE NOTICE 'P20 already applied: legacy P14 Pack Parent tables are archived.';
        RETURN;
    END IF;

    IF v_archived_count <> 0 THEN
        RAISE EXCEPTION
            'P20 stopped: incomplete legacy archive detected (% of % tables archived).',
            v_archived_count, cardinality(v_legacy_tables);
    END IF;

    -- P20 is a compatibility precondition. Do not mix it with a partially or
    -- already-applied P19 schema.
    IF to_regclass('public.parent_pack_pricing') IS NOT NULL
       OR to_regclass('public.parent_pack_invitations') IS NOT NULL
       OR to_regclass('public.school_payout_events') IS NOT NULL THEN
        RAISE EXCEPTION
            'P20 stopped: P19-specific tables already exist; inspect the schema before retrying.';
    END IF;

    -- Acquire rather than wait for exclusive access. A live writer makes this
    -- migration stop safely instead of competing with an active operation.
    LOCK TABLE
        public.parent_subscriptions,
        public.parent_subscription_periods,
        public.school_commission_ledger,
        public.school_payout_channels,
        public.school_payouts,
        public.school_payout_items,
        public.school_payout_attempts,
        public.payout_channel_audits
    IN ACCESS EXCLUSIVE MODE NOWAIT;

    FOREACH v_legacy_table IN ARRAY v_legacy_tables LOOP
        IF to_regclass(format('public.%I', v_legacy_table)) IS NULL THEN
            RAISE EXCEPTION 'P20 stopped: expected legacy table public.% is missing.', v_legacy_table;
        END IF;

        EXECUTE format('SELECT count(*) FROM public.%I', v_legacy_table)
           INTO v_row_count;

        IF v_row_count <> 0 THEN
            RAISE EXCEPTION
                'P20 stopped: public.% contains % row(s); no archival rename was performed.',
                v_legacy_table, v_row_count;
        END IF;
    END LOOP;

    -- Shape guards prevent accidentally renaming an already-modern P19 table.
    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'parent_subscriptions'
           AND column_name = 'student_id'
    ) THEN
        RAISE EXCEPTION
            'P20 stopped: parent_subscriptions does not have the legacy P14 shape.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'school_payouts'
           AND column_name = 'payout_amount'
    ) THEN
        RAISE EXCEPTION
            'P20 stopped: school_payouts does not have the legacy P14 shape.';
    END IF;

    -- Renaming preserves the original relations, foreign keys, triggers and
    -- audit definitions. No DROP, DELETE, TRUNCATE or CASCADE is used.
    ALTER TABLE public.parent_subscriptions
        RENAME TO legacy_p14_parent_subscriptions;
    ALTER TABLE public.parent_subscription_periods
        RENAME TO legacy_p14_parent_subscription_periods;
    ALTER TABLE public.school_commission_ledger
        RENAME TO legacy_p14_school_commission_ledger;
    ALTER TABLE public.school_payout_channels
        RENAME TO legacy_p14_school_payout_channels;
    ALTER TABLE public.school_payouts
        RENAME TO legacy_p14_school_payouts;
    ALTER TABLE public.school_payout_items
        RENAME TO legacy_p14_school_payout_items;
    ALTER TABLE public.school_payout_attempts
        RENAME TO legacy_p14_school_payout_attempts;
    ALTER TABLE public.payout_channel_audits
        RENAME TO legacy_p14_payout_channel_audits;
END
$p20$;

COMMENT ON TABLE public.legacy_p14_parent_subscriptions IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_parent_subscription_periods IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_school_commission_ledger IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_school_payout_channels IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_school_payouts IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_school_payout_items IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_school_payout_attempts IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';
COMMENT ON TABLE public.legacy_p14_payout_channel_audits IS
    'Archived empty P14 Pack Parent prototype; retained by P20 before P19.';

COMMIT;
