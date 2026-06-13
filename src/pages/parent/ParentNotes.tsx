import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { parentApi } from '../../services/parentApi';
import { 
    GraduationCap, BookOpen, Clock, FileText, 
    ChevronRight, AlertCircle, Loader2, Search,
    Filter, Calendar
} from 'lucide-react';
import { PeriodeType } from '../../types';

export const ParentNotes: React.FC = () => {
    const { notes, matieres, classeMatieres, students: children } = useStore();
    const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

    useEffect(() => {
        if (children.length > 0 && !selectedChildId) {
            setSelectedChildId(children[0].id);
        }
    }, [children, selectedChildId]);

    const selectedChild = children.find(c => c.id === selectedChildId);

    if (children.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-12 text-center border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Aucun enfant lié</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Liez vos enfants depuis le tableau de bord pour voir leurs résultats scolaires.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-amber-600 to-orange-500 rounded-[32px] p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                            <GraduationCap className="w-7 h-7" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tight">Relevé de Notes</h2>
                    </div>
                    <p className="text-amber-100 font-medium">Consultez les résultats scolaires de vos enfants en temps réel.</p>
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
                            ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' 
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:border-blue-300'
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

            {/* Liste des notes par période */}
            {selectedChild && (
                <div className="space-y-12 pb-20">
                    {(selectedChild.cycle === 'Lycée' 
                        ? (['SEMESTRE 1', 'SEMESTRE 2'] as PeriodeType[])
                        : (['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3'] as PeriodeType[])
                    ).map(periode => {
                        // Filtrer les matières de la classe de l'enfant
                        const childClasseMatieres = classeMatieres.filter(cm => cm.classe === selectedChild.classe);
                        // Filtrer les notes de l'enfant pour cette période
                        const childNotesPeriode = notes.filter(n => n.eleveId === selectedChild.id && n.periode === periode);

                        if (childClasseMatieres.length === 0) return null;

                        // Vérifier s'il y a au moins une note pour cette période
                        const hasNotes = childNotesPeriode.some(n => n.noteClasse !== null || n.noteDevoir !== null || n.noteCompo !== null);

                        return (
                            <section key={periode} className="animate-fadeIn">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                                    <div className="flex items-center gap-2 px-6 py-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                        <Calendar className="w-4 h-4 text-slate-500" />
                                        <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{periode}</h3>
                                    </div>
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                                </div>

                                {!hasNotes ? (
                                    <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 border-dashed rounded-3xl p-8 text-center">
                                        <p className="text-slate-400 text-sm font-medium italic">Aucune note enregistrée pour cette période.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {childClasseMatieres.map(cm => {
                                            const matiere = matieres.find(m => m.id === cm.matiereId);
                                            const note = childNotesPeriode.find(n => n.matiereId === cm.matiereId);

                                            if (!matiere) return null;

                                            // Calcul de la moyenne simplifiée pour l'affichage
                                            const notesEval = [note?.noteClasse, note?.noteDevoir].filter(v => v !== null && v !== undefined) as number[];
                                            const moyClasse = notesEval.length > 0 ? notesEval.reduce((a, b) => a + b, 0) / notesEval.length : null;
                                            
                                            const compo = note?.noteCompo;
                                            const hasMoy = typeof moyClasse === 'number';
                                            const hasCompo = typeof compo === 'number';

                                            const finalAvg = (hasMoy && hasCompo) 
                                                ? (moyClasse + compo) / 2 
                                                : (hasMoy ? moyClasse : (hasCompo ? compo : null));

                                            return (
                                                <div key={cm.id} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 dark:bg-slate-800/50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors"></div>
                                                    
                                                    <div className="relative z-10">
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex-1">
                                                                <h4 className="font-black text-slate-900 dark:text-white text-lg leading-tight group-hover:text-blue-600 transition-colors">{matiere.nom}</h4>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Coeff: {cm.coefficient} • {cm.professeur || 'Prof. non défini'}</p>
                                                            </div>
                                                            <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                                                                <BookOpen className="w-5 h-5 text-slate-400" />
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4 mt-6">
                                                            <div className="bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100/50 dark:border-slate-700/30">
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Interro/Devoir</p>
                                                                <p className="font-bold text-slate-700 dark:text-slate-300">
                                                                    {hasMoy ? `${moyClasse.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                            <div className="bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100/50 dark:border-slate-700/30">
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Composition</p>
                                                                <p className="font-bold text-slate-700 dark:text-slate-300">
                                                                    {hasCompo ? `${compo.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                                            <span className="text-xs font-bold text-slate-400 uppercase italic">Moyenne</span>
                                                            <div className={`text-2xl font-black ${
                                                                typeof finalAvg !== 'number' ? 'text-slate-300' :
                                                                finalAvg >= 10 ? 'text-emerald-600' : 'text-rose-600'
                                                            }`}>
                                                                {typeof finalAvg === 'number' ? finalAvg.toFixed(2) : '--'}
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
