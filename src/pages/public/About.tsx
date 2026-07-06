import React, { useEffect } from 'react';
import { Users, CheckCircle, ArrowLeft } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';
import type { Language } from '../../i18n';

interface AboutProps {
  onBack: () => void;
}

export const About: React.FC<AboutProps> = ({ onBack }) => {
  const { language } = useStore();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24">
      {/* Premium Compact Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-[#f97316] transition-colors font-bold text-sm"
          >
            <ArrowLeft className="w-5 h-5" /> {t(language as Language, 'public.backToHome') || "Retour à l'accueil"}
          </button>
        </div>
      </header>

      {/* Hero Content */}
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="max-w-5xl mx-auto px-6 text-center space-y-8 relative z-10">
          <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mx-auto shadow-xl border border-slate-100">
            <Users className="w-10 h-10 text-[#f97316]" />
          </div>
          <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">{t(language as Language, 'public.whoAreWe') || 'Qui sommes-nous ?'}</h2>
          <h3 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">{t(language as Language, 'public.ourMission') || "Notre mission pour l'éducation moderne"}</h3>
          <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed max-w-4xl mx-auto">
            {t(language as Language, 'public.aboutDescription') || "Yziow est une plateforme née d'une vision d'excellence et d'accessibilité. Notre mission est de simplifier la gestion administrative des établissements scolaires tout en intégrant activement les parents dans le parcours éducatif de leurs enfants. Nous croyons que la réussite scolaire s'appuie sur une collaboration étroite et transparente entre l'école et la famille."}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 pt-8">
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
              <span className="font-bold text-slate-700">{t(language as Language, 'public.parentSchoolCollab') || 'Collaboration Parents-École'}</span>
            </div>
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
              <span className="font-bold text-slate-700">{t(language as Language, 'public.totalTransparency') || 'Transparence Totale'}</span>
            </div>
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
              <span className="font-bold text-slate-700">{t(language as Language, 'public.rigorousTracking') || 'Suivi Académique Rigoureux'}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
