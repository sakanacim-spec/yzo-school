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
    document.title = title ? `${title} | YZIOW` : 'YZIOW - La plateforme moderne de gestion scolaire';

    // Helper to set or create meta tag
    const setMetaTag = (attrName: 'name' | 'property', attrValue: string, content: string | undefined) => {
      if (!content) return;
      let element = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // Helper to set or create link tag
    const setLinkTag = (rel: string, href: string | undefined) => {
      if (!href) return;
      let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!element) {
        element = document.createElement('link');
        element.rel = rel;
        document.head.appendChild(element);
      }
      element.href = href;
    };

    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
      setMetaTag('name', 'twitter:description', description);
    }

    setMetaTag('property', 'og:title', title);
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('property', 'og:type', ogType);

    if (canonical) {
      setLinkTag('canonical', canonical);
      setMetaTag('property', 'og:url', canonical);
    }

    if (ogImage) {
      setMetaTag('property', 'og:image', ogImage);
      setMetaTag('name', 'twitter:image', ogImage);
    } else {
      // Remove any lingering og:image or twitter:image if no real image
      const ogImgEl = document.querySelector('meta[property="og:image"]');
      if (ogImgEl) ogImgEl.remove();
      const twImgEl = document.querySelector('meta[name="twitter:image"]');
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
