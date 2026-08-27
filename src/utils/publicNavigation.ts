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
  | 'register'
  | 'blog'
  | 'blog-post';

export interface ContactExtra {
  subject?: string;
  message?: string;
}

export interface NavigationState {
  publicPage: PublicPage;
  contactExtra: ContactExtra | null;
  blogSlug: string | null;
}

/**
 * Fonction pure unique de parsing d'un pathname URL public.
 * Normalise les slashes finaux, décode sûrement les slugs et gère les cas malformés.
 */
export function parsePublicLocation(pathname: string): NavigationState {
  if (!pathname || typeof pathname !== 'string') {
    return {
      publicPage: 'landing',
      contactExtra: null,
      blogSlug: null
    };
  }

  const clean = pathname.replace(/\/+$/, '') || '/';

  if (clean === '/blog') {
    return {
      publicPage: 'blog',
      contactExtra: null,
      blogSlug: null
    };
  }

  if (clean.startsWith('/blog/')) {
    const rawSlug = clean.slice('/blog/'.length).trim();
    if (!rawSlug) {
      return {
        publicPage: 'blog',
        contactExtra: null,
        blogSlug: null
      };
    }
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(rawSlug).trim();
    } catch {
      decodedSlug = rawSlug.trim();
    }
    if (!decodedSlug) {
      return {
        publicPage: 'blog',
        contactExtra: null,
        blogSlug: null
      };
    }
    return {
      publicPage: 'blog-post',
      contactExtra: null,
      blogSlug: decodedSlug
    };
  }

  if (clean === '/about') {
    return { publicPage: 'about', contactExtra: null, blogSlug: null };
  }
  if (clean === '/contact') {
    return { publicPage: 'contact', contactExtra: null, blogSlug: null };
  }
  if (clean === '/careers') {
    return { publicPage: 'careers', contactExtra: null, blogSlug: null };
  }
  if (clean === '/guide') {
    return { publicPage: 'guide', contactExtra: null, blogSlug: null };
  }
  if (clean === '/register') {
    return { publicPage: 'register', contactExtra: null, blogSlug: null };
  }
  if (clean === '/login') {
    return { publicPage: 'login', contactExtra: null, blogSlug: null };
  }
  if (clean === '/cgu') {
    return { publicPage: 'cgu', contactExtra: null, blogSlug: null };
  }
  if (clean === '/privacy') {
    return { publicPage: 'privacy', contactExtra: null, blogSlug: null };
  }
  if (clean === '/legal') {
    return { publicPage: 'legal', contactExtra: null, blogSlug: null };
  }

  return {
    publicPage: 'landing',
    contactExtra: null,
    blogSlug: null
  };
}

export function createInitialNavigationState(pathname?: string): NavigationState {
  if (pathname) {
    return parsePublicLocation(pathname);
  }
  return {
    publicPage: 'landing',
    contactExtra: null,
    blogSlug: null
  };
}

export function handlePublicNavigate(
  target: PublicPage,
  extra?: ContactExtra
): NavigationState {
  return {
    publicPage: target,
    contactExtra: extra || null,
    blogSlug: null
  };
}

export function handleBlogNavigate(slug?: string): NavigationState {
  if (slug) {
    let cleanSlug = slug.trim();
    try {
      cleanSlug = decodeURIComponent(cleanSlug).trim();
    } catch {}
    if (cleanSlug) {
      return {
        publicPage: 'blog-post',
        contactExtra: null,
        blogSlug: cleanSlug
      };
    }
  }
  return {
    publicPage: 'blog',
    contactExtra: null,
    blogSlug: null
  };
}

export function handleRegisterSchool(): NavigationState {
  return {
    publicPage: 'register',
    contactExtra: null,
    blogSlug: null
  };
}

export function handleLoginNavigate(): NavigationState {
  return {
    publicPage: 'login',
    contactExtra: null,
    blogSlug: null
  };
}

export function handleBackToLanding(): NavigationState {
  return {
    publicPage: 'landing',
    contactExtra: null,
    blogSlug: null
  };
}
