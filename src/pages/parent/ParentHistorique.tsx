import React, { useEffect, useState, useCallback, useRef } from 'react';
import { parentApi } from '../../services/parentApi';
import { Clock, Download, Loader2, AlertCircle, CreditCard, UserCheck, Calendar, RefreshCw, GraduationCap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { formatMontant } from '../../utils/helpers';
import { generatePaymentReceipt } from '../../utils/pdfUtils';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';
import type { Language } from '../../i18n';

export type HistoryStatus = 'loading' | 'no_children' | 'error' | 'empty' | 'has_data';

export const ParentHistorique: React.FC = () => {
    const { language, settings } = useStore();
    const user = useStore((s) => s.user);
    const [payments, setPayments] = useState<any[]>([]);
    const [presences, setPresences] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'payments' | 'presences'>('payments');
    const [status, setStatus] = useState<HistoryStatus>('loading');
    const [error, setError] = useState<string>('');
    const [partialWarning, setPartialWarning] = useState<string>('');
    const prevUserIdRef = useRef<string | undefined>(user?.id);

    const fetchAllData = useCallback(async () => {
        setStatus('loading');
        setError('');
        setPartialWarning('');

        try {
            const dash = await parentApi.getDashboard();
            const children = Array.isArray(dash?.students) ? dash.students : [];

            // A7 : Si children.length === 0, état no_children sans requêter payments/presences
            if (children.length === 0) {
                setPayments([]);
                setPresences([]);
                setStatus('no_children');
                return;
            }

            // A8 : Utiliser Promise.allSettled pour isoler les erreurs par enfant
            const [paySettled, presSettled] = await Promise.all([
                Promise.allSettled(children.map((c: any) => parentApi.getPayments(c.id))),
                Promise.allSettled(children.map((c: any) => parentApi.getPresences(c.id)))
            ]);

            const successfulPayments: any[] = [];
            let payFailures = 0;
            paySettled.forEach((res, idx) => {
                if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.payments)) {
                    const childInfo = res.value.student || children[idx];
                    res.value.payments.forEach((p: any) => {
                        successfulPayments.push({
                            ...p,
                            studentName: `${childInfo.prenom || ''} ${childInfo.nom || ''}`.trim(),
                            classe: childInfo.classe || ''
                        });
                    });
                } else {
                    payFailures++;
                }
            });

            const successfulPresences: any[] = [];
            let presFailures = 0;
            presSettled.forEach((res, idx) => {
                if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.presences)) {
                    const childInfo = children[idx];
                    res.value.presences.forEach((p: any) => {
                        successfulPresences.push({
                            ...p,
                            studentName: `${childInfo.prenom || ''} ${childInfo.nom || ''}`.trim(),
                            classe: childInfo.classe || ''
                        });
                    });
                } else {
                    presFailures++;
                }
            });

            // Ne marquer l'état comme en erreur QUE si TOUTES les requêtes échouent
            if (payFailures === children.length && presFailures === children.length) {
                const firstErr: any = paySettled.find(r => r.status === 'rejected');
                const errMsg = firstErr?.reason?.message || t(language as Language, 'parent.historyLoadError') || "Impossible de charger l'historique.";
                setError(errMsg);
                setStatus('error');
                return;
            }

            if (payFailures > 0 || presFailures > 0) {
                setPartialWarning("Certaines données n'ont pas pu être synchronisées pour certains élèves.");
            }

            successfulPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            successfulPresences.sort((a, b) => {
                const timeA = new Date(a.date + 'T' + (a.heure || '00:00')).getTime();
                const timeB = new Date(b.date + 'T' + (b.heure || '00:00')).getTime();
                return timeB - timeA;
            });

            setPayments(successfulPayments);
            setPresences(successfulPresences);

            if (successfulPayments.length === 0 && successfulPresences.length === 0) {
                setStatus('empty');
            } else {
                setStatus('has_data');
            }
        } catch (err: any) {
            console.error('[ParentHistorique] Erreur chargement:', err);
            setError(err?.message || t(language as Language, 'parent.historyLoadError') || "Impossible de charger l'historique.");
            setStatus('error');
        }
    }, [language]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    useEffect(() => {
        if (prevUserIdRef.current !== user?.id) {
            prevUserIdRef.current = user?.id;
            setPayments([]);
            setPresences([]);
            fetchAllData();
        }
    }, [user?.id, fetchAllData]);

    const downloadReceipt = async (payment: any) => {
        const studentObj = {
            nom: payment.studentName || '',
            classe: payment.classe || '',
        };
        try {
            await generatePaymentReceipt(payment, studentObj, settings, language);
        } catch (err) {
            console.error('Erreur génération reçu:', err);
        }
    };

    // État 1 : Chargement
    if (status === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-[#f97316] mb-4" />
                <p>{t(language as Language, 'parent.loadingHistory') || "Chargement de votre historique..."}</p>
            </div>
        );
    }

    // État 2 : Aucun enfant rattaché
    if (status === 'no_children') {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-[#f97316]" />
                    <h2 className="text-2xl font-bold text-slate-800">{t(language as Language, 'parent.fullHistory') || "Historique complet"}</h2>
                </div>

                <div className="bg-white rounded-3xl p-14 text-center border border-dashed border-slate-200 shadow-sm max-w-xl mx-auto my-8">
                    <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                        {t(language as Language, 'parent.noChildLinked') || "Aucun enfant rattaché"}
                    </h3>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
                        {t(language as Language, 'parent.noChildHistoryDesc') || "Aucun enfant n'est rattaché à votre compte. Aucun historique de paiement n'est disponible."}
                    </p>
                    <button
                        onClick={() => useStore.getState().setCurrentPage('parent_dashboard')}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition"
                    >
                        {t(language as Language, 'parentDashboard.parentSpace') || "Retour à l'espace parent"}
                    </button>
                </div>
            </div>
        );
    }

    // État 3 : Erreur globale (toutes requêtes échouées)
    if (status === 'error') {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-[#f97316]" />
                    <h2 className="text-2xl font-bold text-slate-800">{t(language as Language, 'parent.fullHistory') || "Historique complet"}</h2>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center max-w-lg mx-auto my-12 shadow-sm">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-red-900 mb-2">
                        {t(language as Language, 'parent.historyLoadError') || "Impossible de charger l'historique"}
                    </h3>
                    <p className="text-red-700 text-sm mb-6">{error}</p>
                    <button
                        onClick={() => fetchAllData()}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow transition"
                    >
                        <RefreshCw className="w-4 h-4" /> {t(language as Language, 'common.retry') || 'Réessayer'}
                    </button>
                </div>
            </div>
        );
    }

    // États 4 & 5 : Empty ou Has_Data (présentation des onglets et tableaux)
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-[#f97316]" />
                    <h2 className="text-2xl font-bold text-slate-800">{t(language as Language, 'parent.fullHistory') || "Historique complet"}</h2>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('payments')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'payments' ? 'bg-white text-[#f97316] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <CreditCard className="w-4 h-4" /> {t(language as Language, 'dashboard.payments') || "Paiements"}
                    </button>
                    <button
                        onClick={() => setActiveTab('presences')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'presences' ? 'bg-white text-[#f97316] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <UserCheck className="w-4 h-4" /> {t(language as Language, 'dashboard.presences') || "Présences"}
                    </button>
                </div>
            </div>

            {partialWarning && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 flex items-center gap-3 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                    <span>{partialWarning}</span>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    {activeTab === 'payments' ? (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'common.date') || "Date"}</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'parent.child') || "Enfant"}</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'payments.amount') || "Montant"}</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t(language as Language, 'common.actions') || "Action"}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {payments.length === 0 ? (
                                    <tr><td colSpan={4} className="py-12 text-center text-slate-400">{t(language as Language, 'parent.noPayment') || "Aucun paiement."}</td></tr>
                                ) : (
                                    payments.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {p.date ? format(new Date(p.date), 'dd MMM yyyy', { locale: language === 'en' ? enUS : fr }) : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{p.studentName}</div>
                                                <div className="text-xs text-slate-500">{p.classe}</div>
                                            </td>
                                            <td className="px-6 py-4 font-black text-emerald-600">
                                                {formatMontant(p.montant, useStore.getState().currency)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => downloadReceipt(p)} className="p-2 text-[#f97316] hover:bg-blue-50 rounded-xl">
                                                    <Download className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'parent.dateAndTime') || "Date & Heure"}</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'parent.child') || "Enfant"}</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t(language as Language, 'common.status') || "Statut"}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {presences.length === 0 ? (
                                    <tr><td colSpan={3} className="py-12 text-center text-slate-400">{t(language as Language, 'parent.noPresence') || "Aucun pointage."}</td></tr>
                                ) : (
                                    presences.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    {p.date ? format(new Date(p.date), 'dd MMMM', { locale: language === 'en' ? enUS : fr }) : '-'}
                                                </div>
                                                <div className="text-xs text-slate-500 ml-6">{p.heure}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{p.studentName}</div>
                                                <div className="text-xs text-slate-500">{p.classe}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${p.statut === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {p.statut === 'present' ? (t(language as Language, 'presences.atSchool') || 'À L\'ÉCOLE') : p.statut}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
