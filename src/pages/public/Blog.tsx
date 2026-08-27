// ============================================================
// BLOG — Page publique de la liste des articles
// ============================================================

import React from 'react';
import { useStore } from '../../store/useStore';
import { getPublishedPosts, formatLocalizedDate } from '../../utils/blogCatalog';
import { usePageSeo } from '../../hooks/usePageSeo';
import { getPublicTranslations } from '../../i18n/publicI18n';
import {
  GraduationCap,
  ArrowLeft,
  Calendar,
  Clock,
  User,
  ArrowRight,
  BookOpen
} from 'lucide-react';

interface BlogProps {
  onBack?: () => void;
  onSelectPost?: (slug: string) => void;
  onHome?: () => void;
}

export const Blog: React.FC<BlogProps> = ({ onBack, onSelectPost, onHome }) => {
  const language = useStore((s) => s.language);
  const t = getPublicTranslations(language);
  const posts = getPublishedPosts();

  usePageSeo({
    title: t.blog?.title || 'Blog YZIOW - Gestion scolaire et éducation',
    description: t.blog?.subtitle || 'Retrouvez tous nos articles, conseils et guides pour digitaliser et piloter votre établissement scolaire.',
    canonical: 'https://www.yziow.com/blog',
    ogType: 'website'
  });

  const handleHome = () => {
    if (onHome) {
      onHome();
    } else if (onBack) {
      onBack();
    } else {
      window.location.href = '/';
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.href = '/';
    }
  };

  const handlePostClick = (slug: string) => {
    if (onSelectPost) {
      onSelectPost(slug);
    } else {
      window.location.href = `/blog/${slug}`;
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#fafcff] font-['Poppins'] text-slate-800 flex flex-col ${
        language === 'ar' ? 'dir-rtl' : ''
      }`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ──── HEADER / NAVBAR MINIMALE ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-[0_2px_20px_rgb(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={handleHome}
              className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1"
              aria-label="Accueil YZIOW"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-[#0f172a] tracking-tight">yziow</span>
            </button>

            {/* Navigation minimale */}
            <nav className="hidden sm:flex items-center gap-4 text-xs font-bold text-slate-500 border-l border-slate-200 pl-6">
              <button
                type="button"
                onClick={handleHome}
                className="hover:text-orange-600 transition-colors"
              >
                {t.blog?.breadcrumbHome || 'Accueil'}
              </button>
              <span className="text-slate-300">/</span>
              <span className="text-orange-600 font-black">
                {t.blog?.allArticles || 'Tous les articles'}
              </span>
            </nav>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            <ArrowLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
            <span>{t.blog?.backHome || "Retour à l'accueil"}</span>
          </button>
        </div>
      </header>

      {/* ──── HERO SECTION ──── */}
      <section className="relative pt-16 pb-12 bg-gradient-to-b from-orange-50/50 to-transparent">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200/60 rounded-full py-1.5 px-4 text-xs font-black text-[#ea580c] tracking-wide shadow-sm">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.blog?.badge || 'Blog & Ressources'}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
            {t.blog?.title || 'Blog YZIOW'}
          </h1>

          <p className="text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
            {t.blog?.subtitle ||
              'Découvrez nos analyses, guides et retours d’expérience pour accompagner la transition numérique de votre établissement.'}
          </p>
        </div>
      </section>

      {/* ──── LISTING ARTICLES / EMPTY STATE ──── */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex-1 w-full">
        {posts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-6 shadow-sm">
            <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900">
                {t.blog?.emptyTitle || 'Aucun article publié pour le moment'}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                {t.blog?.emptyDesc ||
                  'Nos équipes préparent des articles détaillés et des guides pratiques. Revenez très bientôt !'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black tracking-wide shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
            >
              <ArrowLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span>{t.blog?.backHome || "Retour à l'accueil"}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                onClick={() => handlePostClick(post.slug)}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-orange-300 p-6 flex flex-col justify-between hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-black tracking-wide">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {post.readingTimeMinutes} {t.blog?.readTime || 'min de lecture'}
                      </span>
                    </span>
                  </div>

                  <h2 className="text-xl font-black text-slate-900 group-hover:text-orange-600 transition-colors leading-snug">
                    {post.title}
                  </h2>

                  <p className="text-sm text-slate-500 font-medium leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{post.author}</span>
                  </div>

                  {post.publishedAt && (
                    <div className="flex items-center gap-1 text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatLocalizedDate(post.publishedAt, language)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center text-xs font-black text-orange-600 group-hover:translate-x-1 transition-transform">
                  <span>{t.blog?.readMore || "Lire l'article"}</span>
                  <ArrowRight className={`w-3.5 h-3.5 ml-1 ${language === 'ar' ? 'rotate-180 mr-1 ml-0' : ''}`} />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* ──── FOOTER SIMPLE ──── */}
      <footer className="bg-slate-900 py-8 border-t border-slate-800 text-center text-xs text-slate-500 font-medium">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Yziow. Tous droits réservés.</p>
          <p>Fait avec passion au Bénin 🇧🇯</p>
        </div>
      </footer>
    </div>
  );
};

export default Blog;
