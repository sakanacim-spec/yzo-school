import React, { useEffect } from 'react';
import { ArrowLeft, BookOpen, ArrowRight, Building2, UserCheck, Users, Info } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getPublicTranslations } from '../../i18n/publicI18n';

interface UserGuideProps {
  onBack: () => void;
  onRegister?: () => void;
}

export const UserGuide: React.FC<UserGuideProps> = ({ onBack, onRegister }) => {
  const { language } = useStore();
  const t = getPublicTranslations(language);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const SECTIONS = [
    {
      role: t.guide.sec1_role,
      icon: <Building2 className="w-6 h-6 text-[#f97316]" />,
      desc: t.guide.sec1_desc,
      steps: [
        {
          title: t.guide.sec1_s1_title,
          detail: t.guide.sec1_s1_desc
        },
        {
          title: t.guide.sec1_s2_title,
          detail: t.guide.sec1_s2_desc
        },
        {
          title: t.guide.sec1_s3_title,
          detail: t.guide.sec1_s3_desc
        }
      ]
    },
    {
      role: t.guide.sec2_role,
      icon: <UserCheck className="w-6 h-6 text-blue-500" />,
      desc: t.guide.sec2_desc,
      steps: [
        {
          title: t.guide.sec2_s1_title,
          detail: t.guide.sec2_s1_desc
        },
        {
          title: t.guide.sec2_s2_title,
          detail: t.guide.sec2_s2_desc
        },
        {
          title: t.guide.sec2_s3_title,
          detail: t.guide.sec2_s3_desc
        }
      ]
    },
    {
      role: t.guide.sec3_role,
      icon: <Users className="w-6 h-6 text-emerald-500" />,
      desc: t.guide.sec3_desc,
      steps: [
        {
          title: t.guide.sec3_s1_title,
          detail: t.guide.sec3_s1_desc
        },
        {
          title: t.guide.sec3_s2_title,
          detail: t.guide.sec3_s2_desc
        },
        {
          title: t.guide.sec3_s3_title,
          detail: t.guide.sec3_s3_desc
        }
      ]
    }
  ];

  return (
    <div className={`min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24 ${language === 'ar' ? 'dir-rtl' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-[#f97316] transition-colors font-bold text-sm"
          >
            <ArrowLeft className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} /> {t.guide.backToHome}
          </button>

          {onRegister && (
            <button
              onClick={onRegister}
              className="px-5 py-2.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20"
            >
              {t.guide.registerCta}
            </button>
          )}
        </div>
      </header>

      {/* Hero Content */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="max-w-5xl mx-auto px-6 relative z-10">

          <div className="text-center max-w-2xl mx-auto space-y-4 mb-12">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto text-[#f97316] shadow-sm border border-orange-100">
              <BookOpen className="w-8 h-8" />
            </div>
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase mb-1">{t.guide.badge}</h2>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
              {t.guide.title}
            </h1>
            <p className="text-base text-slate-500 font-medium leading-relaxed">
              {t.guide.desc}
            </p>
          </div>

          {/* Encadré d'avertissement de transparence publique */}
          <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4 mb-10 flex items-center gap-3 text-amber-900 text-xs font-medium max-w-2xl mx-auto">
            <Info className="w-5 h-5 text-amber-600 shrink-0" />
            <span>{t.guide.notice}</span>
          </div>

          {/* Sections par rôle */}
          <div className="space-y-10">
            {SECTIONS.map((sec, idx) => (
              <div key={idx} className="bg-white rounded-3xl p-8 md:p-10 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0 border border-slate-200/60">
                    {sec.icon}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">{sec.role}</h3>
                    <p className="text-sm text-slate-500 font-medium">{sec.desc}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  {sec.steps.map((step, sIdx) => (
                    <div key={sIdx} className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100 space-y-2">
                      <h4 className="font-bold text-slate-800 text-sm">{step.title}</h4>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Call to action */}
          {onRegister && (
            <div className="mt-16 bg-slate-900 rounded-3xl p-8 md:p-12 text-center text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#f97316] rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
              <h3 className="text-2xl font-black mb-4 relative z-10">{t.guide.bottom_title}</h3>
              <p className="text-slate-400 font-medium mb-8 max-w-xl mx-auto relative z-10 text-sm">
                {t.guide.bottom_desc}
              </p>
              <button
                onClick={onRegister}
                className="inline-flex items-center justify-center px-8 py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all relative z-10 gap-2"
              >
                {t.guide.bottom_cta} <ArrowRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

        </div>
      </section>
    </div>
  );
};
