import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GraduationCap,
  ArrowLeft,
  Building2,
  Landmark,
  Radio,
  Package,
  ShieldCheck,
  CheckCircle,
  ChevronDown,
  Sparkles,
  Send,
  AlertCircle,
  FileCheck,
  Lock,
  Globe,
  ExternalLink
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PUBLIC_I18N, LANGUAGES } from '../../i18n/publicI18n';
import type { Language } from '../../i18n';
import { usePageSeo } from '../../hooks/usePageSeo';
import {
  PartnerSector,
  PartnerFormulaType,
  isRegulatedSector,
  validatePartnerForm,
  buildPartnerStructuredMessage,
  isPayloadWithinLimit,
  resolvePartnerHttpStatus
} from '../../utils/partnerApplication';

interface PartnersProps {
  onBack: () => void;
  onHome: () => void;
  onNavigate?: (page: string) => void;
  initialFormula?: 'presence' | 'visibility' | 'strategic';
}

export const Partners: React.FC<PartnersProps> = ({
  onBack,
  onHome,
  onNavigate,
  initialFormula
}) => {
  const language = useStore((state) => state.language);
  const setLanguage = useStore((state) => state.setLanguage);

  const t = useMemo(() => {
    return PUBLIC_I18N[language] || PUBLIC_I18N.fr;
  }, [language]);

  const tp = useMemo(() => {
    return t.partners || PUBLIC_I18N.fr.partners!;
  }, [t]);

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];
  const [langOpen, setLangOpen] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState<PartnerSector>('');
  const [license, setLicense] = useState('');
  const [country, setCountry] = useState('');
  const [targetMarkets, setTargetMarkets] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<PartnerFormulaType>(initialFormula || '');
  const [projectDescription, setProjectDescription] = useState('');
  const [consent, setConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error' | 'rate_limit'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const formSectionRef = useRef<HTMLDivElement>(null);

  // SEO setup
  const isArabic = language === 'ar';
  usePageSeo({
    title: `${tp.title} | YZIOW`,
    description: tp.subtitle,
    canonical: 'https://www.yziow.com/partenaires',
    ogType: 'website',
    lang: language,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: tp.title,
      description: tp.subtitle,
      url: 'https://www.yziow.com/partenaires',
      inLanguage: language,
      publisher: {
        '@type': 'Organization',
        name: 'YZIOW',
        url: 'https://www.yziow.com'
      }
    }
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Regulated sectors requiring regulatory license/accreditation
  const sectorIsRegulated = isRegulatedSector(sector);

  const handleSelectFormula = (formulaKey: 'presence' | 'visibility' | 'strategic') => {
    setSelectedFormula(formulaKey);
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePrivacyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate('privacy');
    } else {
      window.history.pushState({}, '', '/privacy');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const formData = {
      fullName,
      role,
      companyName,
      sector,
      license,
      country,
      targetMarkets,
      email,
      phone,
      website,
      selectedFormula,
      projectDescription,
      consent
    };

    // 1. Validation pure via module de production partagé
    const validation = validatePartnerForm(formData);
    if (!validation.valid) {
      setSubmitStatus('error');
      if (validation.errorField === 'email') {
        setStatusMessage(tp.form.invalidEmailError);
      } else if (validation.errorField === 'phone') {
        setStatusMessage(tp.form.invalidPhoneError);
      } else if (validation.errorField === 'website') {
        setStatusMessage(tp.form.invalidWebsiteError);
      } else if (validation.errorField === 'license') {
        setStatusMessage(tp.form.regulatedHelp);
      } else {
        setStatusMessage(tp.form.validationError);
      }
      return;
    }

    const formulaName =
      selectedFormula === 'presence'
        ? tp.formulas.presence.name
        : selectedFormula === 'visibility'
        ? tp.formulas.visibility.name
        : tp.formulas.strategic.name;

    const sectorLabel = tp.form.sectorOptions[sector as keyof typeof tp.form.sectorOptions] || sector;

    // 2. Construction structurée du message via module de production partagé
    const structuredMessage = buildPartnerStructuredMessage(formData, {
      formulaName,
      sectorLabel
    });

    // 3. Vérification stricte de la longueur (<= 5 000 car) avant tout appel réseau
    if (!isPayloadWithinLimit(structuredMessage)) {
      setSubmitStatus('error');
      setStatusMessage(tp.form.payloadTooLongError);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setStatusMessage('');

    const payloadName = `${fullName.trim()} - ${companyName.trim()}`.slice(0, 150);
    const payloadCountry = country.trim().slice(0, 100);
    const payloadEmail = email.trim().slice(0, 200);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/public/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: payloadName,
          country: payloadCountry,
          email: payloadEmail,
          message: structuredMessage
        })
      });

      const outcome = resolvePartnerHttpStatus(response.status);

      if (outcome === 'rate_limit') {
        setSubmitStatus('rate_limit');
        setStatusMessage(tp.form.rateLimitMessage);
        return;
      }

      if (outcome !== 'success' || !response.ok) {
        throw new Error('Network error');
      }

      setSubmitStatus('success');
      setStatusMessage(tp.form.successMessage);

      // Reset form fields
      setFullName('');
      setRole('');
      setCompanyName('');
      setSector('');
      setLicense('');
      setCountry('');
      setTargetMarkets('');
      setEmail('');
      setPhone('');
      setWebsite('');
      setSelectedFormula('');
      setProjectDescription('');
      setConsent(false);
    } catch {
      setSubmitStatus('error');
      setStatusMessage(tp.form.errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white flex flex-col ${
        isArabic ? 'dir-rtl' : ''
      }`}
      dir={isArabic ? 'rtl' : 'ltr'}
      lang={language}
    >
      {/* ──── STICKY HEADER ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onHome}
              className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1 group"
              aria-label="Retour à l'accueil Yziow"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-[#0f172a] tracking-tight">yziow</span>
            </button>

            {/* Fil d'Ariane épuré */}
            <nav aria-label="Fil d'Ariane" className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-400">
              <span>/</span>
              <button
                type="button"
                onClick={onHome}
                className="hover:text-slate-600 transition-colors"
              >
                {tp.breadcrumbHome}
              </button>
              <span>/</span>
              <span className="text-slate-700">{tp.breadcrumbPartners}</span>
            </nav>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* Sélecteur 9 langues */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all focus:ring-2 focus:ring-orange-500/30 outline-none"
                aria-label="Choisir la langue de l'interface"
              >
                <img
                  src={currentLang.flagUrl}
                  alt={currentLang.name}
                  className="w-5 h-auto rounded-sm shadow-sm"
                />
                <span className="text-xs font-black hidden sm:block">{currentLang.name}</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-500 transition-transform ${langOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {langOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setLangOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-in">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setLanguage(lang.code as Language);
                          setLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          language === lang.code
                            ? 'bg-orange-50 text-[#f97316] font-black'
                            : 'text-slate-600 hover:bg-slate-50 font-bold text-sm'
                        }`}
                      >
                        <img
                          src={lang.flagUrl}
                          alt={lang.name}
                          className="w-5 h-auto rounded-sm shadow-sm"
                        />
                        <span>{lang.name}</span>
                        {language === lang.code && <CheckCircle className="w-4 h-4 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors focus:ring-2 focus:ring-orange-500/30 outline-none"
            >
              <ArrowLeft className={`w-4 h-4 ${isArabic ? 'rotate-180' : ''}`} />
              <span className="hidden sm:inline">{tp.backHome}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ──── HERO SECTION ──── */}
      <section className="pt-10 pb-8 sm:pt-14 sm:pb-12 bg-gradient-to-b from-orange-50/50 via-slate-50 to-slate-50 border-b border-slate-200/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-100/80 border border-orange-200/80 text-[#ea580c] text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{tp.badge}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-4">
            {tp.title}
          </h1>

          <p className="text-base sm:text-lg text-slate-600 font-medium max-w-3xl mx-auto leading-relaxed">
            {tp.subtitle}
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-20 flex-1">
        {/* ──── SECTION 1 : CATÉGORIES ADMISSIBLES ──── */}
        <section aria-labelledby="categories-heading" className="space-y-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 id="categories-heading" className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {tp.categoriesTitle}
            </h2>
            <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed">
              {tp.categoriesSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Cat 1 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <Landmark className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {tp.categories.cat1.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                  {tp.categories.cat1.desc}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400">
                  {tp.categories.cat1.scope}
                </span>
              </div>
            </div>

            {/* Cat 2 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Radio className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {tp.categories.cat2.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                  {tp.categories.cat2.desc}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400">
                  {tp.categories.cat2.scope}
                </span>
              </div>
            </div>

            {/* Cat 3 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {tp.categories.cat3.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                  {tp.categories.cat3.desc}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400">
                  {tp.categories.cat3.scope}
                </span>
              </div>
            </div>

            {/* Cat 4 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {tp.categories.cat4.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                  {tp.categories.cat4.desc}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400">
                  {tp.categories.cat4.scope}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ──── SECTION 2 : FORMULES COMMERCIALES (SUR DEVIS) ──── */}
        <section aria-labelledby="formulas-heading" className="space-y-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 id="formulas-heading" className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {tp.formulasTitle}
            </h2>
            <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed">
              {tp.formulasSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Formule Présence */}
            <div
              className={`bg-white rounded-3xl p-7 border transition-all flex flex-col justify-between relative ${
                selectedFormula === 'presence'
                  ? 'border-orange-500 ring-2 ring-orange-500/20 shadow-lg'
                  : 'border-slate-200/80 shadow-sm hover:border-slate-300'
              }`}
            >
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-black text-slate-900">{tp.formulas.presence.name}</h3>
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                      {tp.formulas.presence.priceTag}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-orange-600 mb-3">{tp.formulas.presence.tagline}</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {tp.formulas.presence.desc}
                  </p>
                </div>

                <ul className="space-y-3 pt-4 border-t border-slate-100">
                  {tp.formulas.presence.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 font-medium">
                      <CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => handleSelectFormula('presence')}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all focus:ring-2 focus:ring-orange-500/30 outline-none ${
                    selectedFormula === 'presence'
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {tp.formulas.presence.cta}
                </button>
              </div>
            </div>

            {/* Formule Visibilité (Recommandée) */}
            <div
              className={`bg-white rounded-3xl p-7 border-2 transition-all flex flex-col justify-between relative shadow-md ${
                selectedFormula === 'visibility'
                  ? 'border-orange-500 ring-4 ring-orange-500/20'
                  : 'border-orange-400/80 hover:border-orange-500'
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 bg-gradient-to-r from-[#f97316] to-[#ea580c] text-white text-[11px] font-black uppercase tracking-wider rounded-full shadow-md">
                ⭐ Recommandé
              </div>

              <div className="space-y-6 pt-2">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-black text-slate-900">{tp.formulas.visibility.name}</h3>
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-black">
                      {tp.formulas.visibility.priceTag}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-orange-600 mb-3">{tp.formulas.visibility.tagline}</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {tp.formulas.visibility.desc}
                  </p>
                </div>

                <ul className="space-y-3 pt-4 border-t border-slate-100">
                  {tp.formulas.visibility.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 font-medium">
                      <CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => handleSelectFormula('visibility')}
                  className="w-full py-3 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-[#f97316] to-[#ea580c] hover:from-[#ea580c] hover:to-[#c2410c] text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all focus:ring-2 focus:ring-orange-500/30 outline-none"
                >
                  {tp.formulas.visibility.cta}
                </button>
              </div>
            </div>

            {/* Formule Partenaire Stratégique */}
            <div
              className={`bg-white rounded-3xl p-7 border transition-all flex flex-col justify-between relative ${
                selectedFormula === 'strategic'
                  ? 'border-orange-500 ring-2 ring-orange-500/20 shadow-lg'
                  : 'border-slate-200/80 shadow-sm hover:border-slate-300'
              }`}
            >
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-black text-slate-900">{tp.formulas.strategic.name}</h3>
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                      {tp.formulas.strategic.priceTag}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-orange-600 mb-3">{tp.formulas.strategic.tagline}</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {tp.formulas.strategic.desc}
                  </p>
                </div>

                <ul className="space-y-3 pt-4 border-t border-slate-100">
                  {tp.formulas.strategic.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 font-medium">
                      <CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8">
                <button
                  type="button"
                  onClick={() => handleSelectFormula('strategic')}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all focus:ring-2 focus:ring-orange-500/30 outline-none ${
                    selectedFormula === 'strategic'
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {tp.formulas.strategic.cta}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ──── SECTION 3 : FORMULAIRE DE CANDIDATURE ──── */}
        <section
          ref={formSectionRef}
          aria-labelledby="form-heading"
          className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-xl shadow-slate-200/40"
        >
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-black uppercase">
                <FileCheck className="w-4 h-4" />
                <span>Candidature officielle</span>
              </div>
              <h2 id="form-heading" className="text-2xl sm:text-3xl font-black text-slate-900">
                {tp.form.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                {tp.form.subtitle}
              </p>
            </div>

            {/* Messages de retour accessibles (aria-live) */}
            <div id="form-status-feedback" aria-live="polite">
              {submitStatus === 'success' && (
                <div
                  role="status"
                  className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-1"
                >
                  <div className="flex items-center gap-2 font-black text-sm">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>{tp.form.successTitle}</span>
                  </div>
                  <p className="text-xs font-medium text-emerald-700">{statusMessage}</p>
                </div>
              )}

              {(submitStatus === 'error' || submitStatus === 'rate_limit') && (
                <div
                  role="alert"
                  className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1"
                >
                  <div className="flex items-center gap-2 font-black text-sm">
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                    <span>Erreur</span>
                  </div>
                  <p className="text-xs font-medium text-rose-700">{statusMessage}</p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Ligne 1 : Représentant & Fonction */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="partner-fullname" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.fullName} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={tp.form.fullNamePlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="partner-role" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.role} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-role"
                    type="text"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder={tp.form.rolePlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>
              </div>

              {/* Ligne 2 : Entreprise & Formule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="partner-company" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.companyName} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-company"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={tp.form.companyPlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="partner-formula" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.formula} <span className="text-orange-500">*</span>
                  </label>
                  <select
                    id="partner-formula"
                    required
                    value={selectedFormula}
                    onChange={(e) => setSelectedFormula(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all text-slate-700"
                  >
                    <option value="">-- {tp.form.selectFormula} --</option>
                    <option value="presence">{tp.formulas.presence.name} (Sur devis)</option>
                    <option value="visibility">{tp.formulas.visibility.name} (Sur devis)</option>
                    <option value="strategic">{tp.formulas.strategic.name} (Sur devis)</option>
                  </select>
                </div>
              </div>

              {/* Ligne 3 : Secteur d'activité */}
              <div>
                <label htmlFor="partner-sector" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                  {tp.form.sector} <span className="text-orange-500">*</span>
                </label>
                <select
                  id="partner-sector"
                  required
                  value={sector}
                  onChange={(e) => setSector(e.target.value as any)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all text-slate-700"
                >
                  <option value="">-- {tp.form.selectSector} --</option>
                  <option value="finance">{tp.form.sectorOptions.finance}</option>
                  <option value="insurance">{tp.form.sectorOptions.insurance}</option>
                  <option value="telecom">{tp.form.sectorOptions.telecom}</option>
                  <option value="equipment">{tp.form.sectorOptions.equipment}</option>
                  <option value="transport">{tp.form.sectorOptions.transport}</option>
                  <option value="otherRegulated">{tp.form.sectorOptions.otherRegulated}</option>
                  <option value="other">{tp.form.sectorOptions.other}</option>
                </select>
              </div>

              {/* Champ conditionnel pour secteurs réglementés (Banque, Assurance, etc.) */}
              {isRegulatedSector(sector) && (
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2 animate-fade-in">
                  <label htmlFor="partner-license" className="block text-xs font-black text-amber-900 uppercase tracking-wide">
                    {tp.form.license} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-license"
                    type="text"
                    required={isRegulatedSector(sector)}
                    aria-describedby="partner-license-help"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder={tp.form.licensePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-amber-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                  <p id="partner-license-help" className="text-[11px] font-medium text-amber-700">
                    ℹ️ {tp.form.regulatedHelp}
                  </p>
                </div>
              )}

              {/* Ligne 4 : Pays d'implantation & Marchés ciblés */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="partner-country" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.country} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-country"
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder={tp.form.countryPlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="partner-markets" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.targetMarkets} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-markets"
                    type="text"
                    required
                    value={targetMarkets}
                    onChange={(e) => setTargetMarkets(e.target.value)}
                    placeholder={tp.form.targetMarketsPlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>
              </div>

              {/* Ligne 5 : Coordonnées de contact */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label htmlFor="partner-email" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.email} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tp.form.emailPlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="partner-phone" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.phone} <span className="text-orange-500">*</span>
                  </label>
                  <input
                    id="partner-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={tp.form.phonePlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="partner-website" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                    {tp.form.website}
                  </label>
                  <input
                    id="partner-website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder={tp.form.websitePlaceholder}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all"
                  />
                </div>
              </div>

              {/* Ligne 6 : Description du projet */}
              <div>
                <label htmlFor="partner-description" className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wide">
                  {tp.form.projectDescription} <span className="text-orange-500">*</span>
                </label>
                <textarea
                  id="partner-description"
                  required
                  rows={4}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder={tp.form.projectPlaceholder}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium transition-all resize-none"
                />
              </div>

              {/* Consentement obligatoire et non précoché avec lien vers /privacy */}
              <div className="pt-2">
                <label htmlFor="partner-consent" className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    id="partner-consent"
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium leading-relaxed">
                    {language === 'fr' ? (
                      <>
                        J’accepte que YZIOW utilise les informations transmises afin d’étudier ma demande et de me recontacter conformément à sa{' '}
                        <a
                          href="/privacy"
                          onClick={handlePrivacyClick}
                          className="underline hover:text-orange-600 font-bold text-slate-800"
                        >
                          politique de confidentialité
                        </a>
                        .
                      </>
                    ) : (
                      <>
                        {tp.form.consentText.split(tp.form.privacyLinkText || 'privacy policy')[0]}
                        <a
                          href="/privacy"
                          onClick={handlePrivacyClick}
                          className="underline hover:text-orange-600 font-bold text-slate-800"
                        >
                          {tp.form.privacyLinkText || 'privacy policy'}
                        </a>
                        {tp.form.consentText.split(tp.form.privacyLinkText || 'privacy policy')[1] || ''}
                      </>
                    )}
                  </span>
                </label>
              </div>

              {/* Bouton de soumission avec protection anti-double clic */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-[#f97316] to-[#ea580c] hover:from-[#ea580c] hover:to-[#c2410c] text-white rounded-2xl text-sm font-black tracking-wide shadow-xl shadow-orange-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 border border-orange-500/50 disabled:opacity-50 focus:ring-2 focus:ring-orange-500/30 outline-none cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span>{tp.form.submitting}</span>
                  ) : (
                    <>
                      <Send className={`w-4 h-4 ${isArabic ? 'rotate-180' : ''}`} />
                      <span>{tp.form.submit}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ──── SECTION 4 : ÉTHIQUE & ENGAGEMENTS DE CONFORMITÉ ──── */}
        <section aria-labelledby="ethics-heading" className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Lock className="w-5 h-5" />
            </div>
            <h2 id="ethics-heading" className="text-xl sm:text-2xl font-black text-white">
              {tp.ethics.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
            <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/60 space-y-2">
              <h3 className="font-bold text-white text-sm">🛡️ Séparation stricte des données</h3>
              <p>{tp.ethics.p1}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/60 space-y-2">
              <h3 className="font-bold text-white text-sm">🔒 Zéro accès aux données scolaires</h3>
              <p>{tp.ethics.p2}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/60 space-y-2">
              <h3 className="font-bold text-white text-sm">🏦 Rigueur financière & agréments</h3>
              <p>{tp.ethics.p3}</p>
            </div>
          </div>
        </section>
      </main>

      {/* ──── PIED DE PAGE PUBLIC STANDARD ──── */}
      <footer className="bg-slate-900 pt-16 pb-10 border-t border-slate-800 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            <div className="space-y-4">
              <button
                type="button"
                onClick={onHome}
                className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-xl p-1"
                aria-label="Retour en haut de page"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-black text-white tracking-tight">yziow</span>
              </button>
              <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xs">
                {t.footer.desc}
              </p>
            </div>

            <div>
              <h4 className="text-white font-black text-base mb-4">{t.footer.company}</h4>
              <ul className="space-y-3 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('about')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.about}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('contact')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.contact}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('careers')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.careers}
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-base mb-4">{t.footer.resources}</h4>
              <ul className="space-y-3 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('guide')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    📖 {t.footer.guide}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('blog')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    📰 {t.footer.blog || 'Blog'}
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-black text-base mb-4">{t.footer.legal}</h4>
              <ul className="space-y-3 text-xs">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('cgu')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.cgu}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('privacy')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.privacy}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('legal')}
                    className="hover:text-orange-400 font-medium transition-colors"
                  >
                    {t.footer.mentions}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
            <p>{t.footer.rights}</p>
            <p>{t.footer.madeIn}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Partners;
