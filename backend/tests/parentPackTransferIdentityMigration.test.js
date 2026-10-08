const fs = require('fs');
const path = require('path');
const assert = require('assert');

describe('P25-T.2a Transfer Identity Migration Contract', () => {
    let sqlContent;

    before(() => {
        const sqlPath = path.join(__dirname, '../scripts/migration_p25_t2a_parent_pack_transfer_identity.sql');
        sqlContent = fs.readFileSync(sqlPath, 'utf8');
    });

    it('should create the audit table securely', () => {
        assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.parent_student_identity_transfers'), 'Audit table is created');
        assert.ok(sqlContent.includes('ALTER TABLE public.parent_student_identity_transfers ENABLE ROW LEVEL SECURITY'), 'RLS is enabled');
        assert.ok(sqlContent.includes('REVOKE ALL ON public.parent_student_identity_transfers FROM PUBLIC'), 'PUBLIC access revoked');
        assert.ok(sqlContent.includes('REVOKE ALL ON public.parent_student_identity_transfers FROM anon'), 'anon access revoked');
        assert.ok(sqlContent.includes('REVOKE ALL ON public.parent_student_identity_transfers FROM authenticated'), 'authenticated access revoked');
        assert.ok(sqlContent.includes('GRANT ALL ON public.parent_student_identity_transfers TO service_role'), 'service_role access granted');
    });

    it('should not include PII columns in the audit table', () => {
        const tableDef = sqlContent.match(/CREATE TABLE.*?parent_student_identity_transfers.*?\(([\s\S]*?)\);/)[1];
        assert.ok(!tableDef.includes('nom '), 'Name column is not in audit table');
        assert.ok(!tableDef.includes('prenom '), 'First name column is not in audit table');
        assert.ok(!tableDef.includes('date_naissance '), 'DOB column is not in audit table');
        assert.ok(!tableDef.includes('telephone'), 'Phone column is not in audit table');
    });

    it('should create the RPC securely', () => {
        assert.ok(sqlContent.includes('CREATE OR REPLACE FUNCTION public.apply_parent_student_identity_transfer'), 'RPC is created');
        assert.ok(sqlContent.includes('SECURITY DEFINER'), 'RPC uses SECURITY DEFINER');
        
        assert.ok(sqlContent.includes('REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM PUBLIC'), 'PUBLIC RPC access revoked');
        assert.ok(sqlContent.includes('REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM anon'), 'anon RPC access revoked');
        assert.ok(sqlContent.includes('REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM authenticated'), 'authenticated RPC access revoked');
        
        assert.ok(sqlContent.includes('GRANT EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) TO service_role'), 'service_role RPC access granted');
    });

    it('should enforce identity ownership checks', () => {
        // global student existence check
        assert.ok(sqlContent.includes('SELECT EXISTS (\n        SELECT 1 FROM public.global_students WHERE student_global_id = p_student_global_id\n    )'), 'Checks global student existence');
        assert.ok(sqlContent.includes('TARGET_NOT_FOUND'), 'Returns TARGET_NOT_FOUND if missing');

        // parent_child_links existence check
        assert.ok(sqlContent.includes('SELECT EXISTS (\n        SELECT 1 FROM public.parent_child_links \n        WHERE parent_ref = p_parent_ref AND student_global_id = p_student_global_id\n    )'), 'Checks parent child link');
        assert.ok(sqlContent.includes('TARGET_NOT_OWNED'), 'Returns TARGET_NOT_OWNED if missing');
    });

    it('should validate parameters (NULL, empty, whitespace)', () => {
        assert.ok(sqlContent.includes('p_parent_ref IS NULL OR trim(p_parent_ref) = \'\''), 'Validates p_parent_ref');
        assert.ok(sqlContent.includes('p_student_global_id IS NULL'), 'Validates p_student_global_id');
        assert.ok(sqlContent.includes('p_destination_school_slug IS NULL OR trim(p_destination_school_slug) = \'\''), 'Validates p_destination_school_slug');
        assert.ok(sqlContent.includes('p_destination_student_local_id IS NULL OR trim(p_destination_student_local_id) = \'\''), 'Validates p_destination_student_local_id');
        assert.ok(sqlContent.includes('INVALID_PARAMETER'), 'Returns INVALID_PARAMETER on validation failure');
    });

    it('should handle concurrency safely using unique_violation re-read', () => {
        assert.ok(sqlContent.includes('EXCEPTION WHEN unique_violation THEN'), 'Catches unique_violation');
        assert.ok(sqlContent.includes('SELECT * INTO v_existing_mapping \n        FROM public.student_global_mappings \n        WHERE school_slug = p_destination_school_slug AND student_local_id = p_destination_student_local_id;'), 'Re-reads the winning mapping');
        assert.ok(sqlContent.includes('IF v_existing_mapping.student_global_id = p_student_global_id THEN'), 'Checks if winning mapping is same global ID');
        assert.ok(sqlContent.includes('\'status\', \'already_mapped\''), 'Returns already_mapped on same target race');
        assert.ok(sqlContent.includes('\'status\', \'error\', \'message\', \'MAPPING_CONFLICT\''), 'Returns MAPPING_CONFLICT on different target race');
        
        // Ensure success audit is only inserted after the BEGIN block of mapping creation.
        // It is outside the EXCEPTION block so it won't execute if EXCEPTION returns.
        const insertMappingIndex = sqlContent.indexOf('INSERT INTO public.student_global_mappings');
        const insertAuditIndex = sqlContent.indexOf('INSERT INTO public.parent_student_identity_transfers');
        assert.ok(insertAuditIndex > insertMappingIndex, 'Success audit is inserted after mapping creation');
    });

    it('should not modify core logic unexpectedly', () => {
        assert.ok(!sqlContent.includes('UPDATE public.parent_child_links'), 'Does not modify parent_child_links');
        assert.ok(!sqlContent.includes('INSERT INTO public.parent_child_links'), 'Does not create new parent_child_links');
        assert.ok(!sqlContent.includes('UPDATE public.parent_subscriptions'), 'Does not modify parent_subscriptions');
        assert.ok(!sqlContent.includes('UPDATE public.payment_intents'), 'Does not modify payment_intents');
        assert.ok(!sqlContent.includes('UPDATE public.parent_pack_pricing'), 'Does not modify parent_pack_pricing');
        assert.ok(!sqlContent.includes('UPDATE public.parent_subscription_periods'), 'Does not modify periods');
        assert.ok(!sqlContent.includes('students_'), 'Does not touch dynamic school tables');
    });
});
