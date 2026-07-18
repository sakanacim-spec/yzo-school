import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@oziow/ui';

type YziowRole = {
  id: string;
  name: string;
  code: string;
  permissions: Record<string, boolean>;
};

type YziowConfig = {
  terminology: {
    teacher: string;
    student: string;
    classroom: string;
  };
  grading_system: {
    type: string;
    passing_score: number;
  };
};

type YziowContextType = {
  roles: YziowRole[];
  userRoles: YziowRole[];
  config: YziowConfig;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
};

const DEFAULT_CONFIG: YziowConfig = {
  terminology: { teacher: "Enseignant", student: "Élève", classroom: "Classe" },
  grading_system: { type: "out_of_20", passing_score: 10 }
};

const YziowContext = createContext<YziowContextType>({
  roles: [],
  userRoles: [],
  config: DEFAULT_CONFIG,
  isLoading: true,
  hasPermission: () => false,
});

export const useYziow = () => useContext(YziowContext);

export const YziowProvider = ({ children }: { children: React.ReactNode }) => {
  const { supabase, user } = useAuth();
  const [roles, setRoles] = useState<YziowRole[]>([]);
  const [userRoles, setUserRoles] = useState<YziowRole[]>([]);
  const [config] = useState<YziowConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) {
      setIsLoading(false);
      return;
    }

    const fetchYziowData = async () => {
      try {
        // 1. Récupérer la config du tenant Oziow (via RPC ou en lisant saas_tenants si on a les droits)
        // Pour le MVP: On garde la config par défaut ou on fait une requête API vers Oziow
        // const { data: tenant } = await supabase.from('saas_tenants').select('settings').single();
        // if (tenant?.settings?.yziow_config) setConfig(tenant.settings.yziow_config);

        // 2. Récupérer les rôles structurés du domaine Yziow
        const { data: allRoles } = await supabase.from('yziow_roles').select('*');
        if (allRoles) setRoles(allRoles);

        // 3. Récupérer les rôles de l'utilisateur courant
        const { data: userRoleLinks } = await supabase
          .from('yziow_user_roles')
          .select('role_id')
          .eq('user_id', user.id);
        
        if (userRoleLinks && allRoles) {
          const userRoleIds = userRoleLinks.map(link => link.role_id);
          const currentUserRoles = allRoles.filter(r => userRoleIds.includes(r.id));
          setUserRoles(currentUserRoles);
        }
      } catch (err) {
        console.error("Error fetching Yziow domain data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchYziowData();
  }, [supabase, user]);

  const hasPermission = (permission: string) => {
    return userRoles.some(role => role.permissions && role.permissions[permission] === true);
  };

  return (
    <YziowContext.Provider value={{ roles, userRoles, config, isLoading, hasPermission }}>
      {children}
    </YziowContext.Provider>
  );
};
