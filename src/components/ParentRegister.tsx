import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Lock, ArrowLeft, ArrowRight, Loader2, Building, CheckCircle, Eye, EyeOff, Search } from 'lucide-react';
import { parentApi, SchoolSearchResult } from '../services/parentApi';
import { t, Language, getTranslations } from '../i18n';
import { useStore } from '../store/useStore';
import { CountrySelect } from './CountrySelect';

interface ParentRegisterProps {
    schools?: { slug: string; name: string; logo_url: string }[];
    onBack: () => void;
    onSuccess: (parentData: any) => void;
}

/** Translate common French backend error messages to the user's language */
function translateBackendError(msg: string, lang: Language): string {
    if (!msg) return msg;
    const lower = msg.toLowerCase();

    if (lower.includes('établissement inconnu') || lower.includes('unknown school') || lower.includes('etablissement inconnu')) {
        const map: Partial<Record<Language, string>> = {
            fr: 'Établissement inconnu. Vérifiez le code de votre école.',
            en: 'Unknown school. Please check your school code.',
            es: 'Institución desconocida. Verifica el código de tu escuela.',
            ar: 'المدرسة غير موجودة. يرجى التحقق من رمز مدرستك.',
        };
        return map[lang] || msg;
    }
    if (msg === 'PHONE_ALREADY_EXISTS' || lower.includes('numéro de téléphone est déjà') || lower.includes('already registered') || lower.includes('phone') && lower.includes('exist')) {
        const map: Partial<Record<Language, string>> = {
            fr: 'Ce numéro de téléphone est déjà enregistré. Connectez-vous.',
            en: 'This phone number is already registered. Please log in.',
            es: 'Este número de teléfono ya está registrado. Inicia sesión.',
            ar: 'رقم الهاتف هذا مسجل مسبقاً. يرجى تسجيل الدخول.',
        };
        return map[lang] || msg;
    }
    if (lower.includes('suspendu') || lower.includes('suspended')) {
        const map: Partial<Record<Language, string>> = {
            fr: "L'établissement est suspendu.",
            en: 'This school account is suspended.',
            es: 'Esta institución está suspendida.',
            ar: 'هذه المدرسة موقوفة مؤقتاً.',
        };
        return map[lang] || msg;
    }
    if (lower.includes('mot de passe') && lower.includes('6') || lower.includes('password') && lower.includes('6')) {
        const map: Partial<Record<Language, string>> = {
            fr: 'Le mot de passe doit contenir au moins 6 caractères.',
            en: 'Password must be at least 6 characters.',
            es: 'La contraseña debe tener al menos 6 caracteres.',
            ar: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
        };
        return map[lang] || msg;
    }
    if (msg === 'COUNTRY_REQUIRED') {
        const map: Partial<Record<Language, string>> = {
            fr: 'Veuillez sélectionner le pays pour ce numéro.',
            en: 'Please select the country for this phone number.',
            es: 'Por favor seleccione el país para este número.',
            ar: 'يرجى تحديد البلد لهذا الرقم.',
        };
        return map[lang] || msg;
    }
    if (msg === 'INVALID_PHONE') {
        const map: Partial<Record<Language, string>> = {
            fr: 'Numéro de téléphone invalide.',
            en: 'Invalid phone number.',
            es: 'Número de teléfono inválido.',
            ar: 'رقم هاتف غير صالح.',
        };
        return map[lang] || msg;
    }
    return msg;
}

import { API_BASE_URL } from '../config';

export const ParentRegister: React.FC<ParentRegisterProps> = ({ onBack, onSuccess }) => {
    const { language } = useStore();
    const T = getTranslations(language);
    const isRTL = language === 'ar';

    const [isRecommendMode, setIsRecommendMode] = useState(false);
    const [requestedSchoolName, setRequestedSchoolName] = useState('');
    const [cityCountry, setCityCountry] = useState('');
    const [directorPhone, setDirectorPhone] = useState('');

    const [nom, setNom] = useState('');
    const [countryCode, setCountryCode] = useState('BJ');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [schoolSlug, setSchoolSlug] = useState('');
    const [selectedSchool, setSelectedSchool] = useState<SchoolSearchResult | null>(null);
    const [schoolSearchTerm, setSchoolSearchTerm] = useState('');
    const [schoolSuggestions, setSchoolSuggestions] = useState<SchoolSearchResult[]>([]);
    const [isSearchingSchools, setIsSearchingSchools] = useState(false);
    const [schoolSearchError, setSchoolSearchError] = useState('');
    const [hasSearchedSchools, setHasSearchedSchools] = useState(false);
    const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [errorField, setErrorField] = useState('');
    const [success, setSuccess] = useState(false);
    const [recommendSuccess, setRecommendSuccess] = useState(false);

    const schoolInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestRequestIdRef = useRef<number>(0);

    // Debounced school search
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        const trimmed = schoolSearchTerm.trim();

        if (trimmed.length < 3) {
            setSchoolSuggestions([]);
            setIsSearchingSchools(false);
            setSchoolSearchError('');
            setHasSearchedSchools(false);
            setShowSchoolDropdown(false);
            setHighlightedIndex(-1);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            return;
        }

        // Si l'utilisateur a déjà sélectionné cette école exacte, pas besoin de réinterroger l'API
        if (selectedSchool && selectedSchool.name.trim().toLowerCase() === trimmed.toLowerCase()) {
            return;
        }

        const requestId = ++latestRequestIdRef.current;

        debounceTimerRef.current = setTimeout(async () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsSearchingSchools(true);
            setSchoolSearchError('');
            setShowSchoolDropdown(true);

            try {
                const results = await parentApi.searchSchools(trimmed, controller.signal);
                // Protection stricte contre les réponses réseau obsolètes
                if (requestId !== latestRequestIdRef.current) {
                    return;
                }
                setSchoolSuggestions(results);
                setHasSearchedSchools(true);
                setHighlightedIndex(-1);
            } catch (err: any) {
                if (err.name === 'AbortError' || requestId !== latestRequestIdRef.current) {
                    // Requête annulée ou dépassée par une saisie plus récente
                    return;
                }
                console.error('Erreur recherche écoles:', err);
                setSchoolSearchError(err.error || err.message || t(language as Language, 'parent.searchError') || "Erreur de connexion lors de la recherche.");
                setSchoolSuggestions([]);
                setHasSearchedSchools(true);
            } finally {
                if (requestId === latestRequestIdRef.current) {
                    setIsSearchingSchools(false);
                }
            }
        }, 350);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [schoolSearchTerm, selectedSchool, language]);

    // Fermeture du dropdown lors d'un clic extérieur
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                schoolInputRef.current &&
                !schoolInputRef.current.contains(e.target as Node)
            ) {
                setShowSchoolDropdown(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectSchool = (school: SchoolSearchResult) => {
        // Annuler et invalider explicitement toute recherche en vol ou en attente
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        latestRequestIdRef.current++;

        setSelectedSchool(school);
        setSchoolSlug(school.slug);
        setSchoolSearchTerm(school.name);
        setShowSchoolDropdown(false);
        setSchoolSuggestions([]);
        setSchoolSearchError('');
        setIsSearchingSchools(false);
        setHasSearchedSchools(false);
        setHighlightedIndex(-1);
    };

    const handleSchoolInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === schoolSearchTerm) {
            return;
        }

        // Annulation immédiate de toute recherche en cours dès la frappe, sans attendre le debounce
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        latestRequestIdRef.current++;

        setSchoolSearchTerm(val);

        // Invalidation uniquement si la valeur est différente de l'école sélectionnée
        if (selectedSchool && val.trim().toLowerCase() !== selectedSchool.name.trim().toLowerCase()) {
            setSelectedSchool(null);
            setSchoolSlug('');
        }
    };

    const handleSchoolInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Empêche la soumission accidentelle du formulaire si le dropdown est ouvert avec un item sélectionné
            if (showSchoolDropdown && highlightedIndex >= 0 && highlightedIndex < schoolSuggestions.length) {
                e.preventDefault();
                e.stopPropagation();
                handleSelectSchool(schoolSuggestions[highlightedIndex]);
                return;
            }
            // Si le dropdown est ouvert mais aucun élément survolé, ou si l'utilisateur appuie sur Entrée pour fermer
            if (showSchoolDropdown) {
                e.preventDefault();
                setShowSchoolDropdown(false);
                return;
            }
        }

        if (!showSchoolDropdown || schoolSuggestions.length === 0) {
            if (e.key === 'ArrowDown' && schoolSearchTerm.trim().length >= 3) {
                e.preventDefault();
                setShowSchoolDropdown(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < schoolSuggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : schoolSuggestions.length - 1));
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowSchoolDropdown(false);
            setHighlightedIndex(-1);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setErrorField('');
        
        if (!selectedSchool || !schoolSlug) {
            setErrorMsg(t(language as Language, 'auth.schoolSelectRequired') || "Veuillez sélectionner votre établissement dans la liste des suggestions.");
            setErrorField('school');
            if (schoolInputRef.current) {
                schoolInputRef.current.focus();
            }
            return;
        }

        if (!acceptedTerms) {
            setErrorMsg(T.errors?.termsRequired || "Veuillez accepter les conditions d'utilisation.");
            return;
        }

        setLoading(true);
        try {
            const data = await parentApi.register({
                nom,
                telephone,
                countryCode,
                password,
                school_slug: schoolSlug,
                accepted_terms: acceptedTerms,
                accepted_privacy_policy: acceptedTerms,
                marketing_consent: false,
                parent_photo_authorization: false,
                preferred_language: language
            });
            setSuccess(true);
            setTimeout(() => onSuccess(data), 2000);
        } catch (err: any) {
            console.error('Registration error:', err);
            const rawMsg = err.error || err.message || T.errors?.genericError || "Une erreur s'est produite.";
            setErrorMsg(translateBackendError(rawMsg, language as Language));
            setErrorField(err.field || '');
        } finally {
            setLoading(false);
        }
    };

    const handleRecommendSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setErrorField('');
        if (!nom || !telephone || !requestedSchoolName) {
            setErrorMsg("Veuillez renseigner votre nom, téléphone et le nom de l'école.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/public/recommend-school`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parent_name: nom,
                    parent_phone: telephone,
                    school_name: requestedSchoolName,
                    city: cityCountry,
                    country: cityCountry,
                    director_phone: directorPhone,
                    notes: `Demandé depuis l'inscription parent.`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erreur lors de la soumission.");
            setRecommendSuccess(true);
        } catch (err: any) {
            setErrorMsg(err.message || "Impossible d'enregistrer la demande.");
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full ps-10 pe-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/50 focus:ring-2 focus:ring-blue-400 outline-none backdrop-blur-sm transition-all";
    const labelClass = "block text-sm font-semibold text-blue-100 mb-1.5";

    // Success screen for Recommendation
    if (recommendSuccess) {
        return (
            <div className="w-full h-full p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Demande enregistrée avec succès !</h2>
                <p className="text-blue-200 text-sm max-w-md leading-relaxed">
                    Merci <strong>{nom}</strong>. Notre équipe va rapidement contacter l'administration de l'établissement <strong>{requestedSchoolName}</strong> pour lui ouvrir son espace de gestion gratuit et vous permettre d'accéder au suivi de votre enfant.
                </p>
                <button
                    onClick={onBack}
                    className="mt-4 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition"
                >
                    Retour à la connexion
                </button>
            </div>
        );
    }

    // Success screen for Normal Parent Register
    if (success) {
        const successMessages = {
            fr: { title: 'Compte créé avec succès !', body: 'Vous allez être redirigé vers la connexion.' },
            en: { title: 'Account created successfully!', body: 'Redirecting you to login.' },
            es: { title: '¡Cuenta creada con éxito!', body: 'Serás redirigido al inicio de sesión.' },
            ar: { title: 'تم إنشاء الحساب بنجاح!', body: 'سيتم تحويلك إلى صفحة تسجيل الدخول.' },
        };
        const msg = successMessages[language as keyof typeof successMessages] || successMessages.fr;
        return (
            <div className="w-full h-full p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{msg.title}</h2>
                <p className="text-blue-200 text-sm">{msg.body}</p>
                <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mt-2" />
            </div>
        );
    }

    return (
        <div className="w-full h-full p-8 flex flex-col relative z-10 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onBack}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-200 hover:text-white"
                    >
                        {isRTL ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
                    </button>
                    <h2 className="text-xl font-bold text-white">
                        {isRecommendMode ? "Demander l'ouverture d'une École" : (t(language as Language, 'auth.parentRegister') || 'Inscription Parent')}
                    </h2>
                </div>

                <button
                    onClick={() => { setIsRecommendMode(!isRecommendMode); setErrorMsg(''); setErrorField(''); }}
                    className="text-xs font-bold text-amber-300 hover:text-amber-200 underline transition"
                >
                    {isRecommendMode ? "J'ai un code d'école" : "Mon école n'est pas inscrite ?"}
                </button>
            </div>

            {isRecommendMode ? (
                /* FORMULAIRE DE RECOMMANDATION ÉCOLE */
                <form onSubmit={handleRecommendSubmit} className="space-y-4 max-w-md w-full mx-auto pb-8">
                    {errorMsg && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200">
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 leading-relaxed">
                        🏫 Votre école n'est pas encore sur Yziow ? Renseignez ses informations ci-dessous. Notre équipe contactera la direction pour activer son espace et vous lier automatiquement !
                    </div>

                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                        <div>
                            <label className={labelClass}>Nom de l'établissement de votre enfant *</label>
                            <div className="relative">
                                <Building className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-300" />
                                <input
                                    type="text"
                                    required
                                    value={requestedSchoolName}
                                    onChange={e => setRequestedSchoolName(e.target.value)}
                                    placeholder="ex: Complexe Scolaire La Réussite"
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Ville & Pays de l'école</label>
                            <input
                                type="text"
                                value={cityCountry}
                                onChange={e => setCityCountry(e.target.value)}
                                placeholder="ex: Cotonou, Bénin"
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Téléphone du Directeur ou Secrétariat (Optionnel)</label>
                            <div className="relative">
                                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-300" />
                                <input
                                    type="tel"
                                    value={directorPhone}
                                    onChange={e => setDirectorPhone(e.target.value)}
                                    placeholder="ex: +229 97 00 00 00"
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <hr className="border-white/10 my-2" />

                        <div>
                            <label className={labelClass}>Votre Nom complet (Parent) *</label>
                            <div className="relative">
                                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    type="text"
                                    required
                                    value={nom}
                                    onChange={e => setNom(e.target.value)}
                                    placeholder="ex: Paul KOUASSI"
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Votre Téléphone (pour vous recontacter) *</label>
                            <div className="relative">
                                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    type="tel"
                                    required
                                    value={telephone}
                                    onChange={e => setTelephone(e.target.value)}
                                    placeholder="+229 90 00 00 00"
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !nom || !telephone || !requestedSchoolName}
                        className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Envoyer la demande d'ouverture"}
                    </button>
                </form>
            ) : (
                /* FORMULAIRE CLASSIQUE AVEC CODE ÉCOLE */
                <form onSubmit={handleSubmit} className="space-y-4 max-w-md w-full mx-auto pb-8">
                    {errorMsg && errorField !== 'telephone' && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200 flex items-center gap-2">
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                        {/* School selection with autocomplete (P26-A.2) */}
                        <div className="relative">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className={labelClass} htmlFor="school-search-input">
                                    {t(language as Language, 'auth.schoolNameLabel') || "Nom de l'établissement scolaire"} *
                                </label>
                                {selectedSchool && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                                        {t(language as Language, 'auth.schoolSelectedBadge') || "Établissement sélectionné"}
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <Building className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 z-10" />
                                <input
                                    id="school-search-input"
                                    ref={schoolInputRef}
                                    type="text"
                                    required
                                    autoComplete="off"
                                    role="combobox"
                                    aria-expanded={showSchoolDropdown}
                                    aria-autocomplete="list"
                                    aria-controls="school-suggestions-list"
                                    aria-activedescendant={
                                        showSchoolDropdown && highlightedIndex >= 0 && schoolSuggestions[highlightedIndex]
                                            ? `school-opt-${highlightedIndex}`
                                            : undefined
                                    }
                                    value={schoolSearchTerm}
                                    onChange={handleSchoolInputChange}
                                    onKeyDown={handleSchoolInputKeyDown}
                                    onFocus={() => {
                                        if (!selectedSchool && schoolSearchTerm.trim().length >= 3 && (schoolSuggestions.length > 0 || hasSearchedSchools)) {
                                            setShowSchoolDropdown(true);
                                        }
                                    }}
                                    placeholder={t(language as Language, 'auth.schoolSearchPlaceholder') || "Tapez au moins 3 lettres (ex: Sainte Félicité)..."}
                                    className={`${inputClass} !ps-11 pe-10 ${selectedSchool ? 'border-emerald-500/50 bg-emerald-950/20' : ''}`}
                                />
                                <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                    {isSearchingSchools ? (
                                        <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
                                    ) : selectedSchool ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                                    ) : (
                                        <Search className="w-4 h-4 text-blue-300/50" />
                                    )}
                                </div>
                            </div>

                            {/* Dropdown Suggestions */}
                            {!selectedSchool && showSchoolDropdown && schoolSearchTerm.trim().length >= 3 && (
                                <div
                                    ref={dropdownRef}
                                    id="school-suggestions-list"
                                    role="listbox"
                                    className="absolute start-0 end-0 mt-1.5 max-h-60 overflow-y-auto bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl z-50 custom-scrollbar divide-y divide-white/5"
                                >
                                    {isSearchingSchools && schoolSuggestions.length === 0 ? (
                                        <div className="p-4 flex items-center justify-center gap-2 text-sm text-blue-200">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                            <span>{t(language as Language, 'auth.searchingSchools') || "Recherche des établissements..."}</span>
                                        </div>
                                    ) : schoolSearchError ? (
                                        <div className="p-3 text-xs text-rose-300 bg-rose-500/10">
                                            {schoolSearchError}
                                        </div>
                                    ) : !selectedSchool && schoolSuggestions.length === 0 && hasSearchedSchools ? (
                                        <div className="p-4 text-center space-y-2">
                                            <p className="text-xs text-blue-200/80">
                                                {t(language as Language, 'auth.noSchoolFound') || "Aucun établissement trouvé pour cette recherche."}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsRecommendMode(true);
                                                    setRequestedSchoolName(schoolSearchTerm);
                                                }}
                                                className="text-xs font-bold text-amber-300 hover:text-amber-200 underline transition inline-block"
                                            >
                                                Proposer d'inscrire cette école
                                            </button>
                                        </div>
                                    ) : (
                                        schoolSuggestions.map((school, index) => {
                                            const isSelected = schoolSlug === school.slug;
                                            const isHighlighted = highlightedIndex === index;
                                            return (
                                                <div
                                                    key={school.slug}
                                                    id={`school-opt-${index}`}
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    onClick={() => handleSelectSchool(school)}
                                                    onMouseEnter={() => setHighlightedIndex(index)}
                                                    className={`p-3 text-start cursor-pointer transition-colors ${
                                                        isHighlighted
                                                            ? 'bg-blue-600/30 text-white'
                                                            : isSelected
                                                            ? 'bg-emerald-600/20 text-emerald-100'
                                                            : 'hover:bg-white/10 text-blue-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="font-semibold text-sm text-white">
                                                            {school.name}
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-blue-200/70 mt-0.5 flex items-center gap-2">
                                                        <span>📍 {[school.city, school.country].filter(Boolean).join(', ') || 'Localisation non renseignée'}</span>
                                                        {school.address && (
                                                            <span className="text-blue-200/50 truncate max-w-[180px]">• {school.address}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            <div className="mt-1">
                                <p className="text-xs text-blue-200/70">
                                    {selectedSchool
                                        ? `✅ ${selectedSchool.name} (${[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ')})`
                                        : (t(language as Language, 'auth.askCodeAdmin') || "Sélectionnez votre établissement dans la liste.")}
                                </p>
                            </div>
                            {errorMsg && errorField === 'school' && (
                                <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-200 flex items-center gap-2">
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                        </div>

                        {/* Full name */}
                        <div>
                            <label className={labelClass}>{t(language as Language, 'auth.fullNameParent') || 'Nom Complet (Parent)'}</label>
                            <div className="relative">
                                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    type="text"
                                    required
                                    value={nom}
                                    onChange={e => setNom(e.target.value)}
                                    placeholder={t(language as Language, 'auth.fullNameEx') || "ex: Koffi Kouassi"}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        {/* Phone */}
                        <div>
                            <label className={labelClass}>
                                {t(language as Language, 'auth.phone') || t(language as Language, 'auth.phoneUsedForLogin') || 'Numéro de téléphone'}
                            </label>
                            <div className="flex gap-2">
                                <CountrySelect
                                    value={countryCode}
                                    onChange={setCountryCode}
                                    short={true}
                                />
                                <div className="relative flex-1">
                                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                    <input
                                        dir="ltr"
                                        type="tel"
                                        required
                                        value={telephone}
                                        onChange={e => setTelephone(e.target.value)}
                                        placeholder="01 97 00 00 00 / +229..."
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-blue-200/70 mt-1">{t(language as Language, 'auth.phoneMustMatch') || "Le numéro doit correspondre à celui enregistré par l'école pour vos enfants."}</p>
                            {errorMsg && errorField === 'telephone' && (
                                <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-200 flex items-center gap-2">
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                        </div>

                        {/* Password with toggle (P26-A.2) */}
                        <div>
                            <label className={labelClass}>{t(language as Language, 'auth.password') || 'Mot de passe'}</label>
                            <div className="relative">
                                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    dir="ltr"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t(language as Language, 'auth.min6Chars') || "Minimum 6 caractères"}
                                    className={`${inputClass} pe-10`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? (t(language as Language, 'auth.hidePassword') || "Masquer le mot de passe") : (t(language as Language, 'auth.showPassword') || "Afficher le mot de passe")}
                                    className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-blue-300/70 hover:text-white transition-colors focus:outline-none"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>


                    <div className="flex items-start gap-3 p-4">
                        <input
                            type="checkbox"
                            id="terms"
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-white/30 bg-white/20 text-blue-500 focus:ring-blue-500/50 cursor-pointer flex-shrink-0"
                        />
                        <label htmlFor="terms" className="text-sm text-blue-200 cursor-pointer">
                            {t(language as Language, 'auth.acceptTermsAndCertify') || "J'accepte les conditions d'utilisation et certifie que ce numéro m'appartient bien."}
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !acceptedTerms}
                        className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (t(language as Language, 'auth.createParentAccount') || "Créer mon compte Parent")}
                    </button>
                </form>
            )}
        </div>
    );
};

