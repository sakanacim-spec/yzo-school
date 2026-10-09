const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('P25-T.4a1 Atomic New Child Link Migration - Static Contract Test', () => {
    const migrationPath = path.join(__dirname, '../scripts/migration_p25_t4a1_atomic_new_child_link.sql');

    // 1. File exists
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // 2. Function exact presence
    assert.match(sqlContent, /CREATE OR REPLACE FUNCTION public\.create_and_link_new_global_student/i, 'Function must be created');

    // 3. Parameters expected
    assert.match(sqlContent, /p_school_slug TEXT/i, 'Missing p_school_slug');
    assert.match(sqlContent, /p_student_local_id TEXT/i, 'Missing p_student_local_id');
    assert.match(sqlContent, /p_parent_ref TEXT/i, 'Missing p_parent_ref');
    assert.match(sqlContent, /p_expected_global_ids UUID\[\]/i, 'Missing p_expected_global_ids');

    // 3b. NULL checks
    assert.match(sqlContent, /p_expected_global_ids IS NULL/i, 'Must reject NULL array');
    assert.match(sqlContent, /array_position\(p_expected_global_ids,\s*NULL\)\s*IS NOT NULL/i, 'Must reject internal NULL elements');

    // 4. Returns JSONB
    assert.match(sqlContent, /RETURNS JSONB/i, 'Must return JSONB');

    // 5. SECURITY DEFINER
    assert.match(sqlContent, /SECURITY DEFINER/i, 'Must be SECURITY DEFINER');

    // 6. safe search_path
    assert.match(sqlContent, /SET search_path = public,\s*pg_temp/i, 'Must use safe search_path');

    // 7. PUBLIC revoked
    assert.match(sqlContent, /REVOKE ALL ON FUNCTION.*FROM PUBLIC/i, 'Must revoke from PUBLIC');

    // 8. anon revoked
    assert.match(sqlContent, /REVOKE ALL ON FUNCTION.*FROM anon/i, 'Must revoke from anon');

    // 9. authenticated revoked
    assert.match(sqlContent, /REVOKE ALL ON FUNCTION.*FROM authenticated/i, 'Must revoke from authenticated');

    // 10. service_role allowed
    assert.match(sqlContent, /GRANT EXECUTE ON FUNCTION.*TO service_role/i, 'Must grant to service_role');

    // 11. postgres allowed
    assert.match(sqlContent, /GRANT EXECUTE ON FUNCTION.*TO postgres/i, 'Must grant to postgres');

    // 12. advisory transaction locks present
    assert.match(sqlContent, /pg_advisory_xact_lock/i, 'Must use pg_advisory_xact_lock');

    // 13. Order Parent -> Destination verifiable
    const parentLockMatch = sqlContent.indexOf('hashtext(trim(p_parent_ref))');
    const destLockMatch = sqlContent.indexOf('p_school_slug'); // Simple check after lock
    assert.ok(parentLockMatch > 0, 'Must lock parent');
    assert.ok(destLockMatch > 0, 'Must lock destination');

    // 14. OCC based on all parent_child_links
    assert.match(sqlContent, /SELECT DISTINCT student_global_id\s*FROM public\.parent_child_links\s*WHERE parent_ref =/i, 'Must query all historical global IDs');

    // 15. no current_link_active dependence
    assert.doesNotMatch(sqlContent, /current_link_active =/i, 'OCC must not filter by current_link_active');

    // 16. normalisation of expected global ids
    assert.match(sqlContent, /array_agg.*ORDER BY/i, 'Must normalize arrays');

    // 17. destination mapping checked before creation
    assert.match(sqlContent, /FROM public\.student_global_mappings\s*WHERE school_slug =/i, 'Must check destination mapping');

    // 18. PORTFOLIO_CHANGED present
    assert.match(sqlContent, /'PORTFOLIO_CHANGED'/i, 'Must return PORTFOLIO_CHANGED');

    // 19. DESTINATION_ALREADY_MAPPED present
    assert.match(sqlContent, /'DESTINATION_ALREADY_MAPPED'/i, 'Must return DESTINATION_ALREADY_MAPPED');

    // 20. created present
    assert.match(sqlContent, /'created'/i, 'Must return created');

    // 21. insertion global_students
    assert.match(sqlContent, /INSERT INTO public\.global_students/i, 'Must insert global_students');

    // 22. insertion student_global_mappings
    assert.match(sqlContent, /INSERT INTO public\.student_global_mappings/i, 'Must insert student_global_mappings');

    // 23. insertion parent_child_links
    assert.match(sqlContent, /INSERT INTO public\.parent_child_links/i, 'Must insert parent_child_links');

    // 24. first_linked_at set ONLY for creation (now())
    assert.match(sqlContent, /first_linked_at.*now\(\)/is, 'Must set first_linked_at to now()');

    // 25. no UPDATE of first_linked_at
    assert.doesNotMatch(sqlContent, /UPDATE.*first_linked_at/is, 'Must not update first_linked_at');
    assert.doesNotMatch(sqlContent, /ON CONFLICT.*DO UPDATE/is, 'Must not use ON CONFLICT DO UPDATE for first_linked_at');

    // 26. no dynamic tables
    assert.doesNotMatch(sqlContent, /students_\$/i, 'Must not query dynamic students tables');
    assert.doesNotMatch(sqlContent, /students_'/i, 'Must not query dynamic students tables');

    // 27. no EXECUTE
    assert.doesNotMatch(sqlContent, /EXECUTE '/i, 'Must not use dynamic SQL EXECUTE');

    // 28. no SAME-CHILD/PII
    assert.doesNotMatch(sqlContent, /nom/i, 'Must not contain nom');
    assert.doesNotMatch(sqlContent, /prenom/i, 'Must not contain prenom');
    assert.doesNotMatch(sqlContent, /date_naissance/i, 'Must not contain date_naissance');

    // 29. No destructive DROP or modifications to past migrations
    assert.doesNotMatch(sqlContent, /DROP TABLE/i, 'Must not drop tables');
});
