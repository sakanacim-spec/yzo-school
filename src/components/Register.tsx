// ============================================================
// COMPOSANT — Inscription Parent
// ============================================================
import React, { useState } from 'react';
import { parentApi } from '../services/parentApi';
import { User, Phone, Lock, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';

interface RegisterProps {
    onBack: () => void;
    onSuccess: (parent: any) => void;
}

export const Register: React.FC<RegisterProps> = ({ onBack, onSuccess }) => {
    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Consent States
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
    const [parentPhotoAuth, setParentPhotoAuth] = useState(false);
    const [marketingConsent, setMarketingConsent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!acceptedTerms || !acceptedPrivacy) {
            setError("Vous devez accepter les conditions d'utilisation et la politique de confidentialité.");
            return;
        }

        setLoading(true);

        try {
            const result = await parentApi.register({
                nom,
                telephone,
                password,
                accepted_terms: acceptedTerms,
                accepted_privacy_policy: acceptedPrivacy,
                parent_photo_authorization: parentPhotoAuth,
                marketing_consent: marketingConsent
            });
            onSuccess(result.parent);
        } catch (err: any) {
            setError(err.error || "Une erreur est survenue lors de l'inscription.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-white/10 rounded-full text-blue-300 transition"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-semibold text-white">Créer un compte parent</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-blue-200 mb-1.5">Nom complet</label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                        <input
                            type="text"
                            value={nom}
                            onChange={(e) => setNom(e.target.value)}
                            placeholder="Ex: Jean Dupont"
                            required
                            className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-blue-200 mb-1.5">Téléphone (Identifiant)</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                        <input
                            type="tel"
                            value={telephone}
                            onChange={(e) => setTelephone(e.target.value)}
                            placeholder="Ex: 90000000"
                            required
                            className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-blue-200 mb-1.5">Mot de passe</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 6 caractères"
                            required
                            minLength={6}
                            className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>

                <div className="text-left w-full mt-4 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-xs font-bold text-blue-200">Confidentialité & Protection des données (loi togolaise / IPDCP)</p>
                    
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1 accent-blue-500 rounded" required />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            J'accepte les <span className="font-bold text-white hover:underline">Conditions d'Utilisation</span> de l'application de mon établissement. <span className="text-red-400">*</span>
                        </span>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} className="mt-1 accent-blue-500 rounded" required />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            J'autorise l'établissement à traiter les <span className="font-bold text-white hover:underline">données de scolarité/présences</span> de mon enfant. <span className="text-red-400">*</span>
                        </span>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={parentPhotoAuth} onChange={(e) => setParentPhotoAuth(e.target.checked)} className="mt-1 accent-blue-500 rounded" />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            <span className="font-bold text-white">Droit à l'image</span> : J'autorise l'affichage de la photo de mon enfant. <span className="text-blue-300">(Optionnel)</span>
                        </span>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="mt-1 accent-blue-500 rounded" />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            J'accepte de recevoir des actualités et conseils d'optimisation d'YZO. <span className="text-blue-300">(Optionnel)</span>
                        </span>
                    </label>
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            S'inscrire
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};
