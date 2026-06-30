import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../config';

interface ForgotPasswordProps {
    schoolSlug: string;
    onBack: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ schoolSlug, onBack }) => {
    const language = useStore((s) => s.language);
    
    // States: 1 = Enter Phone, 2 = Enter OTP & New Password
    const [step, setStep] = useState<1 | 2>(1);
    
    // Form fields
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    // Status
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, schoolSlug })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'envoi du code.');

            setStep(2);
            setSuccess('Un code à 6 chiffres a été envoyé par SMS.');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        if (newPassword.length < 6) {
            setError('Le mot de passe doit faire au moins 6 caractères.');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, schoolSlug, otp, newPassword })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erreur lors de la réinitialisation.');

            setSuccess('Mot de passe modifié avec succès ! Vous pouvez vous connecter.');
            // Go back to login after 3 seconds
            setTimeout(() => {
                onBack();
            }, 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <h2 className="text-3xl font-black mb-2 text-slate-900 tracking-tighter text-center">
                Mot de passe oublié
            </h2>
            <p className="text-sm font-medium text-slate-500 mb-8 text-center max-w-sm mx-auto">
                {step === 1 
                    ? "Entrez votre numéro de téléphone pour recevoir un code de réinitialisation par SMS."
                    : "Entrez le code reçu par SMS et choisissez votre nouveau mot de passe."}
            </p>

            {error && <div className="text-rose-500 text-xs mt-2 mb-4 font-bold max-w-sm text-center">{error}</div>}
            {success && <div className="text-emerald-500 text-xs mt-2 mb-4 font-bold max-w-sm text-center">{success}</div>}

            {step === 1 ? (
                <form onSubmit={handleSendOTP} className="w-full max-w-sm flex flex-col items-center">
                    <input 
                        type="text" 
                        placeholder="Numéro de téléphone" 
                        className="bg-slate-50 border border-slate-200 padding-3 mb-4 w-full rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 p-4" 
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value)} 
                        required 
                    />
                    <button type="submit" disabled={loading} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-500/30 active:scale-95 transition-transform">
                        {loading ? 'Envoi en cours...' : 'Envoyer le code par SMS'}
                    </button>
                    <button type="button" onClick={onBack} className="mt-4 text-xs font-bold text-slate-400 hover:text-slate-600 underline">
                        Retour à la connexion
                    </button>
                </form>
            ) : (
                <form onSubmit={handleResetPassword} className="w-full max-w-sm flex flex-col items-center">
                    <input 
                        type="text" 
                        placeholder="Code à 6 chiffres" 
                        className="bg-slate-50 border border-slate-200 padding-3 mb-4 w-full rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 p-4 tracking-widest text-center" 
                        value={otp} 
                        onChange={(e) => setOtp(e.target.value)} 
                        required 
                        maxLength={6}
                    />
                    <input 
                        type="password" 
                        placeholder="Nouveau mot de passe" 
                        className="bg-slate-50 border border-slate-200 padding-3 mb-4 w-full rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 p-4" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        required 
                        minLength={6}
                    />
                    <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/30 active:scale-95 transition-transform">
                        {loading ? 'Vérification...' : 'Valider le nouveau mot de passe'}
                    </button>
                    <button type="button" onClick={() => setStep(1)} className="mt-4 text-xs font-bold text-slate-400 hover:text-slate-600 underline">
                        Je n'ai pas reçu de code
                    </button>
                </form>
            )}
        </div>
    );
};
