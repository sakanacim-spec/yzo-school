// ============================================================
// COMPOSANT — Inscription École (SaaS Onboarding)
// ============================================================
import React, { useState } from 'react';
import { parentApi } from '../services/parentApi';
import { User, Phone, Lock, AlertCircle, ArrowLeft, CheckCircle, Building2, GraduationCap } from 'lucide-react';

interface RegisterProps {
    onBack: () => void;
    onSuccess: (adminData: any) => void;
}

export const Register: React.FC<RegisterProps> = ({ onBack, onSuccess }) => {
    // School States
    const [schoolName, setSchoolName] = useState('');
    const [schoolType, setSchoolType] = useState('');
    
    // Admin States
    const [adminNom, setAdminNom] = useState('');
    const [adminTelephone, setAdminTelephone] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Consent States
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!schoolType) {
            setError("Veuillez sélectionner un type d'établissement.");
            return;
        }

        if (!acceptedTerms || !acceptedPrivacy) {
            setError("Vous devez accepter les conditions d'utilisation et la politique de confidentialité d'YZO.");
            return;
        }

        setLoading(true);

        try {
            const result = await parentApi.registerSchool({
                school_name: schoolName,
                school_type: schoolType,
                admin_nom: adminNom,
                admin_telephone: adminTelephone,
                admin_password: adminPassword
            });
            onSuccess(result.user);
        } catch (err: any) {
            setError(err.error || "Une erreur est survenue lors de l'inscription de l'établissement.");
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
                <h2 className="text-xl font-semibold text-white">Inscrire mon établissement</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-blue-200 mb-1.5">Nom de l'établissement</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="text"
                                value={schoolName}
                                onChange={(e) => setSchoolName(e.target.value)}
                                placeholder="Ex: Complexe Scolaire d'Excellence"
                                required
                                className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-blue-200 mb-1.5">Type d'établissement</label>
                        <div className="relative">
                            <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <select
                                value={schoolType}
                                onChange={(e) => setSchoolType(e.target.value)}
                                required
                                className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none"
                            >
                                <option value="" className="text-gray-900">-- Sélectionnez le type --</option>
                                <option value="Primaire" className="text-gray-900">École Primaire</option>
                                <option value="Collège" className="text-gray-900">Collège</option>
                                <option value="Lycée" className="text-gray-900">Lycée</option>
                                <option value="Complexe" className="text-gray-900">Complexe Scolaire (Primaire à Lycée)</option>
                            </select>
                        </div>
                    </div>

                    <div className="sm:col-span-2 border-t border-white/10 pt-2 mt-2">
                        <h3 className="text-sm font-bold text-white mb-3">Informations du Directeur</h3>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-blue-200 mb-1.5">Nom complet du Directeur</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                            <input
                                type="text"
                                value={adminNom}
                                onChange={(e) => setAdminNom(e.target.value)}
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
                                value={adminTelephone}
                                onChange={(e) => setAdminTelephone(e.target.value)}
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
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                                placeholder="Min. 6 caractères"
                                required
                                minLength={6}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="text-left w-full mt-4 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-xs font-bold text-blue-200">Conditions d'abonnement YZO School</p>
                    
                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1 accent-blue-500 rounded" required />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            J'accepte les <span className="font-bold text-white hover:underline">Conditions d'Utilisation</span> de la plateforme YZO. <span className="text-red-400">*</span>
                        </span>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} className="mt-1 accent-blue-500 rounded" required />
                        <span className="text-xs text-blue-100/80 leading-tight">
                            Je consens au traitement des données de mon établissement selon la loi IPDCP. <span className="text-red-400">*</span>
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
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 mt-2"
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            Créer mon établissement
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};
