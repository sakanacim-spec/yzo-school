BEGIN;

CREATE OR REPLACE FUNCTION public.get_active_parent_pack_subscriptions(
    p_parent_ref TEXT,
    p_student_global_ids UUID[]
)
RETURNS TABLE (student_global_id UUID)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT DISTINCT s.student_global_id
    FROM public.parent_subscriptions s
    JOIN public.parent_subscription_periods p ON s.id = p.subscription_id
    WHERE s.parent_ref = p_parent_ref
      AND s.student_global_id = ANY(p_student_global_ids)
      AND p.status = 'active'
      AND CURRENT_DATE BETWEEN p.start_date AND p.end_date;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_parent_pack_subscriptions(TEXT, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_parent_pack_subscriptions(TEXT, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_parent_pack_subscriptions(TEXT, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_parent_pack_subscriptions(TEXT, UUID[]) TO service_role;

COMMIT;
