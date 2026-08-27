// ============================================================
// BLOG CATALOG UTILS — Fonctions utilitaires d'accès aux articles
// ============================================================

import type { BlogPost, PublicLanguage } from '../content/blog/posts.ts';
import { BLOG_POSTS, validateBlogPost } from '../content/blog/posts.ts';

export function getAllPosts(): BlogPost[] {
  return BLOG_POSTS;
}

export function getPublishedPosts(): BlogPost[] {
  return BLOG_POSTS
    .filter(p => p.status === 'published' && validateBlogPost(p))
    .sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
}

export function hasPublishedPosts(): boolean {
  return getPublishedPosts().length > 0;
}

export function getPostBySlug(slug: string, includeDrafts: boolean = false): BlogPost | undefined {
  if (!slug) return undefined;
  return BLOG_POSTS.find(p => {
    if (p.slug !== slug) return false;
    if (includeDrafts) return true;
    return p.status === 'published' && validateBlogPost(p);
  });
}

export function getPublishedPostsByLanguage(lang: PublicLanguage): BlogPost[] {
  return getPublishedPosts().filter(p => p.language === lang);
}

/**
 * Formate une date YYYY-MM-DD avec Intl.DateTimeFormat selon la locale de l'interface.
 */
export function formatLocalizedDate(dateString: string | null, locale: string = 'fr'): string {
  if (!dateString) return '';
  const parts = dateString.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return dateString;
  }
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return dateString;
  }
}

const LANGUAGE_NAMES: Record<PublicLanguage, Record<string, string>> = {
  fr: {
    fr: 'français',
    en: 'French',
    es: 'francés',
    ar: 'الفرنسية',
    it: 'francese',
    de: 'Französisch',
    pt: 'francês',
    zh: '法语',
    ru: 'французском'
  },
  en: {
    fr: 'anglais',
    en: 'English',
    es: 'inglés',
    ar: 'الإنجليزية',
    it: 'inglese',
    de: 'Englisch',
    pt: 'inglês',
    zh: '英语',
    ru: 'английском'
  },
  es: {
    fr: 'espagnol',
    en: 'Spanish',
    es: 'español',
    ar: 'الإسبانية',
    it: 'spagnolo',
    de: 'Spanisch',
    pt: 'espanhol',
    zh: '西班牙语',
    ru: 'испанском'
  },
  ar: {
    fr: 'arabe',
    en: 'Arabic',
    es: 'árabe',
    ar: 'العربية',
    it: 'arabo',
    de: 'Arabisch',
    pt: 'árabe',
    zh: '阿拉伯语',
    ru: 'арабском'
  },
  it: {
    fr: 'italien',
    en: 'Italian',
    es: 'italiano',
    ar: 'الإيطالية',
    it: 'italiano',
    de: 'Italienisch',
    pt: 'italiano',
    zh: '意大利语',
    ru: 'итальянском'
  },
  de: {
    fr: 'allemand',
    en: 'German',
    es: 'alemán',
    ar: 'الألمانية',
    it: 'tedesco',
    de: 'Deutsch',
    pt: 'alemão',
    zh: '德语',
    ru: 'немецком'
  },
  pt: {
    fr: 'portugais',
    en: 'Portuguese',
    es: 'portugués',
    ar: 'البرتغالية',
    it: 'portoghese',
    de: 'Portugiesisch',
    pt: 'português',
    zh: '葡萄牙语',
    ru: 'португальском'
  },
  zh: {
    fr: 'chinois',
    en: 'Chinese',
    es: 'chino',
    ar: 'الصينية',
    it: 'cinese',
    de: 'Chinesisch',
    pt: 'chinês',
    zh: '中文',
    ru: 'китайском'
  },
  ru: {
    fr: 'russe',
    en: 'Russian',
    es: 'ruso',
    ar: 'الروسية',
    it: 'russo',
    de: 'Russisch',
    pt: 'russo',
    zh: '俄语',
    ru: 'русском'
  }
};

/**
 * Message d'information discret quand la langue de l'article diffère de celle de l'interface.
 */
export function getLanguageAvailabilityNotice(interfaceLang: string, articleLang: PublicLanguage): string {
  const langNameInInterface = LANGUAGE_NAMES[articleLang]?.[interfaceLang] || articleLang;
  switch (interfaceLang) {
    case 'ar':
      return `هذا المقال متوفر باللغة ${langNameInInterface}`;
    case 'en':
      return `This article is available in ${langNameInInterface}`;
    case 'es':
      return `Este artículo está disponible en ${langNameInInterface}`;
    case 'it':
      return `Questo articolo è disponibile in ${langNameInInterface}`;
    case 'de':
      return `Dieser Artikel ist auf ${langNameInInterface} verfügbar`;
    case 'pt':
      return `Este artigo está disponível em ${langNameInInterface}`;
    case 'zh':
      return `本文提供${langNameInInterface}版本`;
    case 'ru':
      return `Эта статья доступна на ${langNameInInterface} языке`;
    case 'fr':
    default:
      return `Cet article est disponible en ${langNameInInterface}`;
  }
}
