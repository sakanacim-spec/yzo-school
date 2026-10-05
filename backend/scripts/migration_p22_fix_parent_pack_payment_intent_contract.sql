-- Migration P22: Correction du contrat payment_intents pour le webhook Pack Parent
--
-- Prérequis : P21 déjà appliquée.
-- Cette migration ne touche ni P18, ni le répartiteur v2, ni les flux
-- donation, tuition et saas_subscription. Elle remplace seulement les deux
-- références de colonnes incompatibles dans le handler parent_pack P21.

BEGIN;

DO $p22_fix_parent_pack_handler$
DECLARE
    v_handler_oid oid;
    v_handler_definition text;
BEGIN
    SELECT to_regprocedure(
        'public.process_parent_pack_webhook_event(character varying,character varying,character varying,uuid,text,numeric,text,text,timestamp with time zone,numeric,numeric,boolean)'
    )::oid
    INTO v_handler_oid;

    IF v_handler_oid IS NULL THEN
        RAISE EXCEPTION 'P22 stopped: P21 parent_pack webhook handler is required first.';
    END IF;

    SELECT pg_get_functiondef(v_handler_oid)
    INTO v_handler_definition;

    -- Fail closed: ne modifier que le handler P21 attendu.
    IF v_handler_definition NOT LIKE '%v_intent.payable_amount%'
       OR v_handler_definition NOT LIKE '%public.school_commission_ledger%'
       OR v_handler_definition NOT LIKE '%PARENT_PACK_%' THEN
        RAISE EXCEPTION 'P22 stopped: unexpected parent_pack webhook handler definition.';
    END IF;

    -- La structure réelle de payment_intents utilise expected_currency et
    -- processed_at. CREATE OR REPLACE conserve les privilèges déjà restreints.
    v_handler_definition := replace(
        v_handler_definition,
        'v_intent.currency',
        'v_intent.expected_currency'
    );
    v_handler_definition := replace(
        v_handler_definition,
        'completed_at = p_certified_payment_at',
        'processed_at = p_certified_payment_at'
    );

    EXECUTE v_handler_definition;

    SELECT pg_get_functiondef(v_handler_oid)
    INTO v_handler_definition;

    IF v_handler_definition LIKE '%v_intent.currency%'
       OR v_handler_definition LIKE '%completed_at = p_certified_payment_at%'
       OR v_handler_definition NOT LIKE '%v_intent.expected_currency%'
       OR v_handler_definition NOT LIKE '%processed_at = p_certified_payment_at%'
    THEN
        RAISE EXCEPTION 'P22 stopped: parent_pack webhook contract correction was not applied.';
    END IF;
END
$p22_fix_parent_pack_handler$;

COMMIT;
