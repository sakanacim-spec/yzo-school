-- ==============================================================================================
-- MIGRATION: YZIOW DOMAIN TABLES (Itération 3)
-- Description: Création des tables métiers dédiées à l'application scolaire Yziow.
-- Le moteur Oziow reste générique (RBAC système), Yziow structure ici ses permissions métiers
-- et ses entités (Classes, Élèves, Notes) avec héritage de l'isolation multi-tenant (RLS).
-- ==============================================================================================

-- 1. YZIOW ROLES (Rôles Métiers et Permissions structurées)
CREATE TABLE public.yziow_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,            -- Nom affiché (ex: "Censeur", "Proviseur")
    code VARCHAR(50) NOT NULL,             -- Identifiant technique (ex: "censeur_1")
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb, -- ex: {"manage_students": true}
    is_system_role BOOLEAN DEFAULT false,  -- Protège les rôles vitaux de la suppression
    created_by UUID REFERENCES public.saas_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 2. YZIOW USER ROLES (Fonctions multiples pour un utilisateur)
CREATE TABLE public.yziow_user_roles (
    user_id UUID NOT NULL REFERENCES public.saas_profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.yziow_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 3. YZIOW CLASSES (Entité métier)
CREATE TABLE public.yziow_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Ex: "Terminale S"
    academic_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. YZIOW STUDENTS (Association d'un utilisateur à une classe en tant qu'élève)
CREATE TABLE public.yziow_students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.saas_profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.yziow_classes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, class_id)
);

-- 5. YZIOW GRADES (Notes)
CREATE TABLE public.yziow_grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.yziow_students(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES public.saas_profiles(id), -- L'enseignant
    subject VARCHAR(100) NOT NULL, -- Ex: "Mathématiques"
    grade NUMERIC(5,2) NOT NULL,
    max_grade NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================================
-- SECURITÉ (RLS) & ISOLATION MULTI-TENANT
-- Oziow permet à Yziow de bénéficier de l'isolation par défaut en utilisant (auth.jwt()->>'tenant_id')
-- ==============================================================================================

ALTER TABLE public.yziow_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yziow_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yziow_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yziow_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yziow_grades ENABLE ROW LEVEL SECURITY;

-- Politiques pour YZIOW ROLES
CREATE POLICY "tenant_isolation_yziow_roles_select" ON public.yziow_roles
FOR SELECT USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_yziow_roles_all" ON public.yziow_roles
FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

-- Politiques pour YZIOW USER ROLES
-- La sécurité est dérivée du rôle lui-même
CREATE POLICY "tenant_isolation_yziow_user_roles_select" ON public.yziow_user_roles
FOR SELECT USING (
    role_id IN (SELECT id FROM public.yziow_roles WHERE tenant_id = (auth.jwt()->>'tenant_id')::uuid)
);
CREATE POLICY "tenant_isolation_yziow_user_roles_all" ON public.yziow_user_roles
FOR ALL USING (
    role_id IN (SELECT id FROM public.yziow_roles WHERE tenant_id = (auth.jwt()->>'tenant_id')::uuid)
);

-- Politiques pour YZIOW CLASSES
CREATE POLICY "tenant_isolation_yziow_classes_select" ON public.yziow_classes
FOR SELECT USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_yziow_classes_all" ON public.yziow_classes
FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

-- Politiques pour YZIOW STUDENTS
CREATE POLICY "tenant_isolation_yziow_students_select" ON public.yziow_students
FOR SELECT USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_yziow_students_all" ON public.yziow_students
FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

-- Politiques pour YZIOW GRADES
CREATE POLICY "tenant_isolation_yziow_grades_select" ON public.yziow_grades
FOR SELECT USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_yziow_grades_all" ON public.yziow_grades
FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
