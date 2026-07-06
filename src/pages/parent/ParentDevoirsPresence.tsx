import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import {
    BookOpen, UserCheck, Calendar, Clock,
    CheckCircle2, XCircle, AlertCircle,
    ChevronRight, FileDown, CheckSquare, Square
} from 'lucide-react';
import { format, isValid, parseISO, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { parentApi } from '../../services/parentApi';
import { t } from '../../i18n';
import type { Language } from '../../i18n';

const safeFormatDate = (dateStr: string | undefined, fmt: string, language?: Language) => {
    if (!dateStr) return t(language as Language, 'parentDevoirs.noDate') || 'Date non précisée';
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt, { locale: language === 'en' ? enUS : fr }) : t(language as Language, 'parentDevoirs.invalidDate') || 'Date invalide';
};

const parseDevoirDescription = (desc: string) => {
    if (!desc) return { cleanDesc: '', completedIds: [] as string[] };
    const marker = '\n[COMPLETED_STUDENTS]:';
    const idx = desc.indexOf(marker);
    if (idx === -1) return { cleanDesc: desc, completedIds: [] as string[] };
    const cleanDesc = desc.substring(0, idx);
    const listStr = desc.substring(idx + marker.length);
    const completedIds = listStr ? listStr.split(',').filter(Boolean) : [];
    return { cleanDesc, completedIds };
};

const getDueDateLabel = (dateStr: string | undefined, language: Language) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isValid(d)) return null;
    if (isToday(d)) return { label: t(language, 'parentDevoirs.today') || "Aujourd'hui !", color: 'text-rose-600 bg-rose-50 border-rose-200', urgent: true };
    if (isTomorrow(d)) return { label: t(language, 'parentDevoirs.tomorrow') || 'Demain', color: 'text-amber-600 bg-amber-50 border-amber-200', urgent: true };
    if (isPast(d)) return { label: t(language, 'parentDevoirs.late') || 'En retard', color: 'text-rose-700 bg-rose-100 border-rose-300', urgent: true };
    const days = differenceInDays(d, new Date());
    return { label: (t(language, 'parentDevoirs.inDays') || `Dans {{days}} jour${days > 1 ? 's' : ''}`).replace('{{days}}', days.toString()), color: 'text-slate-600 bg-slate-50 border-slate-200', urgent: false };
};

export const ParentDevoirsPresence: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'devoirs' | 'presence'>('devoirs');

    const user = useStore(s => s.user);
    const students = useStore(s => s.students);
    const devoirs = useStore(s => s.devoirs) || [];
    const presences = useStore(s => s.presences) || [];
    const { language } = useStore();

    // Filtre robuste : tous les enfants du store (déjà filtrés côté parent par le store)
    const myChildren = useMemo(() => students, [students]);

    const [selectedChildId, setSelectedChildId] = useState(myChildren[0]?.id || '');

    // Sync si les enfants arrivent après le montage
    React.useEffect(() => {
        if (!selectedChildId && myChildren.length > 0) setSelectedChildId(myChildren[0].id);
    }, [myChildren, selectedChildId]);

    const selectedChild = myChildren.find(c => c.id === selectedChildId);

    const childDevoirs = useMemo(() => {
        if (!selectedChild) return [];
        return devoirs
            .filter(d => d.classe === selectedChild.classe)
            .sort((a, b) => {
                // Trier : en retard d'abord, puis par date de rendu la plus proche
                const da = a.dateRendu ? new Date(a.dateRendu) : new Date(8640000000000000);
                const db = b.dateRendu ? new Date(b.dateRendu) : new Date(8640000000000000);
                return da.getTime() - db.getTime();
            });
    }, [devoirs, selectedChild]);

    const childPresences = useMemo(() => {
        if (!selectedChildId) return [];
        return presences
            .filter(p => p.eleveId === selectedChildId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [presences, selectedChildId]);

    // Stats présences
    const presenceStats = useMemo(() => {
        const total = childPresences.length;
        const present = childPresences.filter(p => p.statut === 'present').length;
        const absent = childPresences.filter(p => p.statut === 'absent').length;
        const retard = childPresences.filter(p => p.statut === 'retard').length;
        const tauxPresence = total > 0 ? Math.round((present / total) * 100) : 100;
        return { total, present, absent, retard, tauxPresence };
    }, [childPresences]);

    const devoirsUrgents = childDevoirs.filter(d => {
        if (!d.dateRendu) return false;
        const dObj = new Date(d.dateRendu);
        return isValid(dObj) && (isToday(dObj) || isTomorrow(dObj) || isPast(dObj));
    }).length;

    const handleToggleComplete = async (devoirId: string, completed: boolean) => {
        if (!selectedChildId) return;
        try {
            const res = await parentApi.toggleDevoirComplete(devoirId, selectedChildId, completed);
            if (res.success && res.description !== undefined) {
                const updatedDevoirs = devoirs.map(d => d.id === devoirId ? { ...d, description: res.description } : d);
                useStore.setState({ devoirs: updatedDevoirs });
            }
        } catch (err) {
            console.error("Erreur toggle complete devoir:", err);
            alert("Impossible de mettre à jour le statut du devoir.");
        }
    };

    if (!user || user.role !== 'parent') {
        return <div className="p-8 text-center text-slate-500">{t(language as Language, 'parentDevoirs.accessDenied') || 'Accès réservé aux parents.'}</div>;
    }

    return (
        <div className="space-y-6 pb-20 max-w-5xl mx-auto">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                            <BookOpen className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">{t(language as Language, 'parentDevoirs.headerTitle') || 'Devoirs & Présences'}</h2>
                            <p className="text-indigo-100 font-medium text-sm mt-0.5">{t(language as Language, 'parentDevoirs.headerSubtitle') || "Suivez le travail et l'assiduité de vos enfants"}</p>
                        </div>
                    </div>
                    {devoirsUrgents > 0 && (
                        <div className="flex items-center gap-2 bg-rose-500 px-4 py-2.5 rounded-2xl animate-pulse shadow-lg">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-black text-sm">{devoirsUrgents} {t(language as Language, 'parentDevoirs.urgentHomework') || `devoir${devoirsUrgents > 1 ? 's' : ''} urgent${devoirsUrgents > 1 ? 's' : ''} !`}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sélecteur enfant (si plusieurs) */}
            {myChildren.length > 1 && (
                <div className="flex flex-wrap gap-3">
                    {myChildren.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedChildId(c.id)}
                            className={`px-5 py-3 rounded-2xl font-bold transition-all text-sm border shadow-sm ${
                                selectedChildId === c.id
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                        >
                            {c.prenom} {c.nom}
                            <span className="text-[10px] ml-2 opacity-60">({c.classe})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Onglets */}
            <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                    onClick={() => setActiveTab('devoirs')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'devoirs'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <BookOpen className="w-4 h-4" />
                    {t(language as Language, 'parentDevoirs.tabHomework') || 'Travail à faire'}
                    {childDevoirs.length > 0 && (
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'devoirs' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                            {childDevoirs.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('presence')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'presence'
                            ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <UserCheck className="w-4 h-4" />
                    {t(language as Language, 'parentDevoirs.tabAttendance') || 'Assiduité'}
                    {presenceStats.absent + presenceStats.retard > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                            {presenceStats.absent + presenceStats.retard}
                        </span>
                    )}
                </button>
            </div>

            {/* ── Onglet Devoirs ── */}
            {activeTab === 'devoirs' && (
                <div className="space-y-4">
                    {childDevoirs.length === 0 ? (
                        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-700">
                            <CheckCircle2 className="w-14 h-14 text-emerald-300 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">{t(language as Language, 'parentDevoirs.noHomeworkTitle') || 'Aucun devoir en attente'}</h3>
                            <p className="text-sm text-slate-400">{t(language as Language, 'parentDevoirs.noHomeworkSubtitle') || 'Aucun travail à la maison enregistré pour le moment.'}</p>
                        </div>
                    ) : (
                        childDevoirs.map(d => {
                            const dueDateInfo = getDueDateLabel(d.dateRendu, language as Language);
                            const donneeDate = d.dateDonnee ? new Date(d.dateDonnee) : null;
                            const { cleanDesc, completedIds } = parseDevoirDescription(d.description);
                            const isDone = selectedChildId ? completedIds.includes(selectedChildId) : false;

                            return (
                                <div key={d.id} className={`bg-white dark:bg-slate-900 p-6 rounded-[28px] shadow-sm border transition-all hover:shadow-lg ${isDone ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/5' : dueDateInfo?.urgent ? 'border-rose-100 dark:border-rose-900/30' : 'border-slate-100 dark:border-slate-800'}`}>
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            {/* Matière + Professeur */}
                                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                                <span className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black">{d.matiere}</span>
                                                {d.professeurNom && (
                                                    <span className="text-xs font-bold text-slate-400">{t(language as Language, 'parentDevoirs.by') || 'Par'} {d.professeurNom}</span>
                                                )}
                                                {donneeDate && isValid(donneeDate) && (
                                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> {t(language as Language, 'parentDevoirs.givenOn') || 'Donné le'} {format(donneeDate, 'dd MMM', { locale: language === 'en' ? enUS : fr })}
                                                    </span>
                                                )}
                                                {isDone && (
                                                    <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3" /> {t(language as Language, 'parentDevoirs.done') || 'Fait'}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Description */}
                                            <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">{cleanDesc}</p>
                                            {/* Pièce jointe */}
                                            {d.fichierUrl && (
                                                <a
                                                    href={d.fichierUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 mt-3 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-bold transition-colors"
                                                >
                                                    <FileDown className="w-4 h-4" /> {t(language as Language, 'parentDevoirs.attachment') || 'Pièce jointe'}
                                                </a>
                                            )}
                                        </div>
                                        {/* Badge date de rendu */}
                                        {dueDateInfo && (
                                            <div className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black border ${dueDateInfo.color} ${dueDateInfo.urgent && !isDone ? 'animate-pulse' : ''}`}>
                                                <Clock className="w-4 h-4" />
                                                <div>
                                                    <div>{dueDateInfo.label}</div>
                                                    <div className="text-[10px] font-bold opacity-70 mt-0.5">
                                                        {safeFormatDate(d.dateRendu, 'dd MMM yyyy', language as Language)}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Actions parent */}
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                                        <button
                                            onClick={() => handleToggleComplete(d.id, !isDone)}
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                                                isDone
                                                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                            }`}
                                        >
                                            {isDone ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4" />}
                                            {isDone ? (t(language as Language, 'parentDevoirs.markedAsDone') || 'Marqué comme fait') : (t(language as Language, 'parentDevoirs.markAsDone') || "Marquer comme fait par l'enfant")}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── Onglet Présences ── */}
            {activeTab === 'presence' && (
                <div className="space-y-5">
                    {/* Statistiques */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: t(language as Language, 'parentDevoirs.present') || 'Présent', count: presenceStats.present, color: 'emerald', icon: <CheckCircle2 className="w-5 h-5" /> },
                            { label: t(language as Language, 'parentDevoirs.absent') || 'Absent', count: presenceStats.absent, color: 'rose', icon: <XCircle className="w-5 h-5" /> },
                            { label: t(language as Language, 'parentDevoirs.lateStat') || 'Retard', count: presenceStats.retard, color: 'amber', icon: <Clock className="w-5 h-5" /> },
                            { label: t(language as Language, 'parentDevoirs.attendanceRate') || 'Taux de présence', count: `${presenceStats.tauxPresence}%`, color: 'blue', icon: <UserCheck className="w-5 h-5" /> },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-[24px] p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-${stat.color}-100 dark:bg-${stat.color}-500/10 text-${stat.color}-600 dark:text-${stat.color}-400`}>
                                    {stat.icon}
                                </div>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.count}</p>
                                <p className="text-xs font-bold text-slate-400 mt-0.5">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Tableau des présences */}
                    <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
                        {childPresences.length > 0 ? (
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">{t(language as Language, 'common.date') || 'Date'}</th>
                                        <th className="px-6 py-4">{t(language as Language, 'common.time') || 'Heure'}</th>
                                        <th className="px-6 py-4">{t(language as Language, 'common.status') || 'Statut'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {childPresences.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 capitalize">{safeFormatDate(p.date, 'EEEE dd MMMM', language as Language)}</td>
                                            <td className="px-6 py-4 text-slate-500 font-mono font-medium">{p.heure.slice(0, 5)}</td>
                                            <td className="px-6 py-4">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${
                                                    p.statut === 'present' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                                                    p.statut === 'absent' ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' :
                                                    'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                                }`}>
                                                    {p.statut === 'present' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                                    {p.statut === 'absent' && <XCircle className="w-3.5 h-3.5" />}
                                                    {p.statut === 'retard' && <Clock className="w-3.5 h-3.5" />}
                                                    {p.statut.charAt(0).toUpperCase() + p.statut.slice(1)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-center py-16">
                                <CheckCircle2 className="w-14 h-14 text-emerald-300 mx-auto mb-4" />
                                <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">{t(language as Language, 'parentDevoirs.perfectAttendance') || 'Assiduité parfaite !'}</h3>
                                <p className="text-sm text-slate-400">{t(language as Language, 'parentDevoirs.noAbsence') || 'Aucune absence ni retard enregistré.'}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
