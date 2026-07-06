import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Heart, Zap, Globe, ChevronRight, X, Send } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';
import type { Language } from '../../types';

interface CareersProps {
  onBack: () => void;
}

export const Careers: React.FC<CareersProps> = ({ onBack }) => {
  const { language } = useStore();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const VALUES = [
    {
      icon: <Heart className="w-6 h-6 text-rose-500" />,
      title: t(language as Language, 'public.careers.val1.title') || "Passion pour l'Éducation",
      desc: t(language as Language, 'public.careers.val1.desc') || "Nous construisons des outils qui ont un impact direct sur la réussite des élèves et le quotidien des enseignants."
    },
    {
      icon: <Zap className="w-6 h-6 text-orange-500" />,
      title: t(language as Language, 'public.careers.val2.title') || "Innovation Rapide",
      desc: t(language as Language, 'public.careers.val2.desc') || "Nous itérons vite et n'avons pas peur de remettre en question le statu quo pour offrir les meilleures solutions."
    },
    {
      icon: <Globe className="w-6 h-6 text-blue-500" />,
      title: t(language as Language, 'public.careers.val3.title') || "Impact Global",
      desc: t(language as Language, 'public.careers.val3.desc') || "Avec des bureaux en Espagne et au Bénin, nous pensons notre plateforme pour qu'elle s'adapte à tous les contextes."
    }
  ];

  const JOB_OPENINGS = [
    {
      title: t(language as Language, 'public.careers.job1.title') || "Commercial(e) Terrain B2B",
      location: t(language as Language, 'public.careers.job1.location') || "Cotonou, Bénin",
      type: t(language as Language, 'public.careers.job1.type') || "Temps plein",
      department: t(language as Language, 'public.careers.job1.department') || "Ventes",
      desc: t(language as Language, 'public.careers.job1.desc') || "Développez notre réseau d'écoles partenaires en présentant la solution Yziow aux directeurs d'établissements."
    },
    {
      title: t(language as Language, 'public.careers.job2.title') || "Développeur(se) Full-Stack React/Node",
      location: t(language as Language, 'public.careers.job2.location') || "Télétravail / Espagne",
      type: t(language as Language, 'public.careers.job2.type') || "Temps plein",
      department: t(language as Language, 'public.careers.job2.department') || "Ingénierie",
      desc: t(language as Language, 'public.careers.job2.desc') || "Participez à la construction et à l'optimisation des fonctionnalités clés de la plateforme."
    },
    {
      title: t(language as Language, 'public.careers.job3.title') || "Chargé(e) de Support Client",
      location: t(language as Language, 'public.careers.job3.location') || "Cotonou, Bénin",
      type: t(language as Language, 'public.careers.job3.type') || "Temps plein",
      department: t(language as Language, 'public.careers.job3.department') || "Support",
      desc: t(language as Language, 'public.careers.job3.desc') || "Accompagnez nos écoles partenaires dans le déploiement de la solution et répondez à leurs questions quotidiennes."
    },
    {
      title: t(language as Language, 'public.careers.job4.title') || "Représentant(e) Commercial(e) International(e)",
      location: t(language as Language, 'public.careers.job4.location') || "International (Autres Pays)",
      type: t(language as Language, 'public.careers.job4.type') || "Indépendant / Temps plein",
      department: t(language as Language, 'public.careers.job4.department') || "Ventes & Expansion",
      desc: t(language as Language, 'public.careers.job4.desc') || "Devenez l'ambassadeur de Yziow dans votre pays. Développez notre réseau d'écoles partenaires au-delà de l'Espagne et du Bénin."
    }
  ];
  const [formName, setFormName] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCountry || !formEmail || !formMessage) return;
    
    setIsSubmitting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      
      const response = await fetch(`${apiUrl}/api/public/careers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          job_title: selectedJob,
          name: formName,
          country: formCountry,
          email: formEmail,
          cover_letter: formMessage
        })
      });

      if (!response.ok) {
        throw new Error('Erreur réseau');
      }

      setSelectedJob(null);
      setFormName('');
      setFormCountry('');
      setFormEmail('');
      setFormMessage('');
      alert(t(language as Language, 'public.careers.success') || "Votre candidature a bien été envoyée ! Nous vous contacterons très prochainement.");
    } catch (error) {
      alert(t(language as Language, 'public.careers.error') || "Une erreur est survenue lors de l'envoi de la candidature. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24 relative">
      {/* Header */}
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
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-20">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase mb-1">{t(language as Language, 'public.careers.joinUs') || "Rejoignez-nous"}</h2>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              {t(language as Language, 'public.careers.buildSchool') || "Construisons l'école de demain"}
            </h1>
            <p className="text-base text-slate-500 font-medium leading-relaxed mt-4">
              {t(language as Language, 'public.careers.heroDesc') || "Chez Yziow, nous cherchons des esprits brillants et passionnés pour transformer l'éducation en Afrique et en Europe."}
            </p>
          </div>

          {/* Values */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
            {VALUES.map((val, idx) => (
              <div key={idx} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 hover:-translate-y-2 transition-transform duration-300">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
                  {val.icon}
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">{val.title}</h3>
                <p className="text-slate-500 font-medium text-sm leading-relaxed">
                  {val.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Job Openings */}
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-[#f97316]/10 rounded-xl flex items-center justify-center shrink-0">
                <Briefcase className="w-6 h-6 text-[#f97316]" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">{t(language as Language, 'public.careers.openPositions') || "Postes ouverts"}</h2>
            </div>

            <div className="space-y-4">
              {JOB_OPENINGS.map((job, idx) => (
                <div key={idx} className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-md shadow-slate-200/40 group hover:border-orange-200 hover:shadow-orange-500/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-black rounded-lg uppercase tracking-wider">{job.department}</span>
                      <span className="text-slate-400 text-xs font-bold">{job.type}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">{job.title}</h3>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xl mb-3">
                      {job.desc}
                    </p>
                    <div className="flex items-center gap-1 text-slate-400 text-sm font-semibold">
                      <Globe className="w-4 h-4" /> {job.location}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setSelectedJob(job.title)}
                    className="shrink-0 px-6 py-3 bg-slate-50 text-slate-700 hover:text-white hover:bg-[#f97316] font-bold text-sm rounded-xl transition-colors flex items-center gap-2 group-hover:bg-[#f97316] group-hover:text-white"
                  >
                    {t(language as Language, 'public.careers.apply') || "Postuler"} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-12 bg-slate-900 rounded-3xl p-8 md:p-12 text-center text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#f97316] rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
              <h3 className="text-2xl font-black mb-4 relative z-10">{t(language as Language, 'public.careers.noIdealJob') || "Vous ne trouvez pas votre poste idéal ?"}</h3>
              <p className="text-slate-400 font-medium mb-8 max-w-xl mx-auto relative z-10">
                {t(language as Language, 'public.careers.unsolicitedDesc') || "Nous sommes toujours ouverts aux candidatures spontanées. Envoyez-nous votre CV et une courte présentation de vos motivations."}
              </p>
              <button 
                onClick={() => setSelectedJob(t(language as Language, 'public.careers.unsolicitedJob') || "Candidature Spontanée")}
                className="inline-flex items-center justify-center px-8 py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all relative z-10"
              >
                {t(language as Language, 'public.careers.sendUnsolicited') || "Envoyer une candidature spontanée"}
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* Application Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedJob(null)}></div>
          <div className="bg-white rounded-3xl w-full max-w-lg relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-black text-slate-900">{t(language as Language, 'public.careers.apply') || "Postuler"}</h3>
                <p className="text-sm font-medium text-[#f97316] mt-1">{selectedJob}</p>
              </div>
              <button 
                onClick={() => setSelectedJob(null)}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all shadow-sm border border-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">{t(language as Language, 'public.careers.fullName') || "Nom complet"}</label>
                  <input 
                    type="text" 
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="Jean Dupont"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">{t(language as Language, 'public.careers.country') || "Pays de résidence"}</label>
                  <input 
                    type="text" 
                    required
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="Ex: Bénin, Togo, France..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">{t(language as Language, 'public.careers.email') || "Adresse email"}</label>
                  <input 
                    type="email" 
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="jean@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">{t(language as Language, 'public.careers.message') || "Votre message / Lettre de motivation"}</label>
                  <textarea 
                    required
                    rows={4}
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium resize-none"
                    placeholder="Expliquez-nous pourquoi vous êtes le candidat idéal..."
                  ></textarea>
                </div>
                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold tracking-wide shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? (t(language as Language, 'public.careers.sending') || 'Envoi en cours...') : (
                      <>{t(language as Language, 'public.careers.sendApplication') || 'Envoyer ma candidature'} <Send className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
