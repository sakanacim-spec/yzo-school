import React, { useState, useRef } from 'react';
import { Briefcase, ArrowRight, RefreshCw, AlertTriangle, UserPlus, LogIn, Upload } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { getSortedCountries } from '../../data/countries';

export const AffiliateLogin: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  
  // Login form
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  // Register form
  const [nom, setNom] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [country, setCountry] = useState('BJ');
  const [photoBase64, setPhotoBase64] = useState('');
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
        body: JSON.stringify({ nom, telephone: fullPhone, password: regPassword, country, photo_url: photoBase64 })
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
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(249,115,22,0.3)]">
            <Briefcase className="w-8 h-8 text-white" />
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
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Numéro de téléphone</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Ex: 90000000" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Votre mot de passe secret" />
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
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Photo d'identité (Optionnel)</label>
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
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Nom complet</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Ex: Jean Dupont" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Pays</label>
              <select value={country} onChange={e => setCountry(e.target.value)} required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium">
                {getSortedCountries('fr').map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name_fr}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Numéro de téléphone</label>
              <div className="flex bg-slate-50 border border-slate-200 rounded-xl focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 overflow-hidden transition-all">
                <div className="bg-slate-100 px-4 flex items-center border-r border-slate-200 font-bold text-slate-600">
                  {getSortedCountries('fr').find(c => c.code === country)?.flag} {getSortedCountries('fr').find(c => c.code === country)?.dialCode}
                </div>
                <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g, ''))} required minLength={8}
                  className="w-full bg-transparent px-4 py-3 text-slate-800 focus:outline-none font-medium"
                  placeholder="Ex: 90000000" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">Créer un mot de passe</label>
              <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                placeholder="Minimum 6 caractères" />
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
