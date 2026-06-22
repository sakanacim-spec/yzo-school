import React, { useState, useEffect } from 'react';
import { parentApi } from '../services/parentApi';
import { User, Phone, Lock, AlertCircle, ArrowLeft, CheckCircle, Store } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface ParentRegisterProps {
  onBack: () => void;
  onSuccess: (userData: any) => void;
  schools: { slug: string; name: string }[];
}

export const ParentRegister: React.FC<ParentRegisterProps> = ({ onBack, onSuccess, schools }) => {
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [password, setPassword] = useState('');
  const [schoolSlug, setSchoolSlug] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!schoolSlug) {
      setError("Veuillez sélectionner l'établissement de votre enfant.");
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError("Vous devez accepter les conditions d'utilisation et de confidentialité.");
      return;
    }

    setLoading(true);

    try {
      const result = await parentApi.register({
        nom,
        telephone,
        password,
        school_slug: schoolSlug,
        accepted_terms: true,
        accepted_privacy_policy: true,
        marketing_consent: false,
      });
      onSuccess(result.parent);
    } catch (err: any) {
      setError(err.error || "Une erreur est survenue lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm";
  const selectClass = "w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none text-sm";
  const labelClass = "block text-xs font-semibold text-blue-200 mb-1 uppercase tracking-wide";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-full text-blue-300 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-white">Créer mon compte Parent</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Établissement */}
        <div>
          <label className={labelClass}>Établissement de l'enfant <span className="text-red-400">*</span></label>
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
            <select
              value={schoolSlug}
              onChange={(e) => setSchoolSlug(e.target.value)}
              required
              className={selectClass}
            >
              <option value="" className="text-gray-900">-- Sélectionnez l'établissement --</option>
              {schools.map(s => (
                <option key={s.slug} value={s.slug} className="text-gray-900">{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Nom Complet */}
        <div>
          <label className={labelClass}>Votre Nom Complet <span className="text-red-400">*</span></label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex: Jean Dupont"
              required
              className={inputClass}
            />
          </div>
        </div>

        {/* Téléphone */}
        <div>
          <label className={labelClass}>Numéro de Téléphone <span className="text-red-400">*</span></label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="Votre numéro de téléphone"
              required
              className={inputClass}
            />
          </div>
        </div>

        {/* Mot de passe */}
        <div>
          <label className={labelClass}>Mot de passe <span className="text-red-400">*</span></label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              required
              minLength={6}
              className={inputClass}
            />
          </div>
        </div>

        {/* Conditions */}
        <div className="space-y-2 border-t border-white/10 pt-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 accent-blue-500 rounded"
              required
            />
            <span className="text-xs text-blue-100/80 leading-tight">
              J'accepte les conditions générales d'utilisation <span className="text-red-400">*</span>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              className="mt-1 accent-blue-500 rounded"
              required
            />
            <span className="text-xs text-blue-100/80 leading-tight">
              J'accepte la politique de confidentialité concernant les données scolaires <span className="text-red-400">*</span>
            </span>
          </label>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Bouton soumettre */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {loading ? "Création en cours..." : "Créer mon compte Parent"}
        </button>
      </form>
    </div>
  );
};
