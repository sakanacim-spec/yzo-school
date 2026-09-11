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

import rawPosts from './postsData.json' with { type: 'json' };

export const BLOG_POSTS: BlogPost[] = (rawPosts as BlogPost[]).map(p => ({
  ...p,
  readingTimeMinutes: calculateReadingTimeMinutes(p.content)
}));
