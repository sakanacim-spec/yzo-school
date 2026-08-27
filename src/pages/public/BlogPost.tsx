// ============================================================
// BLOG POST — Page de lecture complète d'un article de blog
// ============================================================

import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  getPostBySlug,
  formatLocalizedDate,
  getLanguageAvailabilityNotice
} from '../../utils/blogCatalog';
import { usePageSeo } from '../../hooks/usePageSeo';
import { getPublicTranslations } from '../../i18n/publicI18n';
import {
  GraduationCap,
  ArrowLeft,
  Calendar,
  Clock,
  User,
  AlertCircle,
  Tag,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Globe
} from 'lucide-react';

interface BlogPostProps {
  slug: string;
  onBack?: () => void;
  onHome?: () => void;
  onNavigate?: (page: 'landing' | 'blog' | 'guide' | 'contact' | 'cgu' | 'privacy' | 'legal') => void;
}

const LANGUAGES = [
  { code: 'fr', name: 'Français', flagUrl: 'https://flagcdn.com/w40/fr.png' },
  { code: 'en', name: 'English', flagUrl: 'https://flagcdn.com/w40/gb.png' },
  { code: 'es', name: 'Español', flagUrl: 'https://flagcdn.com/w40/es.png' },
  { code: 'ar', name: 'العربية', flagUrl: 'https://flagcdn.com/w40/sa.png' },
  { code: 'it', name: 'Italiano', flagUrl: 'https://flagcdn.com/w40/it.png' },
  { code: 'de', name: 'Deutsch', flagUrl: 'https://flagcdn.com/w40/de.png' },
  { code: 'pt', name: 'Português', flagUrl: 'https://flagcdn.com/w40/pt.png' },
  { code: 'zh', name: '中文', flagUrl: 'https://flagcdn.com/w40/cn.png' },
  { code: 'ru', name: 'Русский', flagUrl: 'https://flagcdn.com/w40/ru.png' }
];

export const BlogPost: React.FC<BlogPostProps> = ({ slug, onBack, onHome, onNavigate }) => {
  const { language, setLanguage } = useStore();
  const [langOpen, setLangOpen] = useState(false);
  const t = getPublicTranslations(language);
  const post = getPostBySlug(slug, false);

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [slug]);

  const articleJsonLd = post
    ? {
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
      }
    : undefined;

  usePageSeo({
    title: post ? `${post.title} | YZIOW` : `${t.blog?.notFoundTitle || 'Article introuvable'} | YZIOW`,
    description: post ? post.excerpt : undefined,
    canonical: post ? `https://www.yziow.com/blog/${post.slug}` : undefined,
    ogType: 'article',
    noindex: !post,
    jsonLd: articleJsonLd
  });

  const handleBackToBlog = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.href = '/blog';
    }
  };

  const handleBackToHome = () => {
    if (onHome) {
      onHome();
    } else {
      window.location.href = '/';
    }
  };

  const handleNav = (page: 'landing' | 'blog' | 'guide' | 'contact' | 'cgu' | 'privacy' | 'legal') => {
    if (onNavigate) {
      onNavigate(page);
    } else if (page === 'landing') {
      handleBackToHome();
    } else if (page === 'blog') {
      handleBackToBlog();
    } else {
      window.location.href = `/${page}`;
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#fafcff] font-['Poppins'] text-slate-800 flex flex-col ${
        language === 'ar' ? 'dir-rtl' : ''
      }`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ──── HEADER / NAVBAR ÉPURÉE AVEC SÉLECTEUR DE LANGUE ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-[0_2px_20px_rgb(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1"
              aria-label="Accueil YZIOW"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-[#0f172a] tracking-tight">yziow</span>
            </button>

            {/* Navigation minimale sur desktop */}
            <nav className="hidden md:flex items-center gap-2.5 text-xs font-bold text-slate-500 border-l border-slate-200 pl-6" aria-label="Navigation supérieure">
              <button
                type="button"
                onClick={handleBackToHome}
                className="hover:text-orange-600 transition-colors"
              >
                {t.blog?.breadcrumbHome || 'Accueil'}
              </button>
              <span className="text-slate-300">/</span>
              <button
                type="button"
                onClick={handleBackToBlog}
                className="hover:text-orange-600 transition-colors"
              >
                {t.blog?.breadcrumbBlog || 'Blog'}
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Sélecteur de langue 9 langues */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                aria-label="Choisir la langue"
              >
                <img src={currentLang.flagUrl} alt={currentLang.name} className="w-5 h-auto rounded-sm shadow-sm" />
                <span className="text-xs font-black hidden sm:block">{currentLang.name}</span>
                <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
              </button>

              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)}></div>
                  <div className={`absolute top-full mt-2 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-in ${
                    language === 'ar' ? 'left-0' : 'right-0'
                  }`}>
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setLanguage(lang.code as any);
                          setLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          language === lang.code ? 'bg-orange-50 text-[#f97316] font-black' : 'text-slate-600 hover:bg-slate-50 font-bold text-sm'
                        }`}
                      >
                        <img src={lang.flagUrl} alt={lang.name} className="w-5 h-auto rounded-sm shadow-sm" />
                        <span>{lang.name}</span>
                        {language === lang.code && <CheckCircle className={`w-4 h-4 ${language === 'ar' ? 'mr-auto ml-0' : 'ml-auto mr-0'}`} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleBackToBlog}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              <ArrowLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span className="hidden sm:inline">{t.blog?.backArticles || t.blog?.backBlog || 'Retour aux articles'}</span>
              <span className="sm:hidden">{t.blog?.breadcrumbBlog || 'Blog'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ──── FIL D'ARIANE (BREADCRUMB) ──── */}
      {post && (
        <div className="bg-slate-50/80 border-b border-slate-200/60 py-3">
          <div className="max-w-4xl mx-auto px-6">
            <nav
              className="flex items-center gap-2 text-xs font-bold text-slate-500 overflow-x-auto"
              aria-label="Fil d'Ariane"
            >
              <button
                type="button"
                onClick={handleBackToHome}
                className="hover:text-orange-600 transition-colors shrink-0"
              >
                {t.blog?.breadcrumbHome || 'Accueil'}
              </button>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <button
                type="button"
                onClick={handleBackToBlog}
                className="hover:text-orange-600 transition-colors shrink-0"
              >
                {t.blog?.breadcrumbBlog || 'Blog'}
              </button>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span className="text-slate-800 font-black truncate shrink-0">
                {post.category}
              </span>
            </nav>
          </div>
        </div>
      )}

      {/* ──── ARTICLE CONTENT / NOT FOUND ──── */}
      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full">
        {!post ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center max-w-xl mx-auto space-y-6 shadow-sm mt-4">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900">
                {t.blog?.notFoundTitle || 'Article introuvable'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {t.blog?.notFoundDesc ||
                  "L'article demandé n'existe pas, a été retiré ou n'est pas encore accessible au public."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleBackToBlog}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black tracking-wide shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
              >
                <ArrowLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                <span>{t.blog?.backArticles || t.blog?.backBlog || 'Retour aux articles'}</span>
              </button>
              <button
                type="button"
                onClick={handleBackToHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold active:scale-95 transition-all"
              >
                <span>{t.blog?.backHome || "Retour à l'accueil"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Indication discrète lorsque la langue de l'interface diffère de celle de l'article */}
            {language !== post.language && (
              <div
                className="bg-amber-50 border border-amber-200/80 text-amber-900 rounded-2xl px-5 py-3.5 text-xs font-semibold flex items-center gap-3 shadow-sm"
                role="note"
              >
                <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{getLanguageAvailabilityNotice(language, post.language)}</span>
              </div>
            )}

            {/* Corps de l'article : utilise sa propre langue et direction (LTR pour le français) */}
            <article
              lang={post.language}
              dir={post.language === 'ar' ? 'rtl' : 'ltr'}
              className="space-y-8 text-left"
            >
              {/* Header de l'article */}
              <div className="space-y-6 border-b border-slate-200 pb-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3.5 py-1 bg-orange-50 text-orange-700 rounded-xl text-xs font-black tracking-wide border border-orange-200/50">
                    {post.category}
                  </span>

                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {post.readingTimeMinutes} {t.blog?.readTime || 'min de lecture'}
                    </span>
                  </span>

                  {post.publishedAt && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {t.blog?.publishedOn || 'Publié le'}{' '}
                        {formatLocalizedDate(post.publishedAt, language)}
                      </span>
                    </span>
                  )}
                </div>

                <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-[1.2]">
                  {post.title}
                </h1>

                <div className="flex items-center gap-3 pt-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-black text-sm shadow-sm">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{post.author}</div>
                    <div className="text-xs text-slate-500 font-medium">YZIOW Édition</div>
                  </div>
                </div>
              </div>

              {/* Chapeau / Excerpt */}
              <div className="bg-slate-50 border-l-4 border-orange-500 rounded-r-2xl p-6 text-base sm:text-lg font-medium text-slate-700 leading-relaxed shadow-sm">
                {post.excerpt}
              </div>

              {/* Corps de l'article (sécurisé sans dangerouslySetInnerHTML) */}
              <div className="space-y-6 text-slate-700 leading-relaxed text-base sm:text-lg">
                {post.content.split('\n\n').map((paragraph, index) => {
                  const trimmed = paragraph.trim();
                  if (!trimmed) return null;

                  // Titre de section détecté (ex: "1. ", "Conclusion", "Note :")
                  if (/^\d+\.\s+/.test(trimmed)) {
                    const [title, ...rest] = trimmed.split('\n');
                    return (
                      <div key={index} className="space-y-3 pt-4">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                          {title}
                        </h2>
                        {rest.length > 0 && (
                          <p className="text-slate-600 font-normal leading-relaxed">
                            {rest.join(' ')}
                          </p>
                        )}
                      </div>
                    );
                  }

                  if (trimmed.startsWith('Conclusion')) {
                    const [title, ...rest] = trimmed.split('\n');
                    return (
                      <div key={index} className="space-y-3 pt-4">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                          {title}
                        </h2>
                        {rest.length > 0 && (
                          <p className="text-slate-600 font-normal leading-relaxed">
                            {rest.join(' ')}
                          </p>
                        )}
                      </div>
                    );
                  }

                  if (trimmed.startsWith('Note :')) {
                    return (
                      <div key={index} className="bg-orange-50/60 border border-orange-200/60 rounded-2xl p-5 text-sm text-slate-700 font-medium leading-relaxed my-4">
                        {trimmed}
                      </div>
                    );
                  }

                  return (
                    <p key={index} className="text-slate-600 font-normal leading-relaxed">
                      {trimmed}
                    </p>
                  );
                })}
              </div>

              {/* Tags facultatifs */}
              {post.tags && post.tags.length > 0 && (
                <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  <Tag className="w-4 h-4 text-slate-500" />
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </article>

            {/* Navigation de bas d'article : Retour aux articles & Découvrir YZIOW */}
            <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleBackToBlog}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                <ArrowLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                <span>{t.blog?.backArticles || t.blog?.backBlog || 'Retour aux articles'}</span>
              </button>

              <button
                type="button"
                onClick={handleBackToHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-slate-700 hover:text-orange-600 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                <span>{t.blog?.discoverYziow || 'Découvrir YZIOW'}</span>
                <ArrowRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* CTA Box de fin d'article */}
            <div className="mt-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 sm:p-10 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-2xl font-black">Prêt à digitaliser votre établissement ?</h3>
                <p className="text-slate-300 text-sm max-w-md">
                  Découvrez la solution complète YZIOW pour simplifier la gestion de votre école dès aujourd’hui.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBackToHome}
                className="px-6 py-3.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black tracking-wide shadow-lg shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-2 shrink-0"
              >
                <span>{t.blog?.discoverYziow || 'Découvrir YZIOW'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ──── PIED DE PAGE STRUCTURÉ AVEC CONTRASTE AMÉLIORÉ ──── */}
      <footer className="bg-slate-900 text-white py-12 border-t border-slate-800 text-xs font-medium mt-auto">
        <div className="max-w-7xl mx-auto px-6 space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex items-center gap-3 text-left focus:outline-none"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black text-white tracking-tight">yziow</span>
            </button>

            <nav className="flex flex-wrap items-center justify-center gap-6 text-slate-300 font-bold">
              <button onClick={() => handleNav('landing')} className="hover:text-orange-400 transition-colors">
                {t.blog?.breadcrumbHome || 'Accueil'}
              </button>
              <button onClick={() => handleNav('blog')} className="hover:text-orange-400 transition-colors">
                {t.blog?.breadcrumbBlog || 'Blog'}
              </button>
              <button onClick={() => handleNav('guide')} className="hover:text-orange-400 transition-colors">
                {t.footer.guide || 'Guide'}
              </button>
              <button onClick={() => handleNav('contact')} className="hover:text-orange-400 transition-colors">
                {t.footer.contact || 'Contact'}
              </button>
              <button onClick={() => handleNav('cgu')} className="hover:text-orange-400 transition-colors">
                {t.footer.cgu || 'CGU'}
              </button>
              <button onClick={() => handleNav('privacy')} className="hover:text-orange-400 transition-colors">
                {t.footer.privacy || 'Confidentialité'}
              </button>
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400 font-medium">
            <p>{t.footer.rights || '© 2026 Yziow. Tous droits réservés.'}</p>
            <p>{t.footer.madeIn || 'Conçu au Bénin'}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BlogPost;
