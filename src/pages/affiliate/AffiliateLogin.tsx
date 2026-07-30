import React, { useState } from 'react';
import { Briefcase, ArrowRight, RefreshCw, AlertTriangle, UserPlus, LogIn } from 'lucide-react';
import { API_BASE_URL } from '../../config';

export const AffiliateLogin: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  
  // Login form
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  // Register form
  const [nom, setNom] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/affiliate/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, telephone: regPhone, password: regPassword })
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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 relative z-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(37,99,235,0.3)]">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Portail Ambassadeur</h1>
          <p className="text-slate-400 mt-2 text-sm">Parrainez des écoles et gagnez des revenus récurrents.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Numéro de téléphone</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Ex: 90000000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Votre mot de passe secret" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_-4px_rgba(37,99,235,0.5)] flex items-center justify-center gap-2">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {loading ? "Connexion..." : "Se connecter"}
            </button>
            <p className="text-center text-sm text-slate-400 mt-6">
              Pas encore ambassadeur ?{' '}
              <button type="button" onClick={() => setIsLogin(false)} className="text-blue-400 font-bold hover:underline">
                Rejoignez le réseau
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Nom complet</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Ex: Jean Dupont" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Numéro de téléphone</label>
              <input type="text" value={regPhone} onChange={e => setRegPhone(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Ex: 90000000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Créer un mot de passe</label>
              <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Minimum 6 caractères" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_-4px_rgba(37,99,235,0.5)] flex items-center justify-center gap-2">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              {loading ? "Création..." : "Devenir Ambassadeur"}
            </button>
            <p className="text-center text-sm text-slate-400 mt-6">
              Vous avez déjà un compte ?{' '}
              <button type="button" onClick={() => setIsLogin(true)} className="text-blue-400 font-bold hover:underline">
                Se connecter
              </button>
            </p>
          </form>
        )}
      </div>
      
      <button onClick={() => window.location.href = '/'} className="mt-8 text-slate-500 hover:text-slate-300 text-sm flex items-center gap-2 transition-colors">
        Retour au site principal <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};
