// ============================================================
// TESTS LOT 2 — BLOG PUBLIC YZIOW (node:test)
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { BlogPost } from '../content/blog/posts.ts';
import {
  SUPPORTED_PUBLIC_LANGUAGES,
  validateBlogPost,
  calculateReadingTimeMinutes,
  BLOG_POSTS
} from '../content/blog/posts.ts';

import {
  getAllPosts,
  getPublishedPosts,
  hasPublishedPosts,
  getPostBySlug,
  getPublishedPostsByLanguage,
  formatLocalizedDate,
  getLanguageAvailabilityNotice
} from '../utils/blogCatalog.ts';

import {
  parsePublicLocation,
  createInitialNavigationState,
  handlePublicNavigate,
  handleBlogNavigate,
  handleBackToLanding
} from '../utils/publicNavigation.ts';

import { PUBLIC_I18N, getPublicTranslations } from '../i18n/publicI18n.ts';

test('1. SUPPORTED_PUBLIC_LANGUAGES contient exactement les 9 langues du dépôt', () => {
  assert.equal(SUPPORTED_PUBLIC_LANGUAGES.length, 9);
  const expectedLanguages = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
  for (const lang of expectedLanguages) {
    assert.ok(
      SUPPORTED_PUBLIC_LANGUAGES.includes(lang as any),
      `La langue ${lang} doit être dans SUPPORTED_PUBLIC_LANGUAGES`
    );
  }
});

test('2. validateBlogPost valide rigoureusement les articles', () => {
  const validDraft: BlogPost = {
    slug: 'comment-preparer-la-gestion-numerique-de-son-etablissement',
    title: 'Comment préparer la gestion numérique de son établissement scolaire ?',
    excerpt: 'Des repères pratiques pour analyser l’organisation d’un établissement.',
    content: 'La mise en place d’outils numériques dans un établissement scolaire demande une préparation...',
    category: 'Organisation & Méthode',
    readingTimeMinutes: 2,
    author: 'Équipe YZIOW',
    language: 'fr',
    status: 'draft',
    publishedAt: null
  };

  assert.equal(validateBlogPost(validDraft), true);

  const validPublished: BlogPost = {
    ...validDraft,
    status: 'published',
    publishedAt: '2026-08-27'
  };
  assert.equal(validateBlogPost(validPublished), true);

  // Invalide: published sans publishedAt
  const invalidPublished: BlogPost = {
    ...validDraft,
    status: 'published',
    publishedAt: null
  };
  assert.equal(validateBlogPost(invalidPublished), false);

  // Invalide: langue inconnue
  const invalidLang = {
    ...validDraft,
    language: 'xx' as any
  };
  assert.equal(validateBlogPost(invalidLang), false);

  // Invalide: temps de lecture <= 0
  const invalidReadTime = {
    ...validDraft,
    readingTimeMinutes: 0
  };
  assert.equal(validateBlogPost(invalidReadTime), false);

  // Invalide: slug vide
  const invalidSlug = {
    ...validDraft,
    slug: ''
  };
  assert.equal(validateBlogPost(invalidSlug), false);

  // Invalide: title vide
  const invalidTitle = {
    ...validDraft,
    title: '   '
  };
  assert.equal(validateBlogPost(invalidTitle), false);
});

test('3. Calcul honnête du temps de lecture (calculateReadingTimeMinutes)', () => {
  assert.equal(calculateReadingTimeMinutes(''), 1);
  assert.equal(calculateReadingTimeMinutes('   '), 1);
  assert.equal(calculateReadingTimeMinutes(null as any), 1);

  const text100 = new Array(100).fill('mot').join(' ');
  assert.equal(calculateReadingTimeMinutes(text100), 1);

  const text250 = new Array(250).fill('mot').join(' ');
  assert.equal(calculateReadingTimeMinutes(text250), 2);

  const text450 = new Array(450).fill('mot').join(' ');
  assert.equal(calculateReadingTimeMinutes(text450), 3);

  const post = BLOG_POSTS[0];
  assert.ok(post.readingTimeMinutes >= 1);
  assert.equal(post.readingTimeMinutes, calculateReadingTimeMinutes(post.content));
});

test('4. parsePublicLocation : parsing pur et sécurisé des URLs publiques', () => {
  assert.deepEqual(parsePublicLocation('/'), { publicPage: 'landing', contactExtra: null, blogSlug: null });
  assert.deepEqual(parsePublicLocation(''), { publicPage: 'landing', contactExtra: null, blogSlug: null });

  assert.deepEqual(parsePublicLocation('/blog'), { publicPage: 'blog', contactExtra: null, blogSlug: null });
  assert.deepEqual(parsePublicLocation('/blog/'), { publicPage: 'blog', contactExtra: null, blogSlug: null });
  assert.deepEqual(parsePublicLocation('/blog///'), { publicPage: 'blog', contactExtra: null, blogSlug: null });

  const postSlug = 'comment-preparer-la-gestion-numerique-de-son-etablissement';
  assert.deepEqual(parsePublicLocation(`/blog/${postSlug}`), {
    publicPage: 'blog-post',
    contactExtra: null,
    blogSlug: postSlug
  });
  assert.deepEqual(parsePublicLocation(`/blog/${postSlug}/`), {
    publicPage: 'blog-post',
    contactExtra: null,
    blogSlug: postSlug
  });

  const encodedSlug = encodeURIComponent('comment-preparer-la-gestion-numerique-de-son-etablissement');
  assert.deepEqual(parsePublicLocation(`/blog/${encodedSlug}`), {
    publicPage: 'blog-post',
    contactExtra: null,
    blogSlug: 'comment-preparer-la-gestion-numerique-de-son-etablissement'
  });

  const malformed = '/blog/%E0%A4%A';
  const parsedMalformed = parsePublicLocation(malformed);
  assert.equal(parsedMalformed.publicPage, 'blog-post');
  assert.ok(parsedMalformed.blogSlug);

  assert.deepEqual(parsePublicLocation('/blog/   '), {
    publicPage: 'blog',
    contactExtra: null,
    blogSlug: null
  });

  assert.equal(parsePublicLocation('/guide').publicPage, 'guide');
  assert.equal(parsePublicLocation('/about').publicPage, 'about');
  assert.equal(parsePublicLocation('/contact').publicPage, 'contact');
  assert.equal(parsePublicLocation('/careers').publicPage, 'careers');
  assert.equal(parsePublicLocation('/register').publicPage, 'register');
  assert.equal(parsePublicLocation('/login').publicPage, 'login');
  assert.equal(parsePublicLocation('/cgu').publicPage, 'cgu');
  assert.equal(parsePublicLocation('/privacy').publicPage, 'privacy');
  assert.equal(parsePublicLocation('/legal').publicPage, 'legal');
});

test('5. Catalogue Blog : publication effective du premier article', () => {
  const all = getAllPosts();
  assert.ok(Array.isArray(all));
  assert.equal(all.length, 1);

  for (const post of all) {
    assert.ok(
      validateBlogPost(post),
      `L'article ${post.slug} doit être valide selon validateBlogPost`
    );
  }

  const firstPost = all[0];
  assert.equal(firstPost.status, 'published');
  assert.equal(firstPost.publishedAt, '2026-08-27');
  assert.equal(firstPost.language, 'fr');
  assert.equal(firstPost.slug, 'comment-preparer-la-gestion-numerique-de-son-etablissement');

  const published = getPublishedPosts();
  assert.ok(Array.isArray(published));
  assert.equal(published.length, 1);
  assert.equal(hasPublishedPosts(), true);

  const foundPost = getPostBySlug(firstPost.slug, false);
  assert.ok(foundPost);
  assert.equal(foundPost?.slug, firstPost.slug);
  assert.equal(foundPost?.category, 'Organisation & Méthode');

  const frPublished = getPublishedPostsByLanguage('fr');
  assert.equal(frPublished.length, 1);
  assert.equal(frPublished[0].slug, firstPost.slug);
});

test('6. Localisation des dates avec Intl.DateTimeFormat (formatLocalizedDate)', () => {
  const rawDate = '2026-08-27';

  const dateFr = formatLocalizedDate(rawDate, 'fr');
  assert.match(dateFr, /27\s+ao[uû]t\s+2026/i);

  const dateEn = formatLocalizedDate(rawDate, 'en');
  assert.equal(dateEn, 'August 27, 2026');

  const dateEs = formatLocalizedDate(rawDate, 'es');
  assert.match(dateEs, /27.*agosto.*2026/i);

  const dateDe = formatLocalizedDate(rawDate, 'de');
  assert.match(dateDe, /27\.\s+August\s+2026/i);

  const dateAr = formatLocalizedDate(rawDate, 'ar');
  assert.ok(dateAr.length > 0);
  assert.match(dateAr, /أغسطس/);

  assert.equal(formatLocalizedDate(null, 'fr'), '');
  assert.equal(formatLocalizedDate('', 'fr'), '');
  assert.equal(formatLocalizedDate('date-invalide', 'fr'), 'date-invalide');
});

test('7. Indication de langue disponible quand l’interface diffère de l’article', () => {
  const noticeFr = getLanguageAvailabilityNotice('fr', 'fr');
  assert.equal(noticeFr, 'Cet article est disponible en français');

  const noticeAr = getLanguageAvailabilityNotice('ar', 'fr');
  assert.equal(noticeAr, 'هذا المقال متوفر باللغة الفرنسية');

  const noticeEn = getLanguageAvailabilityNotice('en', 'fr');
  assert.equal(noticeEn, 'This article is available in French');

  const noticeEs = getLanguageAvailabilityNotice('es', 'fr');
  assert.equal(noticeEs, 'Este artículo está disponible en francés');

  const noticeDe = getLanguageAvailabilityNotice('de', 'fr');
  assert.equal(noticeDe, 'Dieser Artikel ist auf Französisch verfügbar');

  const noticeZh = getLanguageAvailabilityNotice('zh', 'fr');
  assert.equal(noticeZh, '本文提供法语版本');

  const noticeRu = getLanguageAvailabilityNotice('ru', 'fr');
  assert.equal(noticeRu, 'Эта статья доступна на французском языке');
});

test('8. Préservation de la langue et direction de l’article dans BlogPost.tsx', () => {
  const postFilePath = path.resolve('src/pages/public/BlogPost.tsx');
  const postContent = fs.readFileSync(postFilePath, 'utf-8');

  assert.ok(
    postContent.includes('lang={post.language}'),
    'BlogPost.tsx doit définir lang={post.language} sur la balise article'
  );
  assert.ok(
    postContent.includes("dir={post.language === 'ar' ? 'rtl' : 'ltr'}"),
    'BlogPost.tsx doit définir dir selon post.language (ltr pour le français)'
  );

  assert.ok(
    postContent.includes('language !== post.language'),
    'BlogPost.tsx doit vérifier si language !== post.language'
  );
});

test('9. Validation SEO et structure JSON-LD Article sans image inventée', () => {
  const post = BLOG_POSTS[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    author: {
      '@type': 'Organization',
      name: post.author
    },
    datePublished: post.publishedAt,
    inLanguage: post.language,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.yziow.com/blog/${post.slug}`
    }
  };

  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.equal(jsonLd['@type'], 'Article');
  assert.equal(jsonLd.headline, post.title);
  assert.equal(jsonLd.description, post.excerpt);
  assert.equal(jsonLd.author.name, 'Équipe YZIOW');
  assert.equal(jsonLd.datePublished, '2026-08-27');
  assert.equal(jsonLd.inLanguage, 'fr');
  assert.equal(jsonLd.mainEntityOfPage['@id'], `https://www.yziow.com/blog/${post.slug}`);

  assert.equal((jsonLd as any).image, undefined, 'Le champ image JSON-LD doit être absent si pas de coverImage');
  assert.equal(post.coverImage, undefined, 'post.coverImage ne doit pas contenir d image inventée');

  const postFilePath = path.resolve('src/pages/public/BlogPost.tsx');
  const postContent = fs.readFileSync(postFilePath, 'utf-8');
  assert.equal(
    postContent.includes('ogImage: "http'),
    false,
    'BlogPost.tsx ne doit pas inclure d image ogImage en dur ou fictive'
  );
});

test('10. Présence du sélecteur 9 langues et structure de mise en page réactive dans Blog & BlogPost', () => {
  const blogContent = fs.readFileSync(path.resolve('src/pages/public/Blog.tsx'), 'utf-8');
  const postContent = fs.readFileSync(path.resolve('src/pages/public/BlogPost.tsx'), 'utf-8');

  // Sélecteur de langue présent dans les 2 en-têtes
  assert.ok(blogContent.includes('setLanguage'), 'Blog.tsx doit inclure setLanguage');
  assert.ok(postContent.includes('setLanguage'), 'BlogPost.tsx doit inclure setLanguage');
  assert.ok(blogContent.includes('flagUrl'), 'Blog.tsx doit afficher les drapeaux du sélecteur de langue');
  assert.ok(postContent.includes('flagUrl'), 'BlogPost.tsx doit afficher les drapeaux du sélecteur de langue');

  // Centrage de la carte quand 1 seul article est publié
  assert.ok(
    blogContent.includes('max-w-2xl mx-auto') && blogContent.includes('posts.length === 1'),
    'Blog.tsx doit centrer la carte avec max-w-2xl mx-auto quand 1 seul article est publié'
  );

  // Pied de page cohérent présent dans Blog et BlogPost
  assert.ok(blogContent.includes('<footer'), 'Blog.tsx doit contenir un footer structuré');
  assert.ok(postContent.includes('<footer'), 'BlogPost.tsx doit contenir un footer structuré');
  assert.ok(blogContent.includes('t.footer.guide'), 'Blog.tsx doit proposer un retour vers le Guide');
  assert.ok(postContent.includes('t.footer.guide'), 'BlogPost.tsx doit proposer un retour vers le Guide');
});

test('11. Contrôle d’absence totale de liens et icônes sociaux dans les composants Blog', () => {
  const blogFilePath = path.resolve('src/pages/public/Blog.tsx');
  const postFilePath = path.resolve('src/pages/public/BlogPost.tsx');

  const blogContent = fs.readFileSync(blogFilePath, 'utf-8');
  const postContent = fs.readFileSync(postFilePath, 'utf-8');

  const socialTerms = [
    'facebook',
    'twitter',
    'instagram',
    'linkedin',
    'youtube',
    'tiktok',
    'whatsapp',
    'telegram'
  ];

  for (const term of socialTerms) {
    assert.equal(
      blogContent.toLowerCase().includes(`https://${term}`),
      false,
      `Blog.tsx ne doit pas contenir de lien vers ${term}`
    );
    assert.equal(
      postContent.toLowerCase().includes(`https://${term}`),
      false,
      `BlogPost.tsx ne doit pas contenir de lien vers ${term}`
    );
  }
});

test('12. Traductions complètes du blog pour les 9 langues', () => {
  const requiredBlogKeys = [
    'title',
    'subtitle',
    'badge',
    'emptyTitle',
    'emptyDesc',
    'backHome',
    'backBlog',
    'notFoundTitle',
    'notFoundDesc',
    'readTime',
    'readMore',
    'publishedOn',
    'authorBy',
    'category'
  ];

  for (const lang of SUPPORTED_PUBLIC_LANGUAGES) {
    const t = getPublicTranslations(lang);
    assert.ok(t, `Traductions existantes pour ${lang}`);
    assert.ok(t.footer.blog, `footer.blog présent pour ${lang}`);
    assert.ok(t.blog, `Section blog présente pour ${lang}`);

    for (const key of requiredBlogKeys) {
      assert.ok(
        (t.blog as any)[key],
        `La clé t.blog.${key} doit être définie pour ${lang}`
      );
      assert.equal(
        typeof (t.blog as any)[key],
        'string',
        `La clé t.blog.${key} doit être une string pour ${lang}`
      );
    }
  }
});
