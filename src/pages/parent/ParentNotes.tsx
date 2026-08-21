import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { parentApi } from '../../services/parentApi';
import {
    GraduationCap, BookOpen, Clock, FileText,
    ChevronRight, AlertCircle, Loader2, Search,
    Calendar, Download, TrendingUp, Star
} from 'lucide-react';
import { generateGradeReport } from '../../utils/pdfUtils';
import { PeriodeType, DEFAULT_EVAL_CONFIGS } from '../../types';
import { t } from '../../i18n';
import type { Language } from '../../i18n';

// ── Appréciation ─────────────────────────────────────────────
const getAppreciation = (avg: number | null, language: Language): { label: string; color: string } => {
    if (avg === null) return { label: '—', color: 'text-slate-400' };
    if (avg >= 18) return { label: t(language, 'parentNotes.appreciation.excellent') || 'Excellent', color: 'text-emerald-600' };
    if (avg >= 16) return { label: t(language, 'parentNotes.appreciation.veryGood') || 'Très Bien', color: 'text-emerald-500' };
    if (avg >= 14) return { label: t(language, 'parentNotes.appreciation.good') || 'Bien', color: 'text-blue-600' };
    if (avg >= 12) return { label: t(language, 'parentNotes.appreciation.satisfactory') || 'Assez Bien', color: 'text-blue-500' };
    if (avg >= 10) return { label: t(language, 'parentNotes.appreciation.passable') || 'Passable', color: 'text-amber-600' };
    if (avg >= 8)  return { label: t(language, 'parentNotes.appreciation.insufficient') || 'Insuffisant', color: 'text-orange-600' };
    return { label: t(language, 'parentNotes.appreciation.veryInsufficient') || 'Très Insuffisant', color: 'text-rose-600' };
};

export const ParentNotes: React.FC = () => {
    const { language } = useStore();
    const { notes, matieres, classeMatieres, students: children, settings } = useStore();
    const storedEvalConfigs = useStore(s => s.settings?.evalConfigs);
    const evalConfigs = (storedEvalConfigs && storedEvalConfigs.length > 0) ? storedEvalConfigs : DEFAULT_EVAL_CONFIGS;
    const activeConfigs = evalConfigs.filter(c => c.enabled);

    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        if (children.length > 0 && !selectedChildId) {
            setSelectedChildId(children[0].id);
        }
    }, [children, selectedChildId]);

    // Si le store est vide, charger via API
    useEffect(() => {
        if (notes.length === 0 && children.length > 0) {
            setLoadingData(true);
            parentApi.getDashboard()
                .then(data => { if (data.students) useStore.setState({ students: data.students }); })
                .catch(() => {})
                .finally(() => setLoadingData(false));
        }
    }, [notes.length, children.length]);

    const selectedChild = children.find(c => c.id === selectedChildId);

    if (children.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-12 text-center border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t(language as Language, 'parentNotes.noLinkedChild') || 'Aucun enfant lié'}</h3>
                <p className="text-slate-500 max-w-sm mx-auto">{t(language as Language, 'parentNotes.noLinkedChildDesc') || 'Liez vos enfants depuis le tableau de bord pour voir leurs résultats scolaires.'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-[32px] p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                            <GraduationCap className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">{t(language as Language, 'parentNotes.title') || 'Relevé de Notes'}</h2>
                            <p className="text-amber-100 font-medium text-sm mt-0.5">{t(language as Language, 'parentNotes.subtitle') || 'Résultats scolaires en temps réel'}</p>
                        </div>
                    </div>
                    {loadingData && (
                        <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-bold">{t(language as Language, 'parentNotes.updating') || 'Actualisation...'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sélecteur d'enfant */}
            <div className="flex flex-wrap gap-3">
                {children.map(child => (
                    <button
                        key={child.id}
                        onClick={() => setSelectedChildId(child.id)}
                        className={`px-6 py-4 rounded-2xl font-bold transition-all flex items-center gap-3 shadow-sm border ${
                            selectedChildId === child.id
                            ? 'bg-[#f97316] text-white border-[#f97316] shadow-orange-100'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:border-orange-300'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedChildId === child.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                            <FileText className="w-4 h-4" />
                        </div>
                        <span>{child.prenom} {child.nom}</span>
                        <span className="text-[10px] opacity-60 bg-black/10 px-2 py-0.5 rounded-full">{child.classe}</span>
                    </button>
                ))}
            </div>

            {/* Notes par période */}
            {selectedChild && (
                <div className="space-y-12">
                    {(selectedChild.cycle === 'Lycée'
                        ? (['SEMESTRE 1', 'SEMESTRE 2'] as PeriodeType[])
                        : (['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3'] as PeriodeType[])
                    ).map(periode => {
                        const childClasseMatieres = classeMatieres.filter(cm => cm.classe === selectedChild.classe);
                        const childNotesPeriode = notes.filter(n => n.eleveId === selectedChild.id && n.periode === periode);

                        if (childClasseMatieres.length === 0) return null;

                        const hasNotes = childNotesPeriode.some(n =>
                            activeConfigs.some(cfg => (n as any)[cfg.id] !== null && (n as any)[cfg.id] !== undefined)
                        );

                        // Calcul moyenne générale de la période
                        const notesAvg = childClasseMatieres.map(cm => {
                            const note = childNotesPeriode.find(n => n.matiereId === cm.matiereId);
                            if (!note) return null;
                            const vals = activeConfigs.map(cfg => (note as any)[cfg.id]).filter(v => v !== null && v !== undefined) as number[];
                            if (vals.length === 0) return null;
                            return vals.reduce((a, b) => a + b, 0) / vals.length;
                        }).filter(v => v !== null) as number[];

                        const periodeAvg = notesAvg.length > 0 ? notesAvg.reduce((a, b) => a + b, 0) / notesAvg.length : null;
                        const periodeApprec = getAppreciation(periodeAvg, language as Language);

                        return (
                            <section key={periode} className="animate-fadeIn">
                                {/* Séparateur période */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 px-6 py-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                            <Calendar className="w-4 h-4 text-slate-500" />
                                            <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{periode}</h3>
                                        </div>
                                        {periodeAvg !== null && (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                                                <span className={`text-sm font-black ${periodeApprec.color}`}>{periodeAvg.toFixed(2)}/20</span>
                                                <span className={`text-[10px] font-bold ${periodeApprec.color}`}>{periodeApprec.label}</span>
                                            </div>
                                        )}
                                        {hasNotes && (
                                            <button
                                                onClick={() => generateGradeReport(selectedChild, periode, notes, matieres, classeMatieres, settings, language as string)}
                                                className="flex items-center gap-2 px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-full text-xs font-bold shadow-sm transition-all active:scale-95"
                                            >
                                                <Download className="w-3.5 h-3.5" /> {t(language as Language, 'parentNotes.pdfReport') || 'Relevé PDF'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                                </div>

                                {!hasNotes ? (
                                    <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 border-dashed rounded-3xl p-10 text-center">
                                        <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                        <p className="text-slate-400 text-sm font-medium italic">{t(language as Language, 'parentNotes.noGradesRecorded') || 'Aucune note enregistrée pour cette période.'}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {childClasseMatieres.map(cm => {
                                            const matiere = matieres.find(m => m.id === cm.matiereId);
                                            const note = childNotesPeriode.find(n => n.matiereId === cm.matiereId);
                                            if (!matiere) return null;

                                            // Calcul dynamique avec evalConfigs
                                            const evalValues = activeConfigs.map(cfg => ({
                                                label: cfg.label,
                                                value: note ? ((note as any)[cfg.id] as number | null) : null
                                            }));

                                            const validVals = evalValues.map(e => e.value).filter(v => v !== null) as number[];
                                            const finalAvg = validVals.length > 0
                                                ? validVals.reduce((a, b) => a + b, 0) / validVals.length
                                                : null;
                                            const apprecInfo = getAppreciation(finalAvg, language as Language);

                                            return (
                                                <div key={cm.id} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 dark:bg-slate-800/50 rounded-full -mr-12 -mt-12 group-hover:bg-orange-50 dark:group-hover:bg-blue-900/20 transition-colors" />
                                                    <div className="relative z-10">
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex-1">
                                                                <h4 className="font-black text-slate-900 dark:text-white text-lg leading-tight group-hover:text-[#f97316] transition-colors">{matiere.nom}</h4>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                                                    {t(language as Language, 'common.coeff') || 'Coeff'}: {cm.coefficient} · {cm.professeur || (t(language as Language, 'parentNotes.profUndefined') || 'Prof. non défini')}
                                                                </p>
                                                            </div>
                                                            <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                                                                <BookOpen className="w-5 h-5 text-slate-400" />
                                                            </div>
                                                        </div>

                                                        {/* Notes dynamiques selon evalConfigs */}
                                                        <div className={`grid gap-3 mt-4 ${activeConfigs.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                                            {evalValues.map(ev => (
                                                                <div key={ev.label} className="bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100/50 dark:border-slate-700/30">
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1 truncate">{ev.label}</p>
                                                                    <p className={`font-bold ${ev.value !== null && ev.value !== undefined ? (ev.value >= 10 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
                                                                        {ev.value !== null && ev.value !== undefined ? ev.value.toFixed(2) : '—'}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <Star className={`w-4 h-4 ${finalAvg !== null && finalAvg >= 10 ? 'text-amber-400' : 'text-slate-200'}`} />
                                                                <span className={`text-xs font-bold ${apprecInfo.color}`}>{apprecInfo.label}</span>
                                                            </div>
                                                            <div className={`text-2xl font-black ${
                                                                finalAvg === null ? 'text-slate-300' :
                                                                finalAvg >= 10 ? 'text-emerald-600' : 'text-rose-600'
                                                            }`}>
                                                                {finalAvg !== null ? finalAvg.toFixed(2) : '--'}
                                                                <span className="text-[10px] ml-1 opacity-50">/20</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
