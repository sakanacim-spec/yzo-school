// ============================================================
// PAGE DE CONNEXION — Hybride PC (Sliding) / Mobile (Slideshow)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { parentApi } from '../services/parentApi';
import { LinkStudent } from './LinkStudent';
import { GraduationCap, Lock, User, Phone, CheckCircle, Store } from 'lucide-react';
import { API_BASE_URL } from '../config';

// ── Images de fond (Mobile uniquement) ──
import bgImage1 from '../assets/login-bg1.jpg';
import bgImage2 from '../assets/login-bg2.jpg';
import bgImage3 from '../assets/login-bg3.jpg';
import bgImage4 from '../assets/login-bg4.jpg';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { Register } from './Register';
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
  const appName = "Ysiow";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState<'login' | 'register' | 'link'>('login');

  
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

  if (view === 'register') {
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

  return (
    <div className="min-h-screen flex items-center justify-center font-['Poppins'] overflow-hidden bg-white relative">
      <style>{`
        /* ──── DESKTOP SLIDING OVERLAY ──── */
        .auth-container {
          background-color: #fff;
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
          position: relative;
          overflow: hidden;
          width: 850px;
          max-width: 100%;
          min-height: 550px;
          z-index: 10;
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
          background: linear-gradient(135deg, #fbbf24 0%, #eab308 100%);
          color: #FFFFFF; position: relative; left: -100%; height: 100%; width: 200%;
          transform: translateX(0); transition: transform 0.6s cubic-bezier(0.7, 0, 0.3, 1);
        }
        .auth-container.right-panel-active .overlay { transform: translateX(50%); }

        .overlay-panel {
          position: absolute; display: flex; align-items: center; justify-content: center;
          flex-direction: column; padding: 0 50px; text-align: center; top: 0; height: 100%; width: 50%;
          transform: translateX(0); transition: transform 0.6s cubic-bezier(0.7, 0, 0.3, 1);
        }
        .overlay-left { transform: translateX(-20%); }
        .auth-container.right-panel-active .overlay-left { transform: translateX(0); }
        .overlay-right { right: 0; transform: translateX(0); }
        .auth-container.right-panel-active .overlay-right { transform: translateX(20%); }

        .auth-form {
          background-color: #FFFFFF; display: flex; align-items: center; justify-content: center;
          flex-direction: column; padding: 0 50px; height: 100%; text-align: center;
        }

        .auth-input {
          background-color: #f8fafc; border: 1px solid #f1f5f9; padding: 12px 15px; margin: 8px 0;
          width: 100%; border-radius: 12px; font-size: 14px; focus:outline-none focus:ring-2 focus:ring-amber-400;
        }

        .auth-button {
          border-radius: 12px; border: 1px solid #eab308; background-color: #eab308; color: #FFFFFF;
          font-size: 12px; font-weight: bold; padding: 12px 45px; letter-spacing: 1px;
          text-transform: uppercase; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; margin-top: 15px;
        }
        .auth-button:active { transform: scale(0.95); }
        .auth-button.ghost { background-color: transparent; border-color: #FFFFFF; }

        .social-container { margin: 15px 0; }
        .social-container a {
          border: 1px solid #e2e8f0; border-radius: 50%; display: inline-flex; justify-content: center;
          align-items: center; margin: 0 5px; height: 38px; width: 38px; color: #1e293b; transition: all 0.3s;
        }
        .social-container a:hover { background: #f1f5f9; border-color: #eab308; color: #eab308; }

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
        <div className="auth-container">


          {/* Login Panel */}
          <div className="form-container sign-in-container">
            <form className="auth-form" onSubmit={handleAuth}>
              <SchoolLogo />
              <h1 className="text-2xl font-black text-slate-900 tracking-tighter">{T.login.title}</h1>
              <div className="social-container text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-2">{T.login.subtitle}</div>
              
              <select className="auth-input mb-4 font-bold text-slate-600 border border-slate-200" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
                  <option value="" disabled>-- Sélectionnez votre école --</option>
                  <option value="global">Accès Global (SuperAdmin)</option>
                  <option disabled>────── Établissements ──────</option>
                  {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>

              <input type="text" placeholder={T.login.phonePlaceholder} className="auth-input max-w-sm mx-auto" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input type="password" placeholder={T.login.passwordPlaceholder} className="auth-input max-w-sm mx-auto" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <div className="flex items-center justify-between w-full max-w-sm mx-auto mt-2 text-xs px-1">
                <a href="#" className="text-slate-400 hover:text-amber-600">{T.login.forgotPassword}</a>

                <button 
                  type="button" 
                  onClick={() => setIsPrivacyOpen(true)}
                  className="text-slate-400 hover:text-amber-600 underline cursor-pointer"
                >
                  Confidentialité & Données
                </button>
              </div>
              {trialExpiredSchool && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                  <p className="text-amber-800 font-bold text-xs">⏰ Période d'essai expirée</p>
                  <p className="text-amber-700 text-xs mt-1">"{trialExpiredSchool}" doit régler son abonnement. Contactez l'administrateur de la plateforme.</p>
                </div>
              )}
              {error && <div className="text-rose-500 text-xs mt-2 font-bold max-w-sm mx-auto">{error}</div>}
              <div className="max-w-sm mx-auto w-full flex flex-col items-center">
                <button className="auth-button w-full mb-3" type="submit" disabled={loading}>{loading ? T.login.loggingIn : T.login.loginButton}</button>
              </div>
            </form>
          </div>

          {/* Overlay Panel */}
          <div className="overlay-container">
            <div className="overlay">
              <div className="overlay-panel overlay-right">
                <h2 className="text-3xl font-black mb-4 tracking-tighter">Bonjour, Parent ! 🌟</h2>
                <p className="text-sm font-medium opacity-90 mb-8 leading-relaxed max-w-[280px]">
                  Plongez au cœur de l'éducation de votre enfant. Suivez chaque instant de sa réussite avec nous.
                </p>
                <div className="text-left text-xs space-y-3 mb-8 bg-white/10 p-5 rounded-2xl backdrop-blur-sm border border-white/20">
                   <p className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-white rounded-full"></div> Suivi des notes en temps réel</p>
                   <p className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-white rounded-full"></div> Notifications de présence</p>
                   <p className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-white rounded-full"></div> Communication école-famille</p>
                </div>
                <button 
                  className="auth-button ghost"
                  type="button" 
                  onClick={() => setView('register')}
                >
                  CRÉER UN COMPTE
                </button>
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
                            <select className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 appearance-none" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} required>
                                <option value="" disabled>-- Sélectionnez votre école --</option>
                                <option value="global">Accès Global (SuperAdmin)</option>
                                <option disabled>────── Établissements ──────</option>
                                {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                            </select>
                    </div>

                      <div className="flex justify-between items-center px-1 text-[11px] mt-1">

                        <a href="#" className="text-slate-400 hover:text-amber-600">Mot de passe oublié ?</a>
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
