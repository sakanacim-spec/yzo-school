import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, Users, GraduationCap, BookOpen, Wallet, Clock, ChevronDown, CheckCircle } from 'lucide-react';
import { LANGUAGES } from '../../i18n/publicI18n';
import { useStore } from '../../store/useStore';
import { usePageSeo, PRODUCTION_CANONICAL_ORIGIN } from '../../hooks/usePageSeo';

interface AboutProps {
  onBack: () => void;
}

export const About: React.FC<AboutProps> = ({ onBack }) => {
  const { language, setLanguage } = useStore();
  const [langOpen, setLangOpen] = useState(false);
  const isEn = language === 'en';
  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const seoTitle = isEn ? 'About' : 'À propos';
  const seoDescription = isEn
    ? 'Discover Yziow, a school management platform published by Global Marketing and Technology, created in 2017, based in Benin and active internationally.'
    : 'Découvrez Yziow, plateforme de gestion scolaire éditée par Global Marketing and Technology, entreprise créée en 2017, implantée au Bénin et active à l’international.';

  const aboutJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${PRODUCTION_CANONICAL_ORIGIN}/about#webpage`,
    url: `${PRODUCTION_CANONICAL_ORIGIN}/about`,
    name: isEn ? 'About Yziow' : 'À propos de Yziow',
    description: seoDescription,
    isPartOf: {
      '@id': `${PRODUCTION_CANONICAL_ORIGIN}/#website`
    },
    about: {
      '@id': `${PRODUCTION_CANONICAL_ORIGIN}/#organization`
    },
    inLanguage: isEn ? 'en' : 'fr'
  };

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    canonical: `${PRODUCTION_CANONICAL_ORIGIN}/about`,
    ogType: 'website',
    jsonLd: aboutJsonLd
  });

  return (
    <div
      className={`min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24 ${
        language === 'ar' ? 'dir-rtl' : ''
      }`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-[#f97316] transition-colors font-bold text-sm"
          >
            <ArrowLeft className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
            {isEn ? 'Back to home' : "Retour à l'accueil"}
          </button>

          {/* Language Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
              aria-label={isEn ? 'Choose language' : 'Choisir la langue'}
            >
              <img src={currentLang.flagUrl} alt={currentLang.name} className="w-5 h-auto rounded-sm shadow-sm" />
              <span className="text-xs font-black hidden sm:block">{currentLang.name}</span>
              <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
            </button>

            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)}></div>
                <div
                  className={`absolute top-full mt-2 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 ${
                    language === 'ar' ? 'left-0' : 'right-0'
                  }`}
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        setLanguage(lang.code as any);
                        setLangOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        language === lang.code
                          ? 'bg-orange-50 text-[#f97316] font-black'
                          : 'text-slate-600 hover:bg-slate-50 font-bold text-sm'
                      }`}
                    >
                      <img src={lang.flagUrl} alt={lang.name} className="w-5 h-auto rounded-sm shadow-sm" />
                      <span>{lang.name}</span>
                      {language === lang.code && (
                        <CheckCircle className={`w-4 h-4 ${language === 'ar' ? 'mr-auto ml-0' : 'ml-auto mr-0'}`} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 pt-16 pb-16 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-[#f97316] rounded-full text-xs font-black tracking-widest uppercase border border-orange-100">
            <GraduationCap className="w-4 h-4" />
            {isEn ? 'ABOUT US' : 'QUI SOMMES-NOUS ?'}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight max-w-4xl mx-auto">
            {isEn
              ? 'Yziow, the school management platform serving schools and families'
              : 'Yziow, la plateforme de gestion scolaire au service des établissements et des familles'}
          </h1>
        </section>

        {/* Publisher Section */}
        <section className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-[#f97316]">
              <Building2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              {isEn ? 'Platform Publisher' : 'Éditeur de la plateforme'}
            </h2>
          </div>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-medium">
            {isEn
              ? 'The Yziow platform is published by Global Marketing and Technology, a technology company created in 2017 and based in Benin. Global Marketing and Technology develops digital solutions for users in Benin and internationally.'
              : 'La plateforme Yziow est éditée par Global Marketing and Technology, entreprise technologique créée en 2017 et implantée au Bénin. Global Marketing and Technology développe des solutions numériques destinées à des utilisateurs au Bénin et à l’international.'}
          </p>
        </section>

        {/* Users / Community Section */}
        <section className="space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-[#f97316]">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {isEn ? 'Platform Users and Community' : 'Communauté et utilisateurs de la plateforme'}
              </h2>
            </div>
            <p className="text-slate-600 font-medium">
              {isEn
                ? 'Yziow supports educational institutions (nursery, primary, middle, and high schools as well as training centers) and their whole community:'
                : "Yziow accompagne les établissements scolaires (écoles maternelles, primaires, collèges, lycées et centres de formation) ainsi que l'ensemble de leur communauté :"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'School Administrations' : 'Directions et administrations'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Enrollment management, class organization, and timetable scheduling.'
                  : 'Gestion des inscriptions, organisation des classes et des emplois du temps.'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'Teachers' : 'Enseignants'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Attendance tracking, grade entry, and academic follow-up.'
                  : 'Relevé des présences, saisie des notes et suivi pédagogique.'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'Parents and Families' : "Parents d'élèves"}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Grade tracking, access to report cards, attendance monitoring, and school communication.'
                  : 'Consultation des notes, accès aux bulletins scolaires, suivi des retards et absences, échanges avec l’établissement.'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'Students' : 'Élèves'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Timetable schedule and academic progress view.'
                  : 'Consultation de leur emploi du temps et suivi de leurs résultats scolaires.'}
              </p>
            </div>
          </div>
        </section>

        {/* Real Features Section */}
        <section className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              {isEn ? 'Real Platform Features' : 'Fonctionnalités réelles de la plateforme'}
            </h2>
            <p className="text-slate-600 font-medium">
              {isEn
                ? 'Operational modules available within Yziow cover:'
                : 'Les outils opérationnels disponibles dans Yziow couvrent :'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#f97316]">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'Academic Tracking' : 'Suivi académique'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Automatic average calculations and report card generation.'
                  : 'Calcul automatique des moyennes et génération des bulletins périodiques.'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#f97316]">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'Financial Management' : 'Gestion financière'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Tuition payment tracking and receipt issuance.'
                  : 'Suivi des paiements des frais de scolarité et délivrance de reçus.'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#f97316]">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {isEn ? 'School Life' : 'Vie scolaire'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                {isEn
                  ? 'Homework logbook and attendance records.'
                  : 'Cahier de texte et registres de présence.'}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
