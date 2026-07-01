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
import familyIllustration from '../assets/family_illustration.png';
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

interface LoginProps {
  onBackToLanding?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onBackToLanding }) => {
  const login = useStore((s) => s.login);
  const language = useStore((s) => s.language);
  const T = getTranslations(language);
  const appName = "Yziow";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState<'login' | 'register' | 'parent-register' | 'link' | 'forgot-password'>('login');

  
  // Auth Form States
  const [showPassword, setShowPassword] = useState(false);
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
        if (!ok) setError(T.errors.loginFailed || 'Erreur inconnue.');

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
      <style>{`
        /* ──── DESKTOP SLIDING OVERLAY ──── */
        .auth-container {
          background-color: #fff;
          border-radius: 2rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
          position: relative;
          overflow: hidden;
          width: 1100px;
          max-width: 100%;
          min-height: 650px;
          z-index: 10;
          border: 1px solid #f1f5f9;
        }

        .form-container {
          position: absolute; top: 0; height: 100%; transition: all 0.6s ease-in-out;
        }

        .sign-in-container { left: 0; width: 50%; z-index: 2; }
        .auth-container.right-panel-active .sign-in-container { transform: translateX(100%); }

        .sign-up-container { left: 0; width: 50%; opacity: 0; z-index: 1; }
        .auth-container.right-panel-active .sign-up-container {
          transform: translateX(100%); opacity: 1; z-index: 5; animation: show 0.6s;
        }

        @keyframes show {
          0%, 49.99% { opacity: 0; z-index: 1; }
          50%, 100% { opacity: 1; z-index: 5; }
        }

        .overlay-container {
          position: absolute; top: 0; left: 50%; width: 50%; height: 100%;
          overflow: hidden; transition: transform 0.6s ease-in-out; z-index: 100;
        }
        .auth-container.right-panel-active .overlay-container { transform: translateX(-100%); }

        .overlay {
          background: #f97316;
          color: #FFFFFF; position: relative; left: -100%; height: 100%; width: 200%;
          transform: translateX(0); transition: transform 0.6s cubic-bezier(0.7, 0, 0.3, 1);
        }
        .auth-container.right-panel-active .overlay { transform: translateX(50%); }

        .overlay-panel {
          position: absolute; display: flex; align-items: center; justify-content: center;
          flex-direction: column; padding: 0 40px; text-align: center; top: 0; height: 100%; width: 50%;
          transform: translateX(0); transition: transform 0.6s cubic-bezier(0.7, 0, 0.3, 1);
        }
        .overlay-left { transform: translateX(-20%); }
        .auth-container.right-panel-active .overlay-left { transform: translateX(0); }
        .overlay-right { right: 0; transform: translateX(0); }
        .auth-container.right-panel-active .overlay-right { transform: translateX(20%); }

        /* ──── MOBILE CARDS ──── */
        .mobile-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border-radius: 24px;
            width: 90%;
            max-width: 400px;
            padding: 32px 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
            z-index: 10;
        }
      `}</style>

      {/* --- DESKTOP VIEW --- */}
      {!isMobile && (
        <div className={`auth-container ${view === 'register' || view === 'parent-register' || view === 'forgot-password' ? 'right-panel-active' : ''}`}>

          {/* Sign Up Panel */}
          <div className="form-container sign-up-container bg-slate-900 overflow-y-auto custom-scrollbar">
             <div className="min-h-full w-full flex flex-col items-center justify-center p-4">
                 {view === 'register' ? (
                   <Register 
                     onBack={() => setView('login')} 
                     onSuccess={(admin) => {
                       window.location.reload();
                     }} 
                   />
                 ) : view === 'forgot-password' ? (
                   <ForgotPassword schoolSlug={selectedSchool} onBack={() => setView('login')} />
                 ) : (
                   <ParentRegister 
                     schools={schools}
                     onBack={() => setView('login')} 
                     onSuccess={(user) => {
                       setView('login');
                     }} 
                   />
                 )}
             </div>
          </div>

          {/* Login Panel */}
          <div className="form-container sign-in-container bg-white">
              <form className="w-full h-full flex flex-col justify-center px-12 lg:px-20" onSubmit={handleAuth}>
                {onBackToLanding && (
                    <button 
                        type="button" 
                        onClick={onBackToLanding}
                        className="self-start text-xs font-bold text-slate-400 hover:text-orange-500 mb-6 flex items-center gap-1.5 transition-colors"
                    >
                        ← Retour à l'accueil
                    </button>
                )}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-[#f97316] rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-orange-500/20">
                      <GraduationCap className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-[#1e293b] tracking-tight">yziow</h1>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">
                        PLATEFORME DE GESTION SCOLAIRE
                    </p>
                </div>

                <div className="w-full space-y-4">
                    <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                        <select 
                            className="w-full h-[52px] !pl-12 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                            value={selectedSchool} 
                            onChange={(e) => setSelectedSchool(e.target.value)} 
                            required
                        >
                            <option value="" disabled>-- Sélectionnez votre établissement --</option>
                            <option value="global">Accès Global (SuperAdmin)</option>
                            <option disabled>────── Établissements ──────</option>
                            {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                    
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                        <input 
                            type="text" 
                            placeholder="+33 6 12 34 56 78" 
                            className="w-full h-[52px] !pl-12 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            required 
                        />
                    </div>
                    
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                        <input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="••••••" 
                            className="w-full h-[52px] !pl-12 pr-11 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                        >
                            {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                <div className="flex justify-between items-center w-full px-1 pt-1 mb-6 mt-3">
                    <button type="button" onClick={() => setView('forgot-password')} className="text-[11px] text-slate-500 font-medium hover:text-orange-500">Mot de passe oublié ?</button>
                    <button type="button" onClick={() => setIsPrivacyOpen(true)} className="text-[11px] text-orange-500 font-semibold hover:underline underline-offset-2">Confidentialité & Données</button>
                </div>

                {trialExpiredSchool && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs mb-4">
                        <p className="text-amber-800 font-bold">⚠️ Période d'essai expirée</p>
                        <p className="text-amber-700 mt-1">"{trialExpiredSchool}" — Contactez l'administrateur.</p>
                    </div>
                )}
                {error && <div className="text-rose-500 text-[10px] italic text-center font-bold px-4 pb-2">{error}</div>}

                <button type="submit" disabled={loading} className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl font-bold text-xs tracking-wide shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" /> SE CONNECTER
                </button>
                
                <div className="flex items-center gap-4 my-5 w-full">
                    <div className="h-px bg-slate-200 flex-1"></div>
                    <span className="text-[10px] text-slate-400 font-medium">ou</span>
                    <div className="h-px bg-slate-200 flex-1"></div>
                </div>
                
                <button type="button" onClick={() => setView('register')} className="w-full py-3.5 bg-white border border-orange-200 text-orange-500 hover:bg-orange-50 rounded-xl font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4" /> INSCRIRE MON ÉTABLISSEMENT
                </button>

                <div className="flex justify-center items-center gap-2 text-[9px] text-slate-400 font-medium mt-6">
                    <ShieldCheck className="w-3 h-3" /> Connexion sécurisée <span className="mx-1">|</span> Vos données sont protégées
                </div>
              </form>
            </div>

          {/* Overlay Panel */}
          <div className="overlay-container">
            <div className="overlay">
              <div className="overlay-panel overlay-left">
                <h2 className="text-3xl font-black mb-4 tracking-tighter">De retour ? 👋</h2>
                <p className="text-sm font-medium opacity-90 mb-8 leading-relaxed max-w-[280px]">
                  Connectez-vous pour accéder au tableau de bord et gérer votre établissement.
                </p>
                <button 
                  className="auth-button ghost"
                  type="button" 
                  onClick={() => setView('login')}
                >
                  SE CONNECTER
                </button>
              </div>

              <div className="overlay-panel overlay-right p-10 flex flex-col justify-between text-left relative overflow-hidden bg-[#f97316]">
                  
                  {/* Top content */}
                  <div className="w-full flex-1 pr-6 relative z-10">
                      <h2 className="text-4xl font-black text-white leading-tight">
                        Ensemble,
                      </h2>
                      <h3 className="text-2xl font-black text-[#431407] mb-4 leading-tight">
                        pour la réussite de chaque élève.
                      </h3>
                      
                      <p className="text-xs font-semibold text-white/95 leading-relaxed max-w-[420px] mb-6">
                        Yziow connecte les parents, les élèves, les enseignants, et les établissements pour une communication fluide et un suivi scolaire en temps réel.
                      </p>

                      {/* 3 cards side-by-side */}
                      <div className="flex gap-4 mb-6">
                          {/* Notes */}
                          <div className="bg-white rounded-3xl p-4 flex-1 shadow-md hover:-translate-y-1 transition-transform duration-300">
                              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                                  <BarChart2 className="w-5 h-5 text-[#f97316]" />
                              </div>
                              <h4 className="text-[10px] font-black text-slate-800 leading-tight mb-1">Notes et bulletins en temps réel</h4>
                              <p className="text-[8px] text-slate-400 font-semibold leading-tight">Consultez les résultats dès leur publication.</p>
                          </div>
                          
                          {/* Présences */}
                          <div className="bg-white rounded-3xl p-4 flex-1 shadow-md hover:-translate-y-1 transition-transform duration-300">
                              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                                  <MapPin className="w-5 h-5 text-[#f97316]" />
                              </div>
                              <h4 className="text-[10px] font-black text-slate-800 leading-tight mb-1">Présences et absences instantanées</h4>
                              <p className="text-[8px] text-slate-400 font-semibold leading-tight">Soyez informé des absences, retards et présences.</p>
                          </div>

                          {/* Échanges */}
                          <div className="bg-white rounded-3xl p-4 flex-1 shadow-md hover:-translate-y-1 transition-transform duration-300">
                              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                                  <MessageSquare className="w-5 h-5 text-[#f97316]" />
                              </div>
                              <h4 className="text-[10px] font-black text-slate-800 leading-tight mb-1">Échanges simples avec l'école</h4>
                              <p className="text-[8px] text-slate-400 font-semibold leading-tight">Communiquez facilement avec les enseignants et l'administration.</p>
                          </div>
                      </div>

                      {/* Security details banner */}
                      <div className="bg-[#fff7ed] border border-orange-100/50 rounded-2xl p-3 flex justify-between items-center mb-6 max-w-[420px]">
                          <div className="flex items-center gap-2">
                              <ShieldCheck className="w-5 h-5 text-[#f97316]" />
                              <div>
                                  <h5 className="text-[9px] font-bold text-slate-800">Sécurisé</h5>
                                  <p className="text-[8px] text-slate-400">Vos données sont protégées</p>
                              </div>
                          </div>
                          <div className="w-px h-6 bg-orange-100"></div>
                          <div className="flex items-center gap-2">
                              <CheckCircle className="w-5 h-5 text-[#f97316]" />
                              <div>
                                  <h5 className="text-[9px] font-bold text-slate-800">Fiable</h5>
                                  <p className="text-[8px] text-slate-400">Informations en temps réel</p>
                              </div>
                          </div>
                          <div className="w-px h-6 bg-orange-100"></div>
                          <div className="flex items-center gap-2">
                              <Globe className="w-5 h-5 text-[#f97316]" />
                              <div>
                                  <h5 className="text-[9px] font-bold text-slate-800">Accessible partout</h5>
                                  <p className="text-[8px] text-slate-400">Mobile ou ordinateur</p>
                              </div>
                          </div>
                      </div>

                      {/* Action and family layout */}
                      <div className="flex items-center justify-between w-full relative min-h-[140px]">
                          <div className="flex flex-col w-[60%] z-10">
                              <button 
                                  type="button" 
                                  onClick={() => setView('parent-register')}
                                  className="w-full py-4 border border-white bg-white/10 hover:bg-white text-white hover:text-[#f97316] rounded-xl font-black text-xs tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg backdrop-blur-sm"
                              >
                                  <User className="w-4 h-4" /> CRÉER MON ESPACE PARENT <span className="ml-2 text-md font-bold">&gt;</span>
                              </button>
                              <p className="text-[10px] text-[#431407] font-semibold mt-2 pl-2">C'est rapide, gratuit et sécurisé.</p>
                          </div>

                          {/* Family photo position overlay */}
                          <img 
                              src={familyIllustration} 
                              alt="Famille" 
                              className="absolute bottom-[-10px] right-[-20px] w-[210px] h-[160px] object-contain z-0 pointer-events-none select-none"
                          />
                      </div>
                  </div>

                  {/* Footer Pill */}
                  <div className="w-full mt-4 relative z-10">
                      <div className="bg-[#ffedd5] rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-[10px] font-bold text-[#431407] border border-orange-100">
                          <span className="text-rose-500">❤️</span> Parce que chaque enfant mérite le meilleur suivi pour réussir. <span className="text-amber-500">⭐</span>
                      </div>
                  </div>

                </div>
              </div>
          </div>
        </div>

      )}

      {/* --- MOBILE VIEW --- */}
      {isMobile && (
        <>
            <BackgroundSlideshow />
            <div className="mobile-card">
                {onBackToLanding && (
                    <button 
                        type="button" 
                        onClick={onBackToLanding}
                        className="self-start text-xs font-bold text-slate-400 hover:text-orange-500 mb-4 flex items-center gap-1.5 transition-colors"
                    >
                        ← Retour à l'accueil
                    </button>
                )}
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
                        <div className="relative">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                            <select 
                                className="w-full h-[52px] !pl-12 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                value={selectedSchool} 
                                onChange={(e) => setSelectedSchool(e.target.value)} 
                                required
                            >
                                <option value="" disabled>-- Sélectionnez votre établissement --</option>
                                <option value="global">Accès Global (SuperAdmin)</option>
                                <option disabled>────── Établissements ──────</option>
                                {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                        
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                            <input 
                                type="text" 
                                placeholder="+33 6 12 34 56 78" 
                                className="w-full h-[52px] !pl-12 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                value={username} 
                                onChange={(e) => setUsername(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                            <input 
                                type={showPassword ? "text" : "password"} 
                                placeholder="••••••" 
                                className="w-full h-[52px] !pl-12 pr-11 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-center"
                            >
                                {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                            </button>
                        </div>

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

                    <button type="submit" disabled={loading} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-500/30 active:scale-95 transition-transform flex items-center justify-center gap-2 mt-4">
                        {loading ? T.login.loggingIn : T.login.loginButton}
                    </button>
                    
                    <button type="button" onClick={() => setView('parent-register')} className="w-full py-3 text-orange-600 bg-orange-50 border border-orange-100 text-[10px] font-black uppercase tracking-widest mt-2 rounded-2xl hover:bg-orange-100 transition-colors shadow-sm">
                        Je suis parent, Créer mon compte
                    </button>
                    
                    <button type="button" onClick={() => setView('register')} className="w-full py-2 text-orange-600 text-[10px] font-black uppercase tracking-widest mt-2">
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
