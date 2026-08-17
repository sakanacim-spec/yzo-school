import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../config';
import { t, Language } from '../i18n';
import { MessageCircle, Phone, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface ForgotPasswordProps {
    schoolSlug: string;
    onBack: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ schoolSlug, onBack }) => {
    const language = useStore((s) => s.language);
    
    // States: 1 = Enter Phone, 2 = Enter OTP & New Password
    const [step, setStep] = useState<1 | 2>(1);
    
    // Form fields
    const [countryCode, setCountryCode] = useState('BJ');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    // Status
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSendOTP = async (channel: 'whatsapp' | 'sms') => {
        if (!phone.trim()) {
            setError('Veuillez saisir votre numéro de téléphone.');
            return;
        }
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, schoolSlug, countryCode, channel })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || t(language as Language, 'auth.otpSendError') || 'Erreur lors de l\'envoi du code.');

            setStep(2);
            if (channel === 'whatsapp') {
                setSuccess('Un code à 6 chiffres a été généré pour WhatsApp.');
                if (data.otp) {
                    const waMsg = `Bonjour Support Yziow, je souhaite réinitialiser mon mot de passe pour le numéro ${phone} (Établissement: ${schoolSlug}). Mon code de vérification est : ${data.otp}`;
                    window.open(`https://wa.me/22901000000?text=${encodeURIComponent(waMsg)}`, '_blank');
                }
            } else {
                setSuccess(t(language as Language, 'auth.otpSentSuccess') || 'Un code à 6 chiffres a été envoyé par SMS.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const openWhatsAppDirectSupport = () => {
        const msg = `Bonjour Support Yziow, j'ai oublié mon mot de passe. Mon numéro est : ${phone || '____'} et mon établissement est : ${schoolSlug || 'global'}. Pouvez-vous m'aider à le réinitialiser ?`;
        window.open(`https://wa.me/22901000000?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        if (newPassword.length < 6) {
            setError(t(language as Language, 'auth.passwordLengthError') || 'Le mot de passe doit faire au moins 6 caractères.');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, schoolSlug, countryCode, otp, newPassword })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || t(language as Language, 'auth.resetError') || 'Erreur lors de la réinitialisation.');

            setSuccess(t(language as Language, 'auth.resetSuccess') || 'Mot de passe modifié avec succès ! Vous pouvez vous connecter.');
            setTimeout(() => {
                onBack();
            }, 2500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 font-sans">
            <h2 className="text-2xl sm:text-3xl font-black mb-2 text-slate-900 tracking-tighter text-center">
                {t(language as Language, 'auth.forgotPassword') || 'Mot de passe oublié'}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mb-6 text-center max-w-sm mx-auto leading-relaxed">
                {step === 1 
                    ? (t(language as Language, 'auth.forgotPasswordDesc1') || "Saisissez votre numéro de téléphone pour recevoir votre code de réinitialisation via WhatsApp ou SMS.")
                    : (t(language as Language, 'auth.forgotPasswordDesc2') || "Saisissez le code à 6 chiffres et choisissez votre nouveau mot de passe.")}
            </p>

            {error && <div className="text-rose-600 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl text-xs font-bold mb-4 max-w-sm text-center w-full">{error}</div>}
            {success && <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl text-xs font-bold mb-4 max-w-sm text-center w-full">{success}</div>}

            {step === 1 ? (
                <div className="w-full max-w-sm flex flex-col items-center space-y-3">
                    <div className="flex gap-2 w-full">
                        <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            className="bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 p-3 text-xs shadow-sm w-1/3"
                        >
                            <option value="BJ">🇧🇯 Bénin</option>
                            <option value="TG">🇹🇬 Togo</option>
                            <option value="CI">🇨🇮 C. d'Ivoire</option>
                            <option value="SN">🇸🇳 Sénégal</option>
                            <option value="BF">🇧🇫 Burkina</option>
                            <option value="ML">🇲🇱 Mali</option>
                            <option value="NE">🇳🇪 Niger</option>
                            <option value="CM">🇨🇲 Cameroun</option>
                            <option value="GA">🇬🇦 Gabon</option>
                            <option value="CG">🇨🇬 Congo</option>
                            <option value="CD">🇨🇩 RDC</option>
                            <option value="GN">🇬🇳 Guinée</option>
                            <option value="FR">🇫🇷 France</option>
                            <option value="US">🇺🇸 USA</option>
                            <option value="CA">🇨🇦 Canada</option>
                        </select>
                        <input
                            type="text"
                            placeholder={t(language as Language, 'auth.phonePlaceholder') || "Numéro de téléphone"}
                            className="bg-white border border-slate-200 w-2/3 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 p-4 text-sm shadow-sm"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                        />
                    </div>

                    {/* BOUTON 1 : WHATSAPP (VERT EMERALD) */}
                    <button 
                        type="button" 
                        onClick={() => handleSendOTP('whatsapp')} 
                        disabled={loading} 
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <MessageCircle className="w-4 h-4 fill-white" />
                        {loading ? 'Génération du code...' : 'Recevoir le code par WhatsApp'}
                    </button>

                    {/* BOUTON 2 : SMS (ORANGE YZIOW) */}
                    <button 
                        type="button" 
                        onClick={() => handleSendOTP('sms')} 
                        disabled={loading} 
                        className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Phone className="w-4 h-4" />
                        {loading ? 'Envoi du SMS...' : 'Recevoir le code par SMS'}
                    </button>

                    {/* OPTION SUPPORT WHATSAPP DIRECT */}
                    <div className="pt-3 w-full border-t border-slate-100 flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={openWhatsAppDirectSupport}
                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200/60 transition-colors"
                        >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Réinitialiser via l'Assistance WhatsApp
                        </button>

                        <button type="button" onClick={onBack} className="mt-2 text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5" />
                            {t(language as Language, 'auth.backToLogin') || 'Retour à la connexion'}
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleResetPassword} className="w-full max-w-sm flex flex-col items-center space-y-3">
                    <input 
                        type="text" 
                        placeholder={t(language as Language, 'auth.otpPlaceholder') || "Code à 6 chiffres"} 
                        className="bg-white border border-slate-200 w-full rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 p-4 tracking-widest text-center text-lg shadow-sm" 
                        value={otp} 
                        onChange={(e) => setOtp(e.target.value)} 
                        required 
                        maxLength={6}
                    />
                    <input 
                        type="password" 
                        placeholder={t(language as Language, 'auth.newPasswordPlaceholder') || "Nouveau mot de passe"} 
                        className="bg-white border border-slate-200 w-full rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 p-4 text-sm shadow-sm" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        required 
                        minLength={6}
                    />
                    <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 active:scale-95 transition-transform flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {loading ? (t(language as Language, 'auth.verifying') || 'Vérification...') : (t(language as Language, 'auth.validateNewPassword') || 'Valider le nouveau mot de passe')}
                    </button>

                    <div className="pt-2 flex flex-col items-center gap-2 w-full">
                        <button type="button" onClick={() => setStep(1)} className="text-xs font-bold text-slate-500 hover:text-slate-700 underline">
                            {t(language as Language, 'auth.didNotReceiveCode') || 'Je n\'ai pas reçu le code'}
                        </button>
                        <button type="button" onClick={openWhatsAppDirectSupport} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            Demander de l'aide sur WhatsApp
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};
