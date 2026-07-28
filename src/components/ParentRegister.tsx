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

export const ParentRegister: React.FC<ParentRegisterProps> = ({ onBack, onSuccess }) => {
    const { language } = useStore();
    const T = getTranslations(language);
    const isRTL = language === 'ar';

    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [schoolSlug, setSchoolSlug] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

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
                password,
                school_slug: schoolSlug,
                accepted_terms: acceptedTerms,
                accepted_privacy_policy: acceptedTerms,
                marketing_consent: false,
                parent_photo_authorization: false,
                preferred_language: language
            });
            setSuccess(true);
            // Give user time to read success message, then proceed
            setTimeout(() => onSuccess(data), 2000);
        } catch (err: any) {
            console.error('Registration error:', err);
            const rawMsg = err.error || err.message || T.errors?.genericError || "Une erreur s'est produite.";
            setError(translateBackendError(rawMsg, language as Language));
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full ps-10 pe-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/50 focus:ring-2 focus:ring-blue-400 outline-none backdrop-blur-sm transition-all";
    const labelClass = "block text-sm font-semibold text-blue-100 mb-1.5";

    // Success screen
    if (success) {
        const successMessages: Partial<Record<Language, { title: string; body: string }>> = {
            fr: { title: 'Compte créé avec succès !', body: 'Vous allez être redirigé vers la connexion.' },
            en: { title: 'Account created successfully!', body: 'Redirecting you to login.' },
            es: { title: '¡Cuenta creada con éxito!', body: 'Serás redirigido al inicio de sesión.' },
            ar: { title: 'تم إنشاء الحساب بنجاح!', body: 'سيتم تحويلك إلى صفحة تسجيل الدخول.' },
        };
        const msg = successMessages[language as Language] || successMessages.fr;
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
            <div className="flex items-center gap-3 mb-6">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-200 hover:text-white"
                >
                    {/* Arrow direction adapts to RTL */}
                    {isRTL
                        ? <ArrowRight className="w-5 h-5" />
                        : <ArrowLeft className="w-5 h-5" />
                    }
                </button>
                <h2 className="text-xl font-bold text-white">{t(language as Language, 'auth.parentRegister') || 'Inscription Parent'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-md w-full mx-auto pb-8">
                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200 flex items-center gap-2">
                        <span>{error}</span>
                    </div>
                )}

                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                    {/* School code — always LTR (ASCII codes) */}
                    <div>
                        <label className={labelClass}>{t(language as Language, 'auth.schoolCode') || "Code de l'école (School Slug)"}</label>
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
                        <p className="text-xs text-blue-200/70 mt-1">{t(language as Language, 'auth.askCodeAdmin') || "Demandez ce code à l'administration de votre école."}</p>
                    </div>

                    {/* Full name — RTL-aware (accepts Arabic names) */}
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

                    {/* Phone — always LTR (phone numbers are LTR even in Arabic) */}
                    <div>
                        <label className={labelClass}>
                            {t(language as Language, 'auth.phone') || t(language as Language, 'auth.phoneUsedForLogin') || 'Numéro de téléphone'}
                        </label>
                        <div className="relative">
                            <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                dir="ltr"
                                type="tel"
                                required
                                value={telephone}
                                onChange={e => setTelephone(e.target.value)}
                                placeholder="+22690000000"
                                className={inputClass}
                            />
                        </div>
                        <p className="text-xs text-blue-200/70 mt-1">{t(language as Language, 'auth.phoneMustMatch') || "Le numéro doit correspondre à celui enregistré par l'école pour vos enfants."}</p>
                    </div>

                    {/* Password — always LTR */}
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
        </div>
    );
};
