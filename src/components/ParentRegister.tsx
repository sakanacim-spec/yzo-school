import React, { useState } from 'react';
import { User, Phone, Lock, ArrowLeft, ArrowRight, Loader2, Building, CheckCircle } from 'lucide-react';
import { parentApi } from '../services/parentApi';
import { t, Language, getTranslations } from '../i18n';
import { useStore } from '../store/useStore';

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
    if (lower.includes('numéro de téléphone est déjà') || lower.includes('already registered') || lower.includes('phone') && lower.includes('exist')) {
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
    const [schoolSlug, setSchoolSlug] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [recommendSuccess, setRecommendSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (!acceptedTerms) {
            setError(T.errors?.termsRequired || "Veuillez accepter les conditions d'utilisation.");
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
            setError(translateBackendError(rawMsg, language as Language));
        } finally {
            setLoading(false);
        }
    };

    const handleRecommendSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!nom || !telephone || !requestedSchoolName) {
            setError("Veuillez renseigner votre nom, téléphone et le nom de l'école.");
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
            setError(err.message || "Impossible d'enregistrer la demande.");
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
                    Merci <strong>{nom}</strong>. Notre équipe va rapidement contacter l'administration de l'établissement <strong>{requestedSchoolName}</strong> pour lui ouvrir son espace d'essai gratuit et vous permettre d'accéder au suivi de votre enfant.
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
                    onClick={() => { setIsRecommendMode(!isRecommendMode); setError(''); }}
                    className="text-xs font-bold text-amber-300 hover:text-amber-200 underline transition"
                >
                    {isRecommendMode ? "J'ai un code d'école" : "Mon école n'est pas inscrite ?"}
                </button>
            </div>

            {isRecommendMode ? (
                /* FORMULAIRE DE RECOMMANDATION ÉCOLE */
                <form onSubmit={handleRecommendSubmit} className="space-y-4 max-w-md w-full mx-auto pb-8">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200">
                            <span>{error}</span>
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
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200 flex items-center gap-2">
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                        {/* School code */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className={labelClass}>{t(language as Language, 'auth.schoolCode') || "Code Unique de l'Établissement"}</label>
                            </div>
                            <div className="relative">
                                <Building className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    dir="ltr"
                                    type="text"
                                    required
                                    value={schoolSlug}
                                    onChange={e => setSchoolSlug(e.target.value.toLowerCase().trim())}
                                    placeholder="ex: mon_ecole_2025"
                                    className={inputClass}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-blue-200/70">{t(language as Language, 'auth.askCodeAdmin') || "Demandez ce code à l'administration de votre école."}</p>
                                <button
                                    type="button"
                                    onClick={() => setIsRecommendMode(true)}
                                    className="text-xs font-bold text-amber-300 hover:underline"
                                >
                                    Pas de code ?
                                </button>
                            </div>
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
                                <select
                                    value={countryCode}
                                    onChange={(e) => setCountryCode(e.target.value)}
                                    className="bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400 px-2"
                                >
                                    <option value="BJ" className="bg-slate-900 text-white">🇧🇯 BJ</option>
                                    <option value="TG" className="bg-slate-900 text-white">🇹🇬 TG</option>
                                    <option value="CI" className="bg-slate-900 text-white">🇨🇮 CI</option>
                                    <option value="SN" className="bg-slate-900 text-white">🇸🇳 SN</option>
                                    <option value="BF" className="bg-slate-900 text-white">🇧🇫 BF</option>
                                    <option value="ML" className="bg-slate-900 text-white">🇲🇱 ML</option>
                                    <option value="NE" className="bg-slate-900 text-white">🇳🇪 NE</option>
                                    <option value="CM" className="bg-slate-900 text-white">🇨🇲 CM</option>
                                    <option value="GA" className="bg-slate-900 text-white">🇬🇦 GA</option>
                                    <option value="CG" className="bg-slate-900 text-white">🇨🇬 CG</option>
                                    <option value="CD" className="bg-slate-900 text-white">🇨🇩 CD</option>
                                    <option value="GN" className="bg-slate-900 text-white">🇬🇳 GN</option>
                                    <option value="FR" className="bg-slate-900 text-white">🇫🇷 FR</option>
                                    <option value="US" className="bg-slate-900 text-white">🇺🇸 US</option>
                                    <option value="CA" className="bg-slate-900 text-white">🇨🇦 CA</option>
                                </select>
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
                        </div>

                        {/* Password */}
                        <div>
                            <label className={labelClass}>{t(language as Language, 'auth.password') || 'Mot de passe'}</label>
                            <div className="relative">
                                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                                <input
                                    dir="ltr"
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t(language as Language, 'auth.min6Chars') || "Minimum 6 caractères"}
                                    className={inputClass}
                                />
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

