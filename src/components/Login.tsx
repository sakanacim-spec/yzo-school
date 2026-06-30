// ============================================================
// PAGE DE CONNEXION — Hybride PC (Sliding) / Mobile (Slideshow)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { parentApi } from '../services/parentApi';
import { LinkStudent } from './LinkStudent';
import { GraduationCap, Lock, User, Phone, CheckCircle, Store, BarChart2, MapPin, MessageSquare, ShieldCheck, Globe, Eye, EyeOff, Building2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

// ── Images de fond (Mobile uniquement) ──
import bgImage1 from '../assets/login-bg1.jpg';
import bgImage2 from '../assets/login-bg2.jpg';
import bgImage3 from '../assets/login-bg3.jpg';
import bgImage4 from '../assets/login-bg4.jpg';

import { Register } from './Register';
import { ParentRegister } from './ParentRegister';
import { ForgotPassword } from './ForgotPassword';

import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { getTranslations } from '../i18n';

const BG_IMAGES = [bgImage1, bgImage2, bgImage3, bgImage4];
const SLIDE_DURATION = 5000;

// ── COMPOSANTS PARTAGÉS ──────────────────────────────────────

const SchoolLogo: React.FC<{ size?: string }> = ({ size = "w-16 h-16" }) => {
  return (
    <div className={`${size} bg-amber-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20`}>
      <GraduationCap className="w-1/2 h-1/2 text-white" />
    </div>
  );
};

const BackgroundSlideshow: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const goToNext = useCallback(() => {
      setCurrentIndex((prev) => (prev + 1) % BG_IMAGES.length);
    }, []);
  
    useEffect(() => {
      const timer = setInterval(goToNext, SLIDE_DURATION);
      return () => clearInterval(timer);
    }, [goToNext]);
  
    return (
      <div className="fixed inset-0 z-0 overflow-hidden">
        {BG_IMAGES.map((img, i) => (
          <div
            key={i}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${i === currentIndex ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: `url(${img})` }}
          />
        ))}
        <div className="absolute inset-0 z-[1] bg-slate-900/40 backdrop-blur-[2px]" />
      </div>
    );
};

// ── COMPOSANT PRINCIPAL ──────────────────────────────────────

export const Login: React.FC = () => {
  const login = useStore((s) => s.login);
  const language = useStore((s) => s.language);
  const T = getTranslations(language);
  const appName = "Yziow";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState<'login' | 'register' | 'parent-register' | 'link' | 'forgot-password'>('login');

  
  // Auth Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [trialExpiredSchool, setTrialExpiredSchool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  
  // NOUVEAU : Sélection Établissement
  const [schools, setSchools] = useState<{slug: string, name: string, logo_url: string}[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');

  useEffect(() => {
    // Récupérer la liste des écoles
    fetch(`${API_BASE_URL}/schools`)
      .then(res => res.json())
      .then(data => {
         if (Array.isArray(data)) setSchools(data);
      })
      .catch(console.error);

    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTrialExpiredSchool(null);
    setLoading(true);

    try {
        const ok = await login(username, password, selectedSchool);
        if (!ok) setError(T.errors.loginFailed || 'Identifiants incorrects.');

    } catch (err: any) {
        const msg: string = err?.message || err?.error || "Une erreur est survenue.";
        // Essai expiré
        if (msg.startsWith('TRIAL_EXPIRED:')) {
            const schoolName = msg.split(':')[1] || '';
            setTrialExpiredSchool(schoolName);
        } else {
            setError(msg);
        }
    } finally {
        setLoading(false);
    }
  };


  if (view === 'link') {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 animate-in fade-in zoom-in duration-300">
                <LinkStudent onComplete={async () => {
                   // Une fois lié, on connecte officiellement
                   await login(username, password, selectedSchool);
                }} />
                <button 
                  onClick={async () => await login(username, password, selectedSchool)}
                  className="w-full mt-4 py-3 text-slate-400 text-xs font-bold hover:text-amber-600 transition"
                >
                  Passer cette étape pour le moment
                </button>
            </div>
        </div>
    );
  }

  if (isMobile && view === 'register') {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl p-6 sm:p-10 animate-in fade-in zoom-in duration-300 custom-scrollbar overflow-y-auto max-h-[90vh]">
                <Register 
                  onBack={() => setView('login')} 
                  onSuccess={(admin) => {
                    // Auto-login après inscription réussie
                    window.location.reload();
                  }} 
                />
            </div>
        </div>
    );
  }

  if (isMobile && view === 'parent-register') {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl p-6 sm:p-10 animate-in fade-in zoom-in duration-300 custom-scrollbar overflow-y-auto max-h-[90vh]">
                <ParentRegister 
                  schools={schools}
                  onBack={() => setView('login')} 
                  onSuccess={(user) => {
                    // Switch to login so they can log in
                    setView('login');
                  }} 
                />
            </div>
        </div>
    );
  }

  if (isMobile && view === 'forgot-password') {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-3xl bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl p-6 sm:p-10 animate-in fade-in zoom-in duration-300 custom-scrollbar overflow-y-auto max-h-[90vh]">
                <ForgotPassword schoolSlug={selectedSchool} onBack={() => setView('login')} />
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center font-['Poppins'] overflow-hidden bg-white relative">
      

      {/* --- DESKTOP VIEW --- */}
      {!isMobile && (
        <div className="flex w-full max-w-[1100px] h-[650px] bg-white rounded-[2rem] overflow-hidden shadow-2xl relative z-10 mx-4 border border-slate-100">
          
          {/* LEFT PANEL - FORM */}
          <div className="w-1/2 h-full flex flex-col justify-center px-12 lg:px-20 relative bg-white">
            {view === 'register' ? (
                <Register onBack={() => setView('login')} onSuccess={() => setView('login')} />
            ) : view === 'parent-register' ? (
                <ParentRegister schools={schools} onBack={() => setView('login')} onSuccess={() => setView('login')} />
            ) : view === 'forgot-password' ? (
                <ForgotPassword schoolSlug={selectedSchool} onBack={() => setView('login')} />
            ) : (
                <div className="flex flex-col h-full py-8 justify-between">
                    <div className="flex flex-col items-center">
                        <SchoolLogo size="w-20 h-20" />
                        <h1 className="text-4xl font-black text-[#1e293b] tracking-tight mt-3">yziow</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 mb-8">
                            PLATEFORME DE GESTION SCOLAIRE
                        </p>

                        <form onSubmit={handleAuth} className="w-full space-y-4">
                            <div className="relative">
                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                                <select 
                                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                    value={selectedSchool} 
                                    onChange={(e) => setSelectedSchool(e.target.value)} 
                                    required
                                >
                                    <option value="" disabled>-- Sélectionnez votre établissement --</option>
                                    <option value="global">Accès Global (SuperAdmin)</option>
                                    <option disabled>────── Établissements ──────</option>
                                    {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                                <input 
                                    type="text" 
                                    placeholder="Numéro de téléphone" 
                                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                    value={username} 
                                    onChange={(e) => setUsername(e.target.value)} 
                                    required 
                                />
                            </div>
                            
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                                <input 
                                    type="password" 
                                    placeholder="••••••" 
                                    className="w-full pl-12 pr-12 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                    value={password} 
                                    onChange={(e) => setPassword(e.target.value)} 
                                    required 
                                />
                                <EyeOff className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500 cursor-pointer opacity-70 hover:opacity-100" />
                            </div>

                            <div className="flex justify-between items-center px-1 pt-1 mb-4">
                                <button type="button" onClick={() => setView('forgot-password')} className="text-[11px] text-slate-500 font-medium hover:text-orange-500">Mot de passe oublié ?</button>
                                <button type="button" onClick={() => setIsPrivacyOpen(true)} className="text-[11px] text-orange-500 font-semibold hover:underline underline-offset-2">Confidentialité & Données</button>
                            </div>

                            {error && <div className="text-rose-500 text-xs italic text-center font-bold px-4 pb-2">{error}</div>}

                            <button type="submit" disabled={loading} className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2">
                                <Lock className="w-4 h-4" /> SE CONNECTER
                            </button>
                            
                            <div className="flex items-center gap-4 my-6">
                                <div className="h-px bg-slate-200 flex-1"></div>
                                <span className="text-xs text-slate-400 font-medium">ou</span>
                                <div className="h-px bg-slate-200 flex-1"></div>
                            </div>
                            
                            <button type="button" onClick={() => setView('register')} className="w-full py-3.5 bg-white border-2 border-orange-200 text-orange-500 hover:bg-orange-50 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2">
                                <Building2 className="w-4 h-4" /> INSCRIRE MON ÉTABLISSEMENT
                            </button>
                        </form>
                    </div>

                    <div className="flex justify-center items-center gap-2 text-[10px] text-slate-400 font-medium mt-auto">
                        <ShieldCheck className="w-3.5 h-3.5" /> Connexion sécurisée <span className="mx-1">|</span> Vos données sont protégées
                    </div>
                </div>
            )}
          </div>

          {/* RIGHT PANEL - INFO */}
          <div className="w-1/2 h-full bg-[#f97316] relative p-10 flex flex-col overflow-hidden">
             
             {/* Text Content */}
             <div className="relative z-10 pt-4 flex-1">
                <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Bonjour, Parent ! <span className="inline-block animate-wave">👋</span></h2>
                <h3 className="text-2xl font-bold text-[#431407] mb-1 leading-snug">Votre enfant grandit.</h3>
                <h3 className="text-2xl font-bold text-[#431407] mb-6 leading-snug">Restez connecté à sa réussite scolaire.</h3>
                
                <p className="text-sm font-medium text-white leading-relaxed max-w-[420px] mb-8">
                  Avec Yziow, consultez les informations importantes dès qu'elles sont disponibles et échangez facilement avec son établissement.
                </p>

                {/* 3 Cards */}
                <div className="flex gap-4 mb-8">
                    <div className="bg-white rounded-[20px] p-4 flex-1 text-center shadow-lg transform transition-transform hover:-translate-y-1">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <BarChart2 className="w-6 h-6 text-orange-500" />
                        </div>
                        <h4 className="text-[11px] font-bold text-slate-800 mb-2 leading-tight">Notes et bulletins<br/>en temps réel</h4>
                        <p className="text-[9px] text-slate-500 leading-snug">Consultez les résultats dès leur publication.</p>
                    </div>
                    
                    <div className="bg-white rounded-[20px] p-4 flex-1 text-center shadow-lg transform transition-transform hover:-translate-y-1">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <MapPin className="w-6 h-6 text-orange-500" />
                        </div>
                        <h4 className="text-[11px] font-bold text-slate-800 mb-2 leading-tight">Présences et absences<br/>instantanées</h4>
                        <p className="text-[9px] text-slate-500 leading-snug">Soyez informé des absences, retards et présences.</p>
                    </div>

                    <div className="bg-white rounded-[20px] p-4 flex-1 text-center shadow-lg transform transition-transform hover:-translate-y-1">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <MessageSquare className="w-6 h-6 text-orange-500" />
                        </div>
                        <h4 className="text-[11px] font-bold text-slate-800 mb-2 leading-tight">Échanges simples<br/>avec l'école</h4>
                        <p className="text-[9px] text-slate-500 leading-snug">Communiquez facilement avec les enseignants et l'administration.</p>
                    </div>
                </div>

                {/* Info Bar */}
                <div className="bg-white rounded-xl py-3 px-4 flex justify-between items-center mb-10 shadow-sm">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-orange-500" />
                        <div>
                            <p className="text-[10px] font-bold text-slate-800">Sécurisé</p>
                            <p className="text-[8px] text-slate-500">Vos données sont protégées</p>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-orange-500" />
                        <div>
                            <p className="text-[10px] font-bold text-slate-800">Fiable</p>
                            <p className="text-[8px] text-slate-500">Informations justes et en temps réel</p>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <Globe className="w-5 h-5 text-orange-500" />
                        <div>
                            <p className="text-[10px] font-bold text-slate-800">Accessible partout</p>
                            <p className="text-[8px] text-slate-500">Depuis votre mobile ou ordinateur</p>
                        </div>
                    </div>
                </div>

                {/* Call to action */}
                <div className="flex flex-col items-center relative z-20">
                    <button 
                        type="button" 
                        onClick={() => setView('parent-register')}
                        className="w-[85%] py-4 border-2 border-white rounded-xl text-white font-black text-sm tracking-wide hover:bg-white hover:text-orange-500 transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                        <User className="w-4 h-4" /> CRÉER MON ESPACE PARENT <span className="ml-2 text-lg leading-none">&gt;</span>
                    </button>
                    <p className="text-[11px] text-[#431407] font-semibold mt-3">C'est rapide, gratuit et sécurisé.</p>
                </div>
             </div>

             {/* Footer Pill */}
             <div className="relative z-10 w-full flex justify-center mt-auto pb-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-full py-2.5 px-6 flex items-center gap-2 text-[10px] font-bold text-[#431407] shadow-sm">
                    <span className="text-rose-500">❤️</span> Parce que chaque enfant mérite le meilleur suivi pour réussir. <span className="text-amber-400">⭐</span>
                </div>
             </div>
             
             {/* Decorative Element / Doodles (replacing illustration) */}
             <div className="absolute top-12 right-8 opacity-40">
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 90 C 20 20, 80 10, 90 60" stroke="white" strokeWidth="2" strokeDasharray="6 6" fill="transparent"/>
                    <circle cx="90" cy="60" r="5" fill="none" stroke="white" strokeWidth="2"/>
                </svg>
             </div>
             <div className="absolute top-[80px] right-[20px] opacity-40 transform rotate-12">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14z"></path><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
             </div>
          </div>
        </div>
      )}
\n      {/* --- MOBILE VIEW --- */}
      {isMobile && (
        <>
            <BackgroundSlideshow />
            <div className="mobile-card">
                <div className="flex flex-col items-center">
                    <SchoolLogo size="w-20 h-20" />
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter text-center">
                        {view === 'login' ? 'Bienvenue !' : 'Rejoignez-nous'}
                    </h1>
                    <p className="text-[10px] text-amber-600 font-extrabold uppercase tracking-[0.2em] mt-2 mb-6 bg-amber-50 px-3 py-1 rounded-full">
                        {appName} • Excellence
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                        <div className="relative mb-2">
                            <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                            <select className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 appearance-none" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} required>
                                <option value="" disabled>-- Sélectionnez votre établissement --</option>
                                <option value="global">Accès Global (SuperAdmin)</option>
                                <option disabled>────── Établissements ──────</option>
                                {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                            </select>
                        </div>
                        
                        <input type="text" placeholder={T.login.phonePlaceholder} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        
                        <input type="password" placeholder={T.login.passwordPlaceholder} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400" value={password} onChange={(e) => setPassword(e.target.value)} required />

                      <div className="flex justify-between items-center px-1 text-[11px] mt-1">

                        <button type="button" onClick={() => setView('forgot-password')} className="text-slate-400 hover:text-amber-600">Mot de passe oublié ?</button>
                        <button 
                          type="button" 
                          onClick={() => setIsPrivacyOpen(true)}
                          className="text-slate-400 hover:text-amber-600 underline cursor-pointer"
                        >
                          Confidentialité & Sécurité
                        </button>
                      </div>

                    {trialExpiredSchool && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left">
                            <p className="text-amber-800 font-bold text-xs">⏰ Période d'essai expirée</p>
                            <p className="text-amber-700 text-xs mt-1">"{trialExpiredSchool}" — Contactez l'administrateur pour régler l'abonnement.</p>
                        </div>
                    )}
                    {error && <div className="text-rose-500 text-xs italic text-center font-bold px-4">{error}</div>}

                    <button type="submit" disabled={loading} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-500/30 active:scale-95 transition-transform flex items-center justify-center gap-2 mt-4">
                        {loading ? T.login.loggingIn : T.login.loginButton}
                    </button>
                    
                    <button type="button" onClick={() => setView('parent-register')} className="w-full py-3 text-blue-600 bg-blue-50 border border-blue-100 text-[10px] font-black uppercase tracking-widest mt-2 rounded-2xl hover:bg-blue-100 transition-colors shadow-sm">
                        Je suis parent, Créer mon compte
                    </button>
                    
                    <button type="button" onClick={() => setView('register')} className="w-full py-2 text-amber-600 text-[10px] font-black uppercase tracking-widest mt-2">
                        {T.login.noAccount} {T.login.registerSchool}
                    </button>
                </form>

            </div>
        </>
      )}

      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 z-20 text-[10px] font-black uppercase tracking-[0.3em] ${isMobile ? 'text-white/60' : 'text-slate-400'} whitespace-nowrap`}>
        <span>© {new Date().getFullYear()} {appName} • Éducation Connectée</span>
        <span className="hidden sm:inline">•</span>
        <button 
          onClick={() => setIsPrivacyOpen(true)}
          className="hover:text-amber-500 transition-colors underline cursor-pointer"
        >
          Confidentialité
        </button>
      </div>

      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
    </div>
  );
};
