// ============================================================
// BLOG POSTS — Catalogue typé et validé pour le Blog Public YZIOW
// ============================================================

export const SUPPORTED_PUBLIC_LANGUAGES = [
  'fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'
] as const;

export type PublicLanguage = typeof SUPPORTED_PUBLIC_LANGUAGES[number];

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readingTimeMinutes: number;
  author: string;
  language: PublicLanguage;
  status: 'draft' | 'published';
  publishedAt: string | null;
  tags?: string[];
  coverImage?: string;
}

export function calculateReadingTimeMinutes(text: string, wordsPerMinute: number = 200): number {
  if (!text || typeof text !== 'string') return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 1;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

export function validateBlogPost(post: BlogPost): boolean {
  if (!post || typeof post !== 'object') return false;
  if (!post.slug || typeof post.slug !== 'string' || post.slug.trim() === '') return false;
  if (!post.title || typeof post.title !== 'string' || post.title.trim() === '') return false;
  if (!post.excerpt || typeof post.excerpt !== 'string' || post.excerpt.trim() === '') return false;
  if (!post.content || typeof post.content !== 'string' || post.content.trim() === '') return false;
  if (!post.category || typeof post.category !== 'string' || post.category.trim() === '') return false;
  if (!post.author || typeof post.author !== 'string' || post.author.trim() === '') return false;
  if (typeof post.readingTimeMinutes !== 'number' || post.readingTimeMinutes <= 0) return false;
  if (!SUPPORTED_PUBLIC_LANGUAGES.includes(post.language)) return false;
  if (post.status !== 'draft' && post.status !== 'published') return false;
  if (post.status === 'published' && (!post.publishedAt || typeof post.publishedAt !== 'string' || post.publishedAt.trim() === '')) return false;
  return true;
}

const ARTICLE_CONTENT_1 = `La mise en place d’outils numériques dans un établissement scolaire demande une préparation adaptée à son organisation, à ses ressources et aux besoins de ses utilisateurs. Avant de choisir une solution, il est utile d’examiner les pratiques existantes et de définir des objectifs précis.

1. Examiner l’organisation actuelle
L’établissement peut commencer par recenser les méthodes utilisées pour les inscriptions, les dossiers des élèves, les notes, les présences, les paiements et la communication avec les familles.
Cette analyse permet d’identifier les informations dispersées, les doubles saisies et les étapes qui nécessitent une meilleure organisation.

2. Définir les besoins prioritaires
Tous les modules ne doivent pas nécessairement être déployés simultanément. L’établissement peut déterminer ses priorités selon ses difficultés actuelles : gestion administrative, suivi pédagogique, présences, facturation ou communication avec les parents.
Une mise en place progressive facilite l’apprentissage des nouveaux outils et permet d’adapter les procédures internes.

3. Préparer les utilisateurs
Les directeurs, le personnel administratif, les enseignants et les parents n’utilisent pas la plateforme de la même manière. Il convient donc de définir les responsabilités de chaque profil, d’organiser la formation des utilisateurs et de prévoir un accompagnement pendant la phase de démarrage.

4. Vérifier la qualité des données
Avant toute importation, les listes d’élèves, de classes, de responsables et de contacts doivent être vérifiées. Des données exactes et organisées facilitent la configuration initiale et limitent les corrections ultérieures.

5. Prévoir la sécurité et les règles d’accès
L’établissement doit déterminer quelles personnes peuvent consulter ou modifier chaque catégorie d’information. Il doit également tenir compte de ses obligations locales concernant la protection des données personnelles et la conservation des documents.

6. Évaluer progressivement les résultats
Après la mise en place, l’établissement peut recueillir les observations des utilisateurs, identifier les difficultés et ajuster ses méthodes. Cette évaluation progressive permet de faire évoluer l’utilisation de la plateforme selon les besoins constatés.

Conclusion
La gestion numérique d’un établissement ne dépend pas uniquement du choix d’un logiciel. Elle repose aussi sur une organisation claire, des données correctement préparées, des responsabilités définies et un accompagnement adapté des utilisateurs.

Note : Ce guide présente des repères généraux. Chaque établissement doit adapter sa démarche à son organisation, à ses obligations locales et aux besoins de ses utilisateurs.`;

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'comment-preparer-la-gestion-numerique-de-son-etablissement',
    title: 'Comment préparer la gestion numérique de son établissement scolaire ?',
    excerpt: 'Des repères pratiques pour analyser l’organisation d’un établissement, identifier ses besoins et préparer progressivement l’utilisation d’outils numériques.',
    content: ARTICLE_CONTENT_1,
    category: 'Organisation & Méthode',
    readingTimeMinutes: calculateReadingTimeMinutes(ARTICLE_CONTENT_1),
    author: 'Équipe YZIOW',
    language: 'fr',
    status: 'published',
    publishedAt: '2026-08-27',
    tags: ['organisation', 'gestion-scolaire', 'numerique']
  }
];
