// ============================================================
// COMPOSANT — Inscription École (SaaS Onboarding) — INTERNATIONAL
// Supporte FR / EN, tous les pays, champs complets
// ============================================================
import React, { useState, useMemo } from 'react';
import { parentApi } from '../services/parentApi';
import {
  User, Phone, Lock, AlertCircle, ArrowLeft, CheckCircle,
  Building2, GraduationCap, Globe, MapPin, Mail, Languages
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { COUNTRIES, getSortedCountries, getCountryByCode } from '../data/countries';
import { getTranslations } from '../i18n';

interface RegisterProps {
  onBack: () => void;
  onSuccess: (adminData: any) => void;
}

export const Register: React.FC<RegisterProps> = ({ onBack, onSuccess }) => {
  const { language, setLanguage } = useStore();
  const T = getTranslations(language);
  const sortedCountries = useMemo(() => getSortedCountries(language), [language]);

  // École States
  const [schoolName, setSchoolName] = useState('');
  const [schoolType, setSchoolType] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'fr' | 'en'>(language);

  // Admin States
  const [adminNom, setAdminNom] = useState('');
  const [adminTelephone, setAdminTelephone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Consent States
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  // Quand on sélectionne un pays, on pré-remplit l'indicatif du téléphone directeur
  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    const country = getCountryByCode(code);
    if (country && !adminTelephone) {
      setAdminTelephone(country.dialCode);
    }
    if (country && !schoolPhone) {
      setSchoolPhone(country.dialCode);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!schoolType) {
      setError(T.errors.schoolTypeRequired);
      return;
    }
    if (!countryCode) {
      setError(T.errors.countryRequired);
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError(T.errors.termsRequired);
      return;
    }

    setLoading(true);

    try {
      const result = await parentApi.registerSchool({
        school_name: schoolName,
        school_type: schoolType,
        admin_nom: adminNom,
        admin_telephone: adminTelephone,
        admin_password: adminPassword,
        country: countryCode,
        city,
        address,
        phone: schoolPhone,
        email: schoolEmail,
        preferred_language: preferredLanguage,
        accepted_terms: true,
        accepted_privacy_policy: true,
        marketing_consent: false,
      });
      // Appliquer la langue choisie après inscription
      setLanguage(preferredLanguage);
      onSuccess(result.user);
    } catch (err: any) {
      setError(err.error || T.errors.genericError);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm";
  const selectClass = "w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none text-sm";
  const labelClass = "block text-xs font-semibold text-blue-200 mb-1 uppercase tracking-wide";

  return (
    <div className="space-y-4">
      {/* Header avec bouton langue */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-full text-blue-300 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-white">{T.register.title}</h2>
        </div>
        {/* Bouton bascule langue */}
        <button
          type="button"
          onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs text-white font-semibold transition"
        >
          <Languages className="w-3.5 h-3.5" />
          {language === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Section : Établissement ── */}
        <div className="border border-white/10 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {T.register.schoolInfo}
          </h3>

          {/* Nom de l'école */}
          <div>
            <label className={labelClass}>{T.register.schoolName} <span className="text-red-400">*</span></label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder={T.register.schoolNamePlaceholder}
                required
                className={inputClass}
              />
            </div>
          </div>

          {/* Type d'école + Pays (grille 2 colonnes) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{T.register.schoolType} <span className="text-red-400">*</span></label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <select
                  value={schoolType}
                  onChange={(e) => setSchoolType(e.target.value)}
                  required
                  className={selectClass}
                >
                  <option value="" className="text-gray-900">{T.register.typeSelectPlaceholder}</option>
                  <option value="Primaire" className="text-gray-900">{T.register.schoolTypePrimary}</option>
                  <option value="Collège" className="text-gray-900">{T.register.schoolTypeCollege}</option>
                  <option value="Lycée" className="text-gray-900">{T.register.schoolTypeLycee}</option>
                  <option value="Complexe" className="text-gray-900">{T.register.schoolTypeComplex}</option>
                  <option value="Université" className="text-gray-900">{T.register.schoolTypeUniversity}</option>
                  <option value="Autre" className="text-gray-900">{T.register.schoolTypeOther}</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>{T.register.country} <span className="text-red-400">*</span></label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <select
                  value={countryCode}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  required
                  className={selectClass}
                >
                  <option value="" className="text-gray-900">{T.register.countryPlaceholder}</option>
                  {sortedCountries.map(c => (
                    <option key={c.code} value={c.code} className="text-gray-900">
                      {c.flag} {language === 'en' ? c.name_en : c.name_fr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Ville + Adresse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{T.register.city}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={T.register.cityPlaceholder}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>{T.register.address}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={T.register.addressPlaceholder}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Téléphone école + Email école */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{T.register.schoolPhone}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="tel"
                  value={schoolPhone}
                  onChange={(e) => setSchoolPhone(e.target.value)}
                  placeholder={T.register.schoolPhonePlaceholder}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>{T.register.schoolEmail}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="email"
                  value={schoolEmail}
                  onChange={(e) => setSchoolEmail(e.target.value)}
                  placeholder={T.register.schoolEmailPlaceholder}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Langue préférée */}
          <div>
            <label className={labelClass}>{T.register.preferredLanguage}</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPreferredLanguage('fr')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${preferredLanguage === 'fr' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20'}`}
              >
                🇫🇷 {T.register.langFr}
              </button>
              <button
                type="button"
                onClick={() => setPreferredLanguage('en')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${preferredLanguage === 'en' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20'}`}
              >
                🇬🇧 {T.register.langEn}
              </button>
            </div>
          </div>
        </div>

        {/* ── Section : Directeur ── */}
        <div className="border border-white/10 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2">
            <User className="w-4 h-4" />
            {T.register.directorInfo}
          </h3>

          {/* Nom complet du directeur */}
          <div>
            <label className={labelClass}>{T.register.directorName} <span className="text-red-400">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
              <input
                type="text"
                value={adminNom}
                onChange={(e) => setAdminNom(e.target.value)}
                placeholder={T.register.directorNamePlaceholder}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Téléphone directeur */}
            <div>
              <label className={labelClass}>{T.register.directorPhone} <span className="text-red-400">*</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="tel"
                  value={adminTelephone}
                  onChange={(e) => setAdminTelephone(e.target.value)}
                  placeholder={T.register.directorPhonePlaceholder}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className={labelClass}>{T.register.directorPassword} <span className="text-red-400">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder={T.register.directorPasswordPlaceholder}
                  required
                  minLength={6}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Conditions ── */}
        <div className="space-y-2 border-t border-white/10 pt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 accent-blue-500 rounded"
              required
            />
            <span className="text-xs text-blue-100/80 leading-tight">
              {T.register.terms} <span className="text-red-400">*</span>
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
              {T.register.privacy} <span className="text-red-400">*</span>
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
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {T.register.creating}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              {T.register.createButton}
            </>
          )}
        </button>
      </form>
    </div>
  );
};
