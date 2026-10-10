import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { parentApi, EnrichedGlobalChild, GlobalChildAccessInfo } from '../services/parentApi';
import {
    GraduationCap, Building2, ShieldCheck, Clock, AlertCircle,
    CheckCircle2, Lock, RefreshCw, Loader2, ChevronDown, ChevronUp,
    Calendar, Info
} from 'lucide-react';

interface ParentGlobalPortfolioProps {
    className?: string;
}

export const ParentGlobalPortfolio: React.FC<ParentGlobalPortfolioProps> = ({ className = '' }) => {
    const user = useStore(s => s.user);
    const parentId = user?.id;

    const [children, setChildren] = useState<EnrichedGlobalChild[] | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<boolean>(true);

    const loadPortfolio = useCallback(async (isMounted: () => boolean) => {
        if (!parentId) {
            if (isMounted()) {
                setChildren(null);
                setError(null);
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await parentApi.getGlobalChildren();
            if (isMounted()) {
                setChildren(res.children);
                setError(null);
            }
        } catch (err: any) {
            if (isMounted()) {
                setChildren(null);
                const errMsg = err?.error === 'Non authentifié.'
                    ? 'Session expirée. Veuillez vous reconnecter.'
                    : (err?.message || 'Impossible de charger le portefeuille des enfants associés.');
                setError(errMsg);
            }
        } finally {
            if (isMounted()) {
                setLoading(false);
            }
        }
    }, [parentId]);

    useEffect(() => {
        let mounted = true;
        // Purge immédiate des données de la session précédente à chaque changement de parentId
        setChildren(null);
        setError(null);
        loadPortfolio(() => mounted);
        return () => {
            mounted = false;
        };
    }, [loadPortfolio]);

    const renderAccessBadge = (access: GlobalChildAccessInfo) => {
        switch (access.state) {
            case 'PAID_ACTIVE':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Pack actif
                    </span>
                );
            case 'GRACE_ACTIVE': {
                let formattedGraceDate: string | null = null;
                if (access.grace_expires_at) {
                    try {
                        const parsed = new Date(access.grace_expires_at);
                        if (!isNaN(parsed.getTime())) {
                            formattedGraceDate = parsed.toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                            });
                        }
                    } catch {}
                }
                return (
                    <div className="flex flex-col items-start gap-1">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            Période de grâce
                        </span>
                        {formattedGraceDate && (
                            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3 shrink-0" />
                                Fin de grâce le {formattedGraceDate}
                            </span>
                        )}
                    </div>
                );
            }
            case 'LEGACY_UNDECIDED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Situation à vérifier
                    </span>
                );
            case 'PACK_SUSPENDED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        Pack suspendu
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <section
            aria-label="Portefeuille des enfants associés"
            className={`bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-all ${className}`}
        >
            {/* En-tête du composant */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-black text-slate-900 dark:text-white text-lg">
                                Portefeuille des enfants associés
                            </h3>
                            {children !== null && !loading && (
                                <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-black rounded-full uppercase">
                                    {children.length} {children.length > 1 ? 'enfants' : 'enfant'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                            Vue consolidée des droits Parent Pack et des établissements rattachés à votre compte.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {error && (
                        <button
                            onClick={() => loadPortfolio(() => true)}
                            disabled={loading}
                            title="Réessayer"
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={() => setExpanded(v => !v)}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Masquer le portefeuille' : 'Afficher le portefeuille'}
                        className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Corps du composant conditionnel selon l'état expanded */}
            {expanded && (
                <div className="pt-2">
                    {/* État de chargement */}
                    {loading && children === null && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                            <p className="text-xs font-semibold">Chargement du portefeuille...</p>
                        </div>
                    )}

                    {/* État d'erreur */}
                    {!loading && error && (
                        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                                <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                                    {error}
                                </p>
                            </div>
                            <button
                                onClick={() => loadPortfolio(() => true)}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
                            >
                                Réessayer
                            </button>
                        </div>
                    )}

                    {/* État vide */}
                    {!loading && !error && children !== null && children.length === 0 && (
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 text-center text-slate-400 text-xs font-medium">
                            Aucun enfant associé à votre compte pour le moment.
                        </div>
                    )}

                    {/* Liste des enfants */}
                    {!loading && !error && children !== null && children.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {children.map(child => (
                                <div
                                    key={child.student_global_id}
                                    className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/80 space-y-3.5"
                                >
                                    {/* En-tête enfant (Nom complet affiché) */}
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                                                {child.display_name.charAt(0).toUpperCase()}
                                            </div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-sm">
                                                {child.display_name}
                                            </h4>
                                        </div>
                                    </div>

                                    {/* Établissements associés */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                            <span>Établissements associés</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {child.schools.map(s => (
                                                <span
                                                    key={s.school_slug}
                                                    className="inline-flex items-center px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700"
                                                >
                                                    {s.school_name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Statut Parent Pack */}
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                                            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                                            <span>Statut Parent Pack</span>
                                        </div>
                                        <div>
                                            {renderAccessBadge(child.access)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
