// ============================================================
// USE PAGE SEO — Hook React pour la gestion dynamique et idempotente du SEO
// ============================================================

import { useEffect } from 'react';

export interface PageSeoOptions {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  noindex?: boolean;
  lang?: string;
  jsonLd?: Record<string, any>;
}

export const PRODUCTION_CANONICAL_ORIGIN = 'https://www.yziow.com';
export const BRAND_NAME = 'Yziow';

/**
 * Formate le titre du document de manière idempotente sans dupliquer la marque.
 */
export function formatDocumentTitle(title?: string): string {
  if (!title) {
    return 'Yziow - La plateforme moderne de gestion scolaire';
  }
  // Normaliser pour éliminer tout suffixe | YZIOW existant ou répété
  const cleanTitle = title.trim().replace(/(\s*\|\s*YZIOW\s*)+$/i, '').trim();

  // Si le titre nettoyé contient déjà Yziow (insensible à la casse), ne pas ajouter une seconde marque
  if (/yziow/i.test(cleanTitle)) {
    return cleanTitle;
  }
  return `${cleanTitle} | YZIOW`;
}

export function usePageSeo({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  noindex = false,
  jsonLd
}: PageSeoOptions) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const prevTitle = document.title;
    document.title = formatDocumentTitle(title);

    // Helper to set or create meta tag idempotently without duplicates
    const setMetaTag = (attrName: 'name' | 'property', attrValue: string, content: string | undefined) => {
      if (content === undefined || content === null) return;
      // Chercher à la fois par name et property pour éviter les doublons croisés (ex: twitter:url)
      const existing = document.querySelectorAll(`meta[name="${attrValue}"], meta[property="${attrValue}"]`);
      let element: HTMLMetaElement;
      if (existing.length > 0) {
        element = existing[0] as HTMLMetaElement;
        element.removeAttribute(attrName === 'name' ? 'property' : 'name');
        element.setAttribute(attrName, attrValue);
        for (let i = 1; i < existing.length; i++) {
          existing[i].remove();
        }
      } else {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // Helper to set or create link tag idempotently without duplicates
    const setLinkTag = (rel: string, href: string | undefined) => {
      if (!href) return;
      const existing = document.querySelectorAll(`link[rel="${rel}"]`);
      let element: HTMLLinkElement;
      if (existing.length > 0) {
        element = existing[0] as HTMLLinkElement;
        for (let i = 1; i < existing.length; i++) {
          existing[i].remove();
        }
      } else {
        element = document.createElement('link');
        element.rel = rel;
        document.head.appendChild(element);
      }
      element.href = href;
    };

    // Resolve route-specific canonical URL
    let resolvedCanonical: string | undefined;
    if (canonical) {
      if (canonical.startsWith('/')) {
        resolvedCanonical = `${PRODUCTION_CANONICAL_ORIGIN}${canonical}`;
      } else if (/^https?:\/\/(?:www\.)?yziow\.com/i.test(canonical)) {
        resolvedCanonical = canonical.replace(/^https?:\/\/(?:www\.)?yziow\.com/i, PRODUCTION_CANONICAL_ORIGIN);
      } else {
        resolvedCanonical = canonical;
      }
    } else if (typeof window !== 'undefined' && window.location) {
      const path = window.location.pathname === '/' ? '/' : window.location.pathname.replace(/\/+$/, '');
      resolvedCanonical = `${PRODUCTION_CANONICAL_ORIGIN}${path}`;
    }

    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
      setMetaTag('name', 'twitter:description', description);
    }

    // Always set og:site_name to Yziow idempotently
    setMetaTag('property', 'og:site_name', BRAND_NAME);

    setMetaTag('property', 'og:title', title);
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('property', 'og:type', ogType);

    if (resolvedCanonical) {
      setLinkTag('canonical', resolvedCanonical);
      setMetaTag('property', 'og:url', resolvedCanonical);
      setMetaTag('name', 'twitter:url', resolvedCanonical);
    }

    if (ogImage) {
      setMetaTag('property', 'og:image', ogImage);
      setMetaTag('name', 'twitter:image', ogImage);
    } else {
      // Remove any lingering og:image or twitter:image if no real image
      const ogImgEl = document.querySelector('meta[property="og:image"]');
      if (ogImgEl) ogImgEl.remove();
      const twImgEl = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
      if (twImgEl) twImgEl.remove();
    }

    if (noindex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
    }

    // Gestion JSON-LD idempotent et nettoyable
    const JSONLD_ID = 'yziow-page-jsonld';
    let scriptEl = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = JSONLD_ID;
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd, null, 2);
    } else if (scriptEl) {
      scriptEl.remove();
    }

    return () => {
      document.title = prevTitle;
      const scriptToRemove = document.getElementById(JSONLD_ID);
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [title, description, canonical, ogImage, ogType, noindex, jsonLd ? JSON.stringify(jsonLd) : '']);
}
