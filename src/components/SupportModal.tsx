import React from 'react';
import { 
    X, MessageSquare, ShieldCheck, CreditCard, 
    ArrowRight, Headset, Building2, Wallet
} from 'lucide-react';

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (role: 'administration' | 'comptabilite') => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, onSelect }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-slideUp border border-white/20">
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Headset className="w-24 h-24" />
                    </div>
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                                <MessageSquare className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight">Nouvelle discussion</h3>
                                <p className="text-blue-100 text-xs font-medium opacity-80 mt-1">Choisissez le service à contacter</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-8 space-y-4">
                    <button
                        onClick={() => onSelect('administration')}
                        className="w-full flex items-center gap-5 p-6 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-700/50 rounded-[24px] transition-all group text-left"
                    >
                        <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Building2 className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-black text-slate-800 dark:text-white text-lg mb-1 group-hover:text-blue-600 transition-colors">Administration</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">Questions générales, documents, inscriptions et vie scolaire.</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-300 group-hover:text-blue-600 group-hover:border-blue-200 transition-all">
                            <ArrowRight className="w-5 h-5" />
                        </div>
                    </button>

                    <button
                        onClick={() => onSelect('comptabilite')}
                        className="w-full flex items-center gap-5 p-6 bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-700/50 rounded-[24px] transition-all group text-left"
                    >
                        <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Wallet className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-black text-slate-800 dark:text-white text-lg mb-1 group-hover:text-emerald-600 transition-colors">Comptabilité</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">Paiements de scolarité, reçus, restes à payer et facturation.</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-300 group-hover:text-emerald-600 group-hover:border-emerald-200 transition-all">
                            <ArrowRight className="w-5 h-5" />
                        </div>
                    </button>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Votre messagerie est cryptée et sécurisée. Une réponse vous sera apportée dans les plus brefs délais par nos équipes.
                    </p>
                </div>
            </div>
        </div>
    );
};
