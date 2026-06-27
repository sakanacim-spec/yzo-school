import React, { useState } from 'react';
import { User, Phone, Lock, ArrowLeft, Loader2, Building } from 'lucide-react';
import { parentApi } from '../services/parentApi';
import { getTranslations } from '../i18n';
import { useStore } from '../store/useStore';

interface ParentRegisterProps {
    schools?: { slug: string; name: string; logo_url: string }[];
    onBack: () => void;
    onSuccess: (parentData: any) => void;
}

export const ParentRegister: React.FC<ParentRegisterProps> = ({ onBack, onSuccess }) => {
    const { language } = useStore();
    const T = getTranslations(language);

    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [schoolSlug, setSchoolSlug] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (!acceptedTerms) {
            setError((T.register as any)?.acceptTerms || "Veuillez accepter les conditions d'utilisation.");
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
                parent_photo_authorization: false
            });
            onSuccess(data);
        } catch (err: any) {
            console.error('Registration error:', err);
            setError(err.message || (T.register as any)?.error || "Une erreur s'est produite lors de la création de votre compte.");
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/50 focus:ring-2 focus:ring-blue-400 outline-none backdrop-blur-sm transition-all";
    const labelClass = "block text-sm font-semibold text-blue-100 mb-1.5";

    return (
        <div className="w-full h-full p-8 flex flex-col relative z-10 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 mb-6">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-200 hover:text-white"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-white">Inscription Parent</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-md w-full mx-auto pb-8">
                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200 flex items-center gap-2">
                        <span>{error}</span>
                    </div>
                )}

                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                    <div>
                        <label className={labelClass}>Code de l'école (School Slug)</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="text"
                                required
                                value={schoolSlug}
                                onChange={e => setSchoolSlug(e.target.value.toLowerCase().trim())}
                                placeholder="ex: mon_ecole_2025"
                                className={inputClass}
                            />
                        </div>
                        <p className="text-xs text-blue-200/70 mt-1">Demandez ce code à l'administration de votre école.</p>
                    </div>

                    <div>
                        <label className={labelClass}>Nom Complet (Parent)</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="text"
                                required
                                value={nom}
                                onChange={e => setNom(e.target.value)}
                                placeholder="ex: Koffi Kouassi"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Numéro de téléphone</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="tel"
                                required
                                pattern="[0-9+ ]+"
                                value={telephone}
                                onChange={e => setTelephone(e.target.value)}
                                placeholder="Ce numéro sera utilisé pour la connexion"
                                className={inputClass}
                            />
                        </div>
                        <p className="text-xs text-blue-200/70 mt-1">Le numéro doit correspondre à celui enregistré par l'école pour vos enfants.</p>
                    </div>

                    <div>
                        <label className={labelClass}>Mot de passe</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Minimum 6 caractères"
                                className={inputClass}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-start gap-3 p-4">
                    <input
                        type="checkbox"
                        id="terms"
                        required
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                    />
                    <label htmlFor="terms" className="text-sm text-blue-200">
                        J'accepte les conditions d'utilisation et certifie que ce numéro m'appartient bien.
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Créer mon compte Parent"}
                </button>
            </form>
        </div>
    );
};
