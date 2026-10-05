-- Migration P23: Corrige le chemin Pack Parent sans ambassadeur actif
--
-- Prérequis : P21 et P22 déjà appliquées.
-- Cette correction ne touche ni le répartiteur v2, ni P18, ni les autres
-- types de paiement. Elle rend le rowtype de l'ambassadeur nul-safe lorsque
-- l'établissement n'a aucun ambassadeur actif.

BEGIN;

DO $p23_fix_parent_pack_no_affiliate$
DECLARE
    v_handler_oid oid;
    v_handler_definition text;
BEGIN
    SELECT to_regprocedure(
        'public.process_parent_pack_webhook_event(character varying,character varying,character varying,uuid,text,numeric,text,text,timestamp with time zone,numeric,numeric,boolean)'
    )::oid
    INTO v_handler_oid;

    IF v_handler_oid IS NULL THEN
        RAISE EXCEPTION 'P23 stopped: P21 parent_pack webhook handler is required first.';
    END IF;

    SELECT pg_get_functiondef(v_handler_oid)
    INTO v_handler_definition;

    -- Fail closed: ne modifier que le handler Pack Parent de P21/P22.
    IF v_handler_definition NOT LIKE '%v_has_active_affiliate BOOLEAN := false%'
       OR v_handler_definition NOT LIKE '%public.school_commission_ledger%'
       OR v_handler_definition NOT LIKE '%PARENT_PACK_%' THEN
        RAISE EXCEPTION 'P23 stopped: unexpected parent_pack webhook handler definition.';
    END IF;

    -- Un RECORD non assigné ne permet pas d'accéder à .id, même dans une
    -- branche CASE non prise. Un %ROWTYPE garde un id NULL et permet le
    -- chemin sans ambassadeur actif (0 % ambassadeur, solde YZIOW).
    v_handler_definition := replace(
        v_handler_definition,
        'v_affiliate RECORD;',
        'v_affiliate public.affiliates%ROWTYPE;'
    );

    IF v_handler_definition NOT LIKE '%v_affiliate public.affiliates%ROWTYPE;%' THEN
        RAISE EXCEPTION 'P23 stopped: expected affiliate record declaration was not found.';
    END IF;

    EXECUTE v_handler_definition;

    SELECT pg_get_functiondef(v_handler_oid)
    INTO v_handler_definition;

    IF v_handler_definition LIKE '%v_affiliate RECORD;%'
       OR v_handler_definition NOT LIKE '%v_affiliate public.affiliates%ROWTYPE;%' THEN
        RAISE EXCEPTION 'P23 stopped: no-affiliate correction was not applied.';
    END IF;
END
$p23_fix_parent_pack_no_affiliate$;

COMMIT;
