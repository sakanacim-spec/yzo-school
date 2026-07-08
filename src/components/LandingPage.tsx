import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { 
  GraduationCap, BookOpen, MapPin, MessageSquare, ShieldCheck, 
  Globe, ArrowRight, Lock, Building2, ChevronDown, CheckCircle,
  Facebook, Twitter, Linkedin, Instagram
} from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onNavigate: (page: 'about' | 'contact') => void;
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

const LANDING_I18N: Record<string, any> = {
  fr: {
    nav: { features: "Nos Solutions", partners: "Partenaires", login: "ACCÉDER À MON ESPACE", loginMobile: "CONNEXION" },
    hero: { badge: "LA PLATEFORME ÉDUCATIVE DE RÉFÉRENCE", title1: "L'excellence", title2: "au cœur de l'école.", desc: "Une solution complète pour la gestion scolaire, connectant parents, élèves et administration dans un écosystème sécurisé, moderne et intuitif.", cta: "Accéder à mon espace", boxTitle: "100% Sécurisé & Fiable", boxDesc: "Paiements certifiés, données chiffrées de bout en bout et hébergement souverain pour une tranquillité d'esprit absolue.", schools: "Écoles partenaires", parents: "Parents connectés" },
    sponsors: { subtitle: "Nos Partenaires Premium", title: "Ils propulsent l'éducation de demain" },
    features: { subtitle: "Nos Solutions", title: "Tout le suivi scolaire regroupé sur une plateforme unique", f1_title: "Bulletins & Notes", f1_desc: "Visualisez les notes dès leur saisie. Téléchargez et vérifiez les bulletins officiels en format PDF sécurisé.", f2_title: "Présences & Absences", f2_desc: "Suivez en temps réel l'assiduité. Soyez immédiatement notifié en cas d'absence ou de retard.", f3_title: "Espaces Établissements", f3_desc: "Interface complète pour directeurs et secrétaires : gestion des inscriptions et de la facturation." },
    footer: { desc: "La plateforme moderne qui connecte l'école, les parents et les élèves pour une réussite scolaire assurée.", company: "Entreprise", about: "Qui sommes-nous", contact: "Contact & Assistance", careers: "Carrières", legal: "Légal", cgu: "Conditions générales d'utilisation", privacy: "Politique de confidentialité", mentions: "Mentions légales", partner_title: "Devenir Partenaire", partner_desc: "Associez l'image de votre entreprise à l'éducation de demain. Louez nos espaces publicitaires premium.", partner_btn: "Nous contacter", rights: "© 2026 Yziow. Tous droits réservés.", madeIn: "Fait avec passion au Bénin 🇧🇯" }
  },
  en: {
    nav: { features: "Our Solutions", partners: "Partners", login: "GO TO MY SPACE", loginMobile: "LOGIN" },
    hero: { badge: "THE LEADING EDUCATIONAL PLATFORM", title1: "Excellence", title2: "at the heart of the school.", desc: "A complete solution for school management, connecting parents, students, and administration in a secure, modern, and intuitive ecosystem.", cta: "Go to my space", boxTitle: "100% Secure & Reliable", boxDesc: "Certified payments, end-to-end encrypted data, and sovereign hosting for absolute peace of mind.", schools: "Partner schools", parents: "Connected parents" },
    sponsors: { subtitle: "Our Premium Partners", title: "Propelling the education of tomorrow" },
    features: { subtitle: "Our Solutions", title: "All school tracking gathered on a single platform", f1_title: "Report Cards & Grades", f1_desc: "View grades as soon as they are entered. Download and verify official report cards in a secure PDF format.", f2_title: "Attendance & Absences", f2_desc: "Track attendance in real-time. Get instantly notified in case of an absence or delay.", f3_title: "School Workspaces", f3_desc: "Complete interface for principals and secretaries: manage enrollments and billing." },
    footer: { desc: "The modern platform connecting the school, parents, and students for guaranteed academic success.", company: "Company", about: "About us", contact: "Contact & Support", careers: "Careers", legal: "Legal", cgu: "Terms of Service", privacy: "Privacy Policy", mentions: "Legal Mentions", partner_title: "Become a Partner", partner_desc: "Associate your company's image with the education of tomorrow. Rent our premium advertising spaces.", partner_btn: "Contact us", rights: "© 2026 Yziow. All rights reserved.", madeIn: "Made with passion in Benin 🇧🇯" }
  },
  es: {
    nav: { features: "Nuestras Soluciones", partners: "Socios", login: "ACCEDER A MI ESPACIO", loginMobile: "ACCEDER" },
    hero: { badge: "LA PLATAFORMA EDUCATIVA DE REFERENCIA", title1: "La excelencia", title2: "en el corazón de la escuela.", desc: "Una solución completa para la gestión escolar, conectando padres, estudiantes y administración en un ecosistema seguro, moderno e intuitivo.", cta: "Acceder a mi espacio", boxTitle: "100% Seguro y Confiable", boxDesc: "Pagos certificados, datos encriptados de extremo a extremo y alojamiento soberano para una tranquilidad absoluta.", schools: "Escuelas asociadas", parents: "Padres conectados" },
    sponsors: { subtitle: "Nuestros Socios Premium", title: "Impulsando la educación del mañana" },
    features: { subtitle: "Nuestras Soluciones", title: "Todo el seguimiento escolar en una plataforma única", f1_title: "Boletines y Notas", f1_desc: "Visualice las notas apenas se ingresan. Descargue y verifique los boletines oficiales en PDF seguro.", f2_title: "Asistencias y Ausencias", f2_desc: "Haga seguimiento de la asistencia en tiempo real. Sea notificado de inmediato en caso de ausencia.", f3_title: "Espacios para Escuelas", f3_desc: "Interfaz completa para directores y secretarias: gestión de inscripciones y facturación." },
    footer: { desc: "La plataforma moderna que conecta a la escuela, padres y estudiantes para un éxito escolar asegurado.", company: "Empresa", about: "Quiénes somos", contact: "Contacto y Soporte", careers: "Carreras", legal: "Legal", cgu: "Términos de Servicio", privacy: "Política de Privacidad", mentions: "Avisos legales", partner_title: "Convertirse en Socio", partner_desc: "Asocie la imagen de su empresa a la educación del mañana. Alquile nuestros espacios premium.", partner_btn: "Contáctenos", rights: "© 2026 Yziow. Todos los derechos reservados.", madeIn: "Hecho con pasión en Benín 🇧🇯" }
  },
  ar: {
    nav: { features: "حلولنا", partners: "الشركاء", login: "تسجيل الدخول", loginMobile: "دخول" },
    hero: { badge: "المنصة التعليمية الرائدة", title1: "التميز", title2: "في قلب المدرسة.", desc: "حل شامل للإدارة المدرسية، يربط بين الآباء والطلاب والإدارة في نظام بيئي آمن وحديث وبديهي.", cta: "تسجيل الدخول", boxTitle: "آمن وموثوق 100%", boxDesc: "مدفوعات معتمدة، بيانات مشفرة من البداية للنهاية، واستضافة سيادية لراحة بال مطلقة.", schools: "مدارس شريكة", parents: "آباء متصلون" },
    sponsors: { subtitle: "شركاؤنا المميزون", title: "دفع عجلة التعليم نحو المستقبل" },
    features: { subtitle: "حلولنا", title: "كل التتبع المدرسي مجموع في منصة واحدة", f1_title: "النتائج والدرجات", f1_desc: "شاهد الدرجات بمجرد إدخالها. قم بتنزيل والتحقق من النتائج الرسمية بصيغة PDF آمنة.", f2_title: "الحضور والغياب", f2_desc: "تتبع الحضور في الوقت الفعلي. احصل على إشعار فوري في حالة الغياب أو التأخير.", f3_title: "مساحات المؤسسات", f3_desc: "واجهة كاملة للمديرين والسكرتارية: إدارة التسجيل والفوترة." },
    footer: { desc: "المنصة الحديثة التي تربط بين المدرسة والآباء والطلاب لنجاح دراسي مضمون.", company: "الشركة", about: "من نحن", contact: "الاتصال والدعم", careers: "وظائف", legal: "قانوني", cgu: "شروط الاستخدام", privacy: "سياسة الخصوصية", mentions: "ملاحظات قانونية", partner_title: "كن شريكاً", partner_desc: "اربط صورة شركتك بتعليم المستقبل. استأجر مساحاتنا الإعلانية المميزة.", partner_btn: "اتصل بنا", rights: "© 2026 Yziow. جميع الحقوق محفوظة.", madeIn: "صنع بشغف في بنين 🇧🇯" }
  }
};

import { useEffect } from 'react';
import { translationApi } from '../services/translationApi';

// Fonction récursive pour traduire un dictionnaire de chaînes avec cache local
async function translateObject(obj: any, targetLang: string): Promise<any> {
  if (typeof obj === 'string') {
    const cacheKey = `landing_translation_${targetLang}_${obj}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    const translated = await translationApi.translate(obj, targetLang, 'fr');
    if (typeof translated === 'string') {
      localStorage.setItem(cacheKey, translated);
      return translated;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => translateObject(item, targetLang)));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = await translateObject(obj[key], targetLang);
    }
    return result;
  }
  return obj;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onNavigate }) => {
  const { language, setLanguage } = useStore();
  const [langOpen, setLangOpen] = useState(false);
  const [dynamicT, setDynamicT] = useState<any>(LANDING_I18N[language] || LANDING_I18N.fr);
  
  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const t = dynamicT;

  useEffect(() => {
    if (LANDING_I18N[language]) {
      setDynamicT(LANDING_I18N[language]);
    } else {
      translateObject(LANDING_I18N.fr, language).then(translated => {
        setDynamicT(translated);
      });
    }
  }, [language]);

  return (
    <div className={`min-h-screen bg-[#fafcff] font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white scroll-smooth flex flex-col ${language === 'ar' ? 'dir-rtl' : ''}`}>
      
      {/* ──── EN-TÊTE / NAVBAR PREMIUM ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-[0_2px_20px_rgb(0,0,0,0.02)] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black text-[#0f172a] tracking-tight">yziow</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-bold text-slate-600 hover:text-[#f97316] transition-colors">{t.nav.features}</a>
            <a href="#sponsors" className="text-sm font-bold text-slate-600 hover:text-[#f97316] transition-colors">{t.nav.partners}</a>
          </nav>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* SÉLECTEUR DE LANGUE PREMIUM */}
            <div className="relative">
              <button 
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
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

      {/* ──── SECTION HERO PREMIUM ──── */}
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
                onClick={onLogin}
                className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-black tracking-wide shadow-2xl hover:shadow-slate-900/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
              >
                {t.hero.cta} <ArrowRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full max-w-[600px] lg:max-w-none relative">
            <div className="relative bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white p-4 overflow-hidden transform hover:scale-[1.02] transition-transform duration-500">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-[2rem] p-8 text-center space-y-6 border border-slate-200/50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">{t.hero.boxTitle}</h3>
                <p className="text-sm font-medium text-slate-500 leading-relaxed">
                  {t.hero.boxDesc}
                </p>
                <div className="pt-6 grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left">
                    <h4 className="text-xl font-black text-[#f97316]">500+</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.hero.schools}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left">
                    <h4 className="text-xl font-black text-[#f97316]">2M+</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.hero.parents}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION SPONSORS PREMIUM ──── */}
      <section id="sponsors" className="py-20 bg-white border-y border-slate-100 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center space-y-2 mb-12">
            <h2 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase">{t.sponsors.subtitle}</h2>
            <p className="text-slate-900 font-black text-2xl">{t.sponsors.title}</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-500">
            {/* Placeholder for Large Enterprises (Banks, Mobile Networks) */}
            <div className="h-20 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center filter grayscale hover:grayscale-0 transition-all cursor-pointer">
              <span className="text-xl font-black text-slate-800">MTN Group</span>
            </div>
            <div className="h-20 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center filter grayscale hover:grayscale-0 transition-all cursor-pointer">
              <span className="text-xl font-black text-slate-800">Moov Africa</span>
            </div>
            <div className="h-20 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center filter grayscale hover:grayscale-0 transition-all cursor-pointer">
              <span className="text-xl font-black text-slate-800">Ecobank</span>
            </div>
            <div className="h-20 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center filter grayscale hover:grayscale-0 transition-all cursor-pointer">
              <span className="text-xl font-black text-slate-800">UBA</span>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION SCROLLING MARQUEE (PME) ──── */}
      <section className="py-12 bg-slate-900 overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-slate-900 to-transparent z-10"></div>
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-slate-900 to-transparent z-10"></div>
        
        <div className="flex w-[200%] animate-marquee gap-8">
          {/* We duplicate the content to create a seamless loop */}
          {[1, 2].map((group) => (
            <div key={group} className="flex gap-8 items-center w-1/2">
              <div className="px-8 py-4 bg-slate-800/50 rounded-full border border-slate-700 whitespace-nowrap">
                <span className="text-slate-300 font-bold">📚 Librairie Savoir Plus</span>
              </div>
              <div className="px-8 py-4 bg-slate-800/50 rounded-full border border-slate-700 whitespace-nowrap">
                <span className="text-slate-300 font-bold">🚌 Transport Scolaire Express</span>
              </div>
              <div className="px-8 py-4 bg-slate-800/50 rounded-full border border-slate-700 whitespace-nowrap">
                <span className="text-slate-300 font-bold">💻 IT Solutions SARL</span>
              </div>
              <div className="px-8 py-4 bg-slate-800/50 rounded-full border border-slate-700 whitespace-nowrap">
                <span className="text-slate-300 font-bold">🎨 Fournitures Académiques</span>
              </div>
              <div className="px-8 py-4 bg-slate-800/50 rounded-full border border-slate-700 whitespace-nowrap">
                <span className="text-slate-300 font-bold">🏆 Académie d'Excellence</span>
              </div>
            </div>
          ))}
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

      {/* ──── PREMIUM FOOTER ──── */}
      <footer className="bg-slate-900 pt-20 pb-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-black text-white tracking-tight">yziow</span>
              </div>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xs">
                {t.footer.desc}
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#f97316] transition-colors"><Facebook size={18} /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#f97316] transition-colors"><Twitter size={18} /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#f97316] transition-colors"><Linkedin size={18} /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#f97316] transition-colors"><Instagram size={18} /></a>
              </div>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.company}</h4>
              <ul className="space-y-4">
                <li><button onClick={() => onNavigate('about')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors">{t.footer.about}</button></li>
                <li><button onClick={() => onNavigate('contact')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors">{t.footer.contact}</button></li>
                <li><button onClick={() => onNavigate('careers')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors">{t.footer.careers}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.legal}</h4>
              <ul className="space-y-4">
                <li><button onClick={() => onNavigate('cgu')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.cgu}</button></li>
                <li><button onClick={() => onNavigate('privacy')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.privacy}</button></li>
                <li><button onClick={() => onNavigate('legal')} className="text-slate-400 hover:text-[#f97316] font-medium text-sm transition-colors text-left">{t.footer.mentions}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-lg mb-6">{t.footer.partner_title}</h4>
              <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">
                {t.footer.partner_desc}
              </p>
              <button 
                onClick={() => onNavigate('contact')}
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
