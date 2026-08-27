// ============================================================
// LOGIQUE DE NAVIGATION PUBLIQUE PARTAGÉE
// ============================================================

export type PublicPage =
  | 'landing'
  | 'about'
  | 'contact'
  | 'login'
  | 'cgu'
  | 'privacy'
  | 'legal'
  | 'careers'
  | 'guide'
  | 'register';

export interface ContactExtra {
  subject?: string;
  message?: string;
}

export interface NavigationState {
  publicPage: PublicPage;
  contactExtra: ContactExtra | null;
}

export function createInitialNavigationState(): NavigationState {
  return {
    publicPage: 'landing',
    contactExtra: null
  };
}

export function handlePublicNavigate(
  target: PublicPage,
  extra?: ContactExtra
): NavigationState {
  return {
    publicPage: target,
    contactExtra: extra || null
  };
}

export function handleRegisterSchool(): NavigationState {
  return {
    publicPage: 'register',
    contactExtra: null
  };
}

export function handleLoginNavigate(): NavigationState {
  return {
    publicPage: 'login',
    contactExtra: null
  };
}

export function handleBackToLanding(): NavigationState {
  return {
    publicPage: 'landing',
    contactExtra: null
  };
}
