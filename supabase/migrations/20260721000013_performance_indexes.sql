-- Migration : 20260721000013_performance_indexes.sql
-- Description : Index de performance pour RLS, jointures et requêtes courantes (Yziow & Billing)

-- 1. Index de facturation (Billing)
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_plan 
    ON public.saas_subscriptions(plan_id);

-- 2. Index de sécurité (RBAC Yziow)
CREATE INDEX IF NOT EXISTS idx_yziow_user_roles_role 
    ON public.yziow_user_roles(role_id);

-- 3. Index d'isolation RLS (Classes Yziow)
CREATE INDEX IF NOT EXISTS idx_yziow_classes_tenant 
    ON public.yziow_classes(tenant_id);

-- 4. Index composite pour RLS + Listing Élèves par Classe (Students Yziow)
CREATE INDEX IF NOT EXISTS idx_yziow_students_tenant_class 
    ON public.yziow_students(tenant_id, class_id);

-- 5. Index composites pour RLS + Consultation des Notes (Grades Yziow)
CREATE INDEX IF NOT EXISTS idx_yziow_grades_tenant_student 
    ON public.yziow_grades(tenant_id, student_id);

CREATE INDEX IF NOT EXISTS idx_yziow_grades_tenant_evaluator 
    ON public.yziow_grades(tenant_id, evaluator_id);

-- 6. Rétablissement des privilèges par défaut du schéma public (Yziow & SaaS)
-- Essentiel pour garantir que service_role, anon et authenticated disposent des droits d'accès
-- requis pour le RLS et le fonctionnement du backend.
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role, anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role, anon, authenticated;

