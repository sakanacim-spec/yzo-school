import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  GraduationCap, BookOpen, MapPin, ShieldCheck,
  ArrowRight, Lock, Building2, ChevronDown, CheckCircle,
  Landmark, Radio, Package, Bus, UserCheck, Layers
} from 'lucide-react';
import { getPublicTranslations } from '../i18n/publicI18n';
import { hasPublishedPosts } from '../utils/blogCatalog';

export interface LandingPageProps {
  onLogin: () => void;
  onRegisterSchool: () => void;
  onNavigate: (page: 'about' | 'contact' | 'careers' | 'cgu' | 'privacy' | 'legal' | 'guide' | 'blog', extra?: { subject?: string; message?: string }) => void;
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

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onRegisterSchool, onNavigate }) => {
  const { language, setLanguage } = useStore();
  const [langOpen, setLangOpen] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const t = getPublicTranslations(language);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePartnerClick = () => {
    onNavigate('partners');
  };

  return (
    <div className={`min-h-screen bg-[#fafcff] font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white scroll-smooth flex flex-col ${language === 'ar' ? 'dir-rtl' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* ──── EN-TÊTE / NAVBAR PREMIUM ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-[0_2px_20px_rgb(0,0,0,0.02)] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1"
            aria-label="Retour en haut de la page Yziow"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black text-[#0f172a] tracking-tight">yziow</span>
          </button>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-bold text-slate-600 hover:text-[#f97316] transition-colors">{t.nav.features}</a>
            <button
              type="button"
              onClick={() => onNavigate('partners')}
              className="text-sm font-bold text-slate-600 hover:text-[#f97316] transition-colors"
            >
              {t.nav.partners}
            </button>
          </nav>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* SÉLECTEUR DE LANGUE PREMIUM (9 LANGUES) */}
            <div className="relative">
              <button
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
                  <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-in">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
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
                        {language === lang.code && <CheckCircle className="w-4 h-4 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onLogin}
              className="px-5 sm:px-8 py-2.5 bg-gradient-to-r from-[#f97316] to-[#ea580c] hover:from-[#ea580c] hover:to-[#c2410c] text-white rounded-xl text-xs font-black tracking-wider shadow-xl shadow-orange-500/20 active:scale-95 transition-all flex items-center gap-2 border border-orange-500/50"
            >
              <Lock className="w-4 h-4" /> <span className="hidden sm:inline">{t.nav.login}</span><span className="sm:hidden">{t.nav.loginMobile}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ──── SECTION HERO FACTUELLE ET PREMIUM ──── */}
      <section className="relative pt-20 pb-32 overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-gradient-to-br from-orange-400/20 to-rose-400/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/10 to-indigo-400/10 rounded-full blur-[80px]"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left space-y-8">
            <div className="inline-flex items-center gap-2 bg-white border border-slate-200/60 rounded-full py-2 px-5 text-xs font-black text-[#ea580c] tracking-wide shadow-sm transform hover:-translate-y-1 transition-all">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </span>
              {t.hero.badge}
            </div>

            <h1 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight leading-[1.1]">
              {t.hero.title1}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f97316] to-[#ea580c]">{t.hero.title2}</span>
            </h1>

            <p className="text-lg text-slate-600 font-medium leading-relaxed max-w-[600px] mx-auto lg:mx-0">
              {t.hero.desc}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <button
                onClick={onRegisterSchool}
                className="w-full sm:w-auto px-8 py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-2xl text-sm font-black tracking-wide shadow-xl shadow-orange-500/25 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {t.hero.ctaRegister} <ArrowRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>

              <a
                href="#features"
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-2xl text-sm font-bold tracking-wide shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {t.hero.ctaFeatures}
              </a>
            </div>
          </div>

          <div className="flex-1 w-full max-w-[600px] lg:max-w-none relative">
            <div className="relative bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white p-4 overflow-hidden transform hover:scale-[1.02] transition-transform duration-500">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] p-8 text-center space-y-6 border border-slate-200/50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">{t.hero.boxTitle}</h3>
                <p className="text-sm font-medium text-slate-500 leading-relaxed">
                  {t.hero.boxDesc}
                </p>
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 text-[#f97316]">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{t.hero.benefit1_title}</h4>
                      <p className="text-xs text-slate-500 font-medium">{t.hero.benefit1_desc}</p>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{t.hero.benefit2_title}</h4>
                      <p className="text-xs text-slate-500 font-medium">{t.hero.benefit2_desc}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION SPONSORS / PARTENAIRES FACTUELLE ──── */}
      <section id="sponsors" className="py-20 bg-white border-y border-slate-100 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-xs font-black text-orange-500 tracking-[0.2em] uppercase">{t.sponsors.subtitle}</h2>
            <h3 className="text-slate-900 font-black text-3xl md:text-4xl tracking-tight">{t.sponsors.title}</h3>
            <p className="text-slate-600 font-medium text-sm md:text-base leading-relaxed">
              {t.sponsors.desc}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-6 flex flex-col items-start gap-3 hover:border-orange-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-700 shadow-sm border border-slate-100">
                <Landmark className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="font-black text-slate-900 text-base">{t.sponsors.c1_title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{t.sponsors.c1_desc}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-6 flex flex-col items-start gap-3 hover:border-orange-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-700 shadow-sm border border-slate-100">
                <Radio className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="font-black text-slate-900 text-base">{t.sponsors.c2_title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{t.sponsors.c2_desc}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-6 flex flex-col items-start gap-3 hover:border-orange-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-700 shadow-sm border border-slate-100">
                <Package className="w-6 h-6 text-emerald-600" />
              </div>
              <h4 className="font-black text-slate-900 text-base">{t.sponsors.c3_title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{t.sponsors.c3_desc}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-6 flex flex-col items-start gap-3 hover:border-orange-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-700 shadow-sm border border-slate-100">
                <Bus className="w-6 h-6 text-indigo-600" />
              </div>
              <h4 className="font-black text-slate-900 text-base">{t.sponsors.c4_title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{t.sponsors.c4_desc}</p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={handlePartnerClick}
              className="inline-flex items-center justify-center px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-900/10 active:scale-95 transition-all gap-2"
            >
              {t.sponsors.partnerCta} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ──── SECTION FONCTIONNALITÉS ──── */}
      <section id="features" className="py-24 bg-slate-50 relative flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-20">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">{t.features.subtitle}</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              {t.features.title}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 hover:shadow-2xl hover:shadow-orange-500/5 hover:-translate-y-2 transition-all duration-300 group">
              <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BookOpen className="w-7 h-7 text-[#f97316]" />
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-3">{t.features.f1_title}</h4>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {t.features.f1_desc}
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 hover:shadow-2xl hover:shadow-orange-500/5 hover:-translate-y-2 transition-all duration-300 group">
              <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MapPin className="w-7 h-7 text-[#f97316]" />
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-3">{t.features.f2_title}</h4>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {t.features.f2_desc}
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 hover:shadow-2xl hover:shadow-orange-500/5 hover:-translate-y-2 transition-all duration-300 group">
              <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Building2 className="w-7 h-7 text-[#f97316]" />
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-3">{t.features.f3_title}</h4>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {t.features.f3_desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──── PREMIUM FOOTER RÉORGANISÉ ──── */}
      <footer className="bg-slate-900 pt-20 pb-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="space-y-6">
              <button
                type="button"
                onClick={scrollToTop}
                className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1"
                aria-label="Retour en haut de la page"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-black text-white tracking-tight">yziow</span>
              </button>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xs">
                {t.footer.desc}
              </p>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.company}</h4>
              <ul className="space-y-4">
                <li><button onClick={() => onNavigate('about')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.about}</button></li>
                <li><button onClick={() => onNavigate('contact')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.contact}</button></li>
                <li><button onClick={() => onNavigate('careers')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.careers}</button></li>
                <li><a href="/ambassadeur" className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors block">{t.footer.ambassador}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.resources}</h4>
              <ul className="space-y-4 mb-8">
                <li>
                  <button onClick={() => onNavigate('guide')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left flex items-center gap-1.5">
                    <span>📖 {t.footer.guide}</span>
                  </button>
                </li>
                {hasPublishedPosts() && (
                  <li>
                    <button onClick={() => onNavigate('blog')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left flex items-center gap-1.5">
                      <span>📰 {t.footer.blog || 'Blog'}</span>
                    </button>
                  </li>
                )}
              </ul>

              <h4 className="text-white font-black text-lg mb-6">{t.footer.legal}</h4>
              <ul className="space-y-4">
                <li><button onClick={() => onNavigate('cgu')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.cgu}</button></li>
                <li><button onClick={() => onNavigate('privacy')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.privacy}</button></li>
                <li><button onClick={() => onNavigate('legal')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.mentions}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.partner_title}</h4>
              <p className="text-slate-400 text-sm font-medium leading-relaxed mb-4">
                {t.footer.partner_desc}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('partners')}
                className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors block mb-6 text-left"
              >
                {t.footer.partner_discover} →
              </button>
              <button
                onClick={handlePartnerClick}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700 hover:border-slate-600"
              >
                {t.footer.partner_btn}
              </button>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-xs font-medium">{t.footer.rights}</p>
            <p className="text-slate-500 text-xs font-medium">{t.footer.madeIn}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
