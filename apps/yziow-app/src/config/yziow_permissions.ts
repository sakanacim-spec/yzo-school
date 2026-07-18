export type PermissionDef = {
  id: string;
  label: string;
  category: string;
};

export const YZIOW_PERMISSIONS: Record<string, PermissionDef> = {
  manage_school_settings: {
    id: "manage_school_settings",
    label: "Paramétrer l'établissement",
    category: "Administration"
  },
  manage_roles: {
    id: "manage_roles",
    label: "Gérer les rôles et permissions",
    category: "Administration"
  },
  manage_students: {
    id: "manage_students",
    label: "Gérer les élèves",
    category: "Scolarité"
  },
  manage_teachers: {
    id: "manage_teachers",
    label: "Gérer les enseignants",
    category: "Ressources Humaines"
  },
  view_grades: {
    id: "view_grades",
    label: "Consulter toutes les notes",
    category: "Évaluation"
  },
  view_own_grades: {
    id: "view_own_grades",
    label: "Consulter ses notes",
    category: "Évaluation"
  },
  grade_students: {
    id: "grade_students",
    label: "Saisir des notes",
    category: "Évaluation"
  },
  validate_reports: {
    id: "validate_reports",
    label: "Valider les bulletins",
    category: "Évaluation"
  },
  manage_schedule: {
    id: "manage_schedule",
    label: "Gérer les emplois du temps",
    category: "Organisation"
  }
};

// Regrouper par catégorie pour l'UI du Role Builder
export const getPermissionsByCategory = () => {
  const grouped: Record<string, PermissionDef[]> = {};
  Object.values(YZIOW_PERMISSIONS).forEach((perm) => {
    if (!grouped[perm.category]) {
      grouped[perm.category] = [];
    }
    grouped[perm.category].push(perm);
  });
  return grouped;
};
