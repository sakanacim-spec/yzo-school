import React, { useState, useRef } from 'react';
import { ArrowRight, RefreshCw, AlertTriangle, UserPlus, LogIn, Upload, Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { getSortedCountries } from '../../data/countries';
import yziowLogo from '../../assets/yziow-logo.png';

export const AffiliateLogin: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);

  // Login form
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register form
  const [nom, setNom] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [country, setCountry] = useState('BJ');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/affiliate/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: phone, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('affiliate_token', data.token);
      window.location.href = '/ambassadeur/dashboard';
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPhone.length < 8) {
      setError("Le numéro de téléphone doit comporter au moins 8 chiffres.");
      return;
    }
    setLoading(true); setError('');
    try {
      const selectedCountryInfo = getSortedCountries('fr').find(c => c.code === country);
      const fullPhone = selectedCountryInfo ? `${selectedCountryInfo.dialCode} ${regPhone}` : regPhone;

      const res = await fetch(`${API_BASE_URL}/affiliate/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, telephone: fullPhone, email, password: regPassword, country, photo_url: photoBase64 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('affiliate_token', data.token);
      window.location.href = '/ambassadeur/dashboard';
    } catch (err: any) {
      setError(err.message || 'Erreur d\'inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: "url('/assets/login-bg2.jpg')" }}
    >
      {/* Overlay to make text readable */}
      <div className="absolute inset-0 bg-slate-50/85 backdrop-blur-sm"></div>

      <div className="w-full max-w-md bg-white border border-slate-100 rounded-3xl p-8 relative z-10 shadow-2xl shadow-orange-500/10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              src={yziowLogo}
              alt="Logo Yziow - Portail Ambassadeur"
              className="h-16 w-auto max-w-[200px] object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Portail Ambassadeur</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">Parrainez des écoles et gagnez des revenus récurrents.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} autoComplete="off" className="space-y-5">
            <div>
              <label htmlFor="ambassador-login-phone" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Numéro de téléphone</label>
              <input id="ambassador-login-phone" name="ambassador_login_phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="off" data-lpignore="true"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Votre numéro de téléphone" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="ambassador-login-password" className="block text-xs font-black text-slate-700 uppercase tracking-wide">Mot de passe</label>
                <button type="button" onClick={() => alert("Veuillez contacter l'administration de Yziow (support@yziow.com ou WhatsApp) pour réinitialiser votre mot de passe.")} className="text-xs font-bold text-[#f97316] hover:underline">Mot de passe oublié ?</button>
              </div>
              <div className="relative">
                <input id="ambassador-login-password" name="ambassador_login_password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" data-lpignore="true"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                  placeholder="Votre mot de passe secret" />
                <button type="button" onClick={() => setShowPassword(prev => !prev)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-orange-500 transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98]">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {loading ? "Connexion..." : "Se connecter"}
            </button>
            <p className="text-center text-sm text-slate-500 mt-6 font-medium">
              Pas encore ambassadeur ?{' '}
              <button type="button" onClick={() => setIsLogin(false)} className="text-[#f97316] font-bold hover:underline">
                Rejoignez le réseau
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} autoComplete="off" className="space-y-4">
            <div>
              <label htmlFor="ambassador-register-photo" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Photo d'identité (Optionnel)</label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoBase64 ? (
                    <img src={photoBase64} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-bold text-[#f97316] hover:underline">
                    Ajouter une photo
                  </button>
                  <p className="text-xs text-slate-500 mt-1">S'affichera dans votre tableau de bord.</p>
                </div>
                <input id="ambassador-register-photo" name="ambassador_register_photo" type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
              </div>
            </div>
            <div>
              <label htmlFor="ambassador-register-name" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Nom complet</label>
              <input id="ambassador-register-name" name="ambassador_register_name" type="text" value={nom} onChange={e => setNom(e.target.value)} required autoComplete="off" data-lpignore="true"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Ex: Jean Dupont" />
            </div>
            <div>
              <label htmlFor="ambassador-register-email" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Adresse Email</label>
              <input id="ambassador-register-email" name="ambassador_register_email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" data-lpignore="true"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Ex: jean@example.com" />
            </div>
            <div>
              <label htmlFor="ambassador-register-country" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Pays</label>
              <select id="ambassador-register-country" name="ambassador_register_country" value={country} onChange={e => setCountry(e.target.value)} required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium">
                {getSortedCountries('fr').map(c => (
                  <option key={c.code} value={c.code}>{c.name_fr}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ambassador-register-phone" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Numéro de téléphone</label>
              <div className="flex bg-slate-50 border border-slate-200 rounded-xl focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 overflow-hidden transition-all">
                <div className="bg-slate-100 px-4 flex items-center gap-2 border-r border-slate-200 font-bold text-slate-600">
                  <img src={`https://flagcdn.com/w20/${country.toLowerCase()}.png`} alt="flag" className="w-5 h-auto rounded-sm shadow-sm" />
                  <span>{getSortedCountries('fr').find(c => c.code === country)?.dialCode}</span>
                </div>
                <input id="ambassador-register-phone" name="ambassador_register_phone" type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))} required minLength={8} autoComplete="off" data-lpignore="true"
                  className="w-full bg-transparent px-4 py-3 text-slate-800 focus:outline-none font-medium"
                  placeholder="Saisissez votre numéro" />
              </div>
            </div>
            <div>
              <label htmlFor="ambassador-register-password" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Créer un mot de passe</label>
              <div className="relative">
                <input id="ambassador-register-password" name="ambassador_register_password" type={showRegPassword ? "text" : "password"} value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6} autoComplete="new-password" data-lpignore="true"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                  placeholder="Minimum 6 caractères" />
                <button type="button" onClick={() => setShowRegPassword(prev => !prev)} aria-label={showRegPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-orange-500 transition-colors">
                  {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98]">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              {loading ? "Création..." : "Devenir Ambassadeur"}
            </button>
            <p className="text-center text-sm text-slate-500 mt-6 font-medium">
              Vous avez déjà un compte ?{' '}
              <button type="button" onClick={() => setIsLogin(true)} className="text-[#f97316] font-bold hover:underline">
                Se connecter
              </button>
            </p>
          </form>
        )}
      </div>
      
      <button onClick={() => window.location.href = '/'} className="mt-8 text-slate-600 hover:text-[#f97316] text-sm font-bold flex items-center gap-2 transition-colors relative z-10">
        Retour au site principal <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};
