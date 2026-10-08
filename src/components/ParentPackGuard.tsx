import React from 'react';
import { useStore } from '../store/useStore';
import { Lock, AlertCircle, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import type { Language } from '../i18n';

interface ParentPackGuardProps {
    studentId: string;
    children: React.ReactNode;
}

export const ParentPackGuard: React.FC<ParentPackGuardProps> = ({ studentId, children }) => {
    const { parentPackAccess, language, fetchAllFromBackend } = useStore();

    const accessInfo = parentPackAccess[studentId];

    if (!accessInfo || accessInfo.state === 'ACCESS_UNAVAILABLE') {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden p-8 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                        {t(language as Language, 'parentPack.accessUnavailable') || 'Accès temporairement indisponible'}
                    </h3>
                    <p className="text-slate-500 max-w-sm mx-auto text-sm">
                        {t(language as Language, 'parentPack.accessUnavailableDesc') || 'Une erreur technique empêche la vérification de vos droits Parent Pack. Veuillez réessayer dans quelques instants.'}
                    </p>
                </div>
                <button
                    onClick={() => fetchAllFromBackend(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                    <RefreshCw className="w-4 h-4" />
                    {t(language as Language, 'common.retry') || 'Réessayer'}
                </button>
            </div>
        );
    }

    if (accessInfo.state === 'PACK_SUSPENDED') {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-rose-100 dark:border-rose-900/30 shadow-sm overflow-hidden p-8 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center text-rose-500">
                    <Lock className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                        {t(language as Language, 'parentPack.packSuspended') || 'Pack Parent suspendu'}
                    </h3>
                    <p className="text-slate-500 max-w-sm mx-auto text-sm">
                        {t(language as Language, 'parentPack.packSuspendedDesc') || 'Les fonctionnalités Premium ne sont actuellement pas accessibles pour cet enfant. Le renouvellement du Pack Parent sera disponible depuis cet espace prochainement.'}
                    </p>
                </div>
            </div>
        );
    }

    // PAID_ACTIVE, GRACE_ACTIVE, LEGACY_UNDECIDED
    return <>{children}</>;
};
