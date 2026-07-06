import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Edit3, Save, CheckCircle2, Printer, Calculator, X } from 'lucide-react';
import { Note, PeriodeType, EvalConfig, DEFAULT_EVAL_CONFIGS } from '../types';
import { v4 as uuid } from '../utils/uuid';
import { generateBordereauPDF } from '../utils/bordereauPdf';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';
import type { Language } from '../types';

export const SaisieNotes: React.FC = () => {
    const { language } = useLanguage();
    const currentPeriode = useStore((s) => s.currentPeriode);
    const setCurrentPeriode = useStore((s) => s.setCurrentPeriode);
    const students = useStore((s) => s.students);
    const matieres = useStore((s) => s.matieres);
    const classeMatieres = useStore((s) => s.classeMatieres);
    const user = useStore((s) => s.user);
    const storedEvalConfigs = useStore((s) => s.settings?.evalConfigs);
    const evalConfigs: EvalConfig[] = (storedEvalConfigs && storedEvalConfigs.length > 0)
        ? storedEvalConfigs
        : DEFAULT_EVAL_CONFIGS;
    const activeEvalConfigs = evalConfigs.filter(c => c.enabled);

    const periods: PeriodeType[] = ['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3', 'SEMESTRE 1', 'SEMESTRE 2'];
    
    const classesList = useMemo(() => {
        if (user?.role === 'professeur') {
            const userName = (user.nom || '').trim().toLowerCase();
            const userUsername = (user.username || '').trim().toLowerCase();

            const assignedClasses = classeMatieres
                .filter(cm => {
                    const profName = (cm.professeur || '').trim().toLowerCase();
                    return profName === userName || profName === userUsername;
                })
                .map(cm => cm.classe);
            return Array.from(new Set(assignedClasses)).sort();
        }
        return Array.from(new Set(students.map(s => s.classe))).sort();
    }, [students, classeMatieres, user]);

    const [selectedClasse, setSelectedClasse] = useState('');
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [activeCalculator, setActiveCalculator] = useState<string | null>(null); // studentId

    // Filter students for the selected class
    const classStudents = useMemo(() => {
        return students.filter(s => s.classe === selectedClasse).sort((a,b) => a.nom.localeCompare(b.nom));
    }, [students, selectedClasse]);

    // Matieres available for this class
    const availableMatieres = useMemo(() => {
        return classeMatieres
            .filter(cm => cm.classe === selectedClasse && (user?.role !== 'professeur' || cm.professeur.toLowerCase() === user?.nom?.toLowerCase()))
            .map(cm => ({ cm, mat: matieres.find(m => m.id === cm.matiereId) }))
            .filter(item => item.mat !== undefined);
    }, [classeMatieres, matieres, selectedClasse, user]);

    // Local state for grades being edited (stored as strings to allow typing decimals like "12.")
    const [draftNotes, setDraftNotes] = useState<Record<string, Record<string, string>>>({});
    const prevSelectionRef = React.useRef<string>('');

    // Charge les notes existantes dans le brouillon UNIQUEMENT quand la sélection change
    React.useEffect(() => {
        const selectionKey = `${selectedClasse}|${selectedMatiereId}|${currentPeriode}`;

        // Ne rien faire si la sélection n'a pas changé
        if (selectionKey === prevSelectionRef.current) return;
        
        // Avant de changer, on pourrait sauvegarder les notes de la sélection précédente
        // Mais pour simplifier, on se concentre sur le chargement ici.
        prevSelectionRef.current = selectionKey;

        if (!selectedClasse || !selectedMatiereId) {
            setDraftNotes({});
            return;
        }

        const currentNotes = useStore.getState().notes;
        const newDrafts: Record<string, Record<string, string>> = {};
        
        classStudents.forEach(student => {
            const existing = currentNotes.find(n => n.eleveId === student.id && n.matiereId === selectedMatiereId && n.periode === currentPeriode);
            newDrafts[student.id] = {
                noteClasse: existing?.noteClasse?.toString() || '',
                noteDevoir: existing?.noteDevoir?.toString() || '',
                noteCompo: existing?.noteCompo?.toString() || ''
            };
        });
        setDraftNotes(newDrafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClasse, selectedMatiereId, currentPeriode]); // Retiré classStudents pour éviter les resets intempestifs

    const handleNoteChange = (studentId: string, field: 'noteClasse' | 'noteDevoir' | 'noteCompo', value: string) => {
        // Validation basique (on autorise chiffres, point, virgule)
        const cleanedValue = value.replace(',', '.');
        if (cleanedValue !== '' && !/^\d*\.?\d*$/.test(cleanedValue)) return;

        setDraftNotes(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: cleanedValue
            }
        }));
    };

    const handleSave = async () => {
        if (!selectedMatiereId || !selectedClasse) return;

        const currentNotes = useStore.getState().notes;
        const batch: Note[] = [];
        
        classStudents.forEach(student => {
            const draft = draftNotes[student.id];
            if (draft) {
                // Chercher si une note existe déjà pour cet élève/matière/période
                const existingNote = currentNotes.find(n => 
                    n.eleveId === student.id && 
                    n.matiereId === selectedMatiereId && 
                    n.periode === currentPeriode
                );

                const nC = draft.noteClasse === '' ? null : parseFloat(draft.noteClasse);
                const nD = draft.noteDevoir === '' ? null : parseFloat(draft.noteDevoir);
                const nCp = draft.noteCompo === '' ? null : parseFloat(draft.noteCompo);

                batch.push({
                    // Réutiliser l'UUID existant ou en créer un nouveau seulement si nécessaire
                    id: existingNote ? existingNote.id : uuid(),
                    eleveId: student.id,
                    matiereId: selectedMatiereId,
                    periode: currentPeriode,
                    noteClasse: isNaN(nC as any) ? null : nC,
                    noteDevoir: isNaN(nD as any) ? null : nD,
                    noteCompo: isNaN(nCp as any) ? null : nCp,
                });
            }
        });
        
        if (batch.length > 0) {
            // 1. Sauvegarder localement
            useStore.getState().upsertNotes(batch);
            
            // 2. Synchroniser vers le cloud (une seule fois, après toutes les notes)
            setSaveStatus(t(language as Language, 'grades.saving') || '💾 Sauvegarde en cours...');
            try {
                const allNotes = useStore.getState().notes;
                console.log(`📤 [Notes] Envoi de ${allNotes.length} notes vers le cloud...`);
                const { syncToBackend } = await import('../services/backendSync');
                const result = await syncToBackend({ notes: allNotes });
                // Mettre à jour le timestamp pour bloquer le polling pendant 55s
                useStore.setState({ lastSyncTimestamp: Date.now() });
                if (result) {
                    setSaveStatus(t(language as Language, 'grades.saveSuccessSync') || '✅ Notes enregistrées et synchronisées !');
                    console.log('✅ [Notes] Sync cloud réussie, résultat:', result);
                } else {
                    setSaveStatus(t(language as Language, 'grades.saveLocalNoServer') || "⚠️ Sauvé localement, le serveur n'a pas répondu");
                    console.warn('⚠️ [Notes] syncToBackend a retourné null');
                }
            } catch (err) {
                console.error('❌ [Notes] Erreur sync cloud:', err);
                setSaveStatus(t(language as Language, 'grades.saveLocalSyncPending') || '⚠️ Sauvé localement, sync cloud en attente');
            }
        } else {
            setSaveStatus(t(language as Language, 'grades.noNotesToSave') || 'Aucune note à enregistrer');
        }
        
        setTimeout(() => setSaveStatus(null), 3000);
    };

    // Calculate real-time average for a student
    const calculateStudentAverage = (studentId: string): number | null => {
        const draft = draftNotes[studentId];
        if (!draft) return null;

        const nc = draft.noteClasse === '' ? null : parseFloat(draft.noteClasse);
        const nd = draft.noteDevoir === '' ? null : parseFloat(draft.noteDevoir);
        const nCp = draft.noteCompo === '' ? null : parseFloat(draft.noteCompo);

        let moyClasseMat: number | null = null;
        const notesEvaluations = [nc, nd].filter(x => x !== null && !isNaN(x)) as number[];
        if (notesEvaluations.length > 0) {
            moyClasseMat = notesEvaluations.reduce((a,b) => a+b, 0) / notesEvaluations.length;
        }

        const paramPourMoyenne = [moyClasseMat, nCp].filter(x => x !== null && !isNaN(x)) as number[];
        if (paramPourMoyenne.length > 0) {
            return paramPourMoyenne.reduce((a,b) => a+b, 0) / paramPourMoyenne.length;
        }

        return null;
    };

    // Calculate class average
    const classAverage = useMemo(() => {
        const averages = classStudents.map(s => calculateStudentAverage(s.id)).filter(a => a !== null) as number[];
        if (averages.length === 0) return null;
        return averages.reduce((a, b) => a + b, 0) / averages.length;
    }, [draftNotes, classStudents]);

    // Keyboard navigation
    const fields = ['noteClasse', 'noteDevoir', 'noteCompo'];
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number, field: string) => {
        const fieldIndex = fields.indexOf(field);
        
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            const nextInput = document.getElementById(`input-${field}-${currentIndex + 1}`);
            if (nextInput) nextInput.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevInput = document.getElementById(`input-${field}-${currentIndex - 1}`);
            if (prevInput) prevInput.focus();
        } else if (e.key === 'ArrowRight' && fieldIndex < fields.length - 1) {
            e.preventDefault();
            const nextInput = document.getElementById(`input-${fields[fieldIndex + 1]}-${currentIndex}`);
            if (nextInput) nextInput.focus();
        } else if (e.key === 'ArrowLeft' && fieldIndex > 0) {
            e.preventDefault();
            const prevInput = document.getElementById(`input-${fields[fieldIndex - 1]}-${currentIndex}`);
            if (prevInput) prevInput.focus();
        }
    };
    
    const getAppreciation = (avg: number | null) => {
        if (avg === null) return '--';
        if (avg >= 16) return t(language as Language, 'grades.appreciation.veryGood') || 'Très Bien';
        if (avg >= 14) return t(language as Language, 'grades.appreciation.good') || 'Bien';
        if (avg >= 12) return t(language as Language, 'grades.appreciation.fairlyGood') || 'Assez Bien';
        if (avg >= 10) return t(language as Language, 'grades.appreciation.passable') || 'Passable';
        if (avg >= 8) return t(language as Language, 'grades.appreciation.insufficient') || 'Insuffisant';
        return t(language as Language, 'grades.appreciation.poor') || 'Médiocre';
    };
    
    const getColorClass = (val: number | null) => {
        if (val === null) return 'text-gray-900';
        return val >= 10 ? 'text-green-600' : 'text-red-600';
    };

    const handleDownloadBordereau = () => {
        if (!selectedClasse || !selectedMatiereId) return;
        const matiereName = matieres.find(m => m.id === selectedMatiereId)?.nom || 'Matière';
        const settings = useStore.getState().settings || {} as any;

        const studentsData = classStudents.map(student => {
            const draft = draftNotes[student.id] || {};
            const moyenne = calculateStudentAverage(student.id);
            return {
                nom: student.nom,
                prenom: student.prenom,
                noteClasse: draft.noteClasse || '--',
                noteDevoir: draft.noteDevoir || '--',
                noteCompo: draft.noteCompo || '--',
                moyenne: moyenne !== null ? moyenne.toFixed(2) : '--'
            };
        });

        generateBordereauPDF(
            selectedClasse,
            matiereName,
            currentPeriode,
            user?.nom || 'Professeur',
            studentsData,
            classAverage !== null ? classAverage.toFixed(2) : '--',
            settings,
            evalConfigs
        );
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-white/20 rounded-xl">
                        <Edit3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">{t(language as Language, 'grades.entryTitle') || 'Saisie des Notes'}</h2>
                        <p className="text-pink-100">{t(language as Language, 'grades.entrySubtitle') || 'Saisissez les notes de classe, de devoir et de composition.'}</p>
                    </div>
                </div>
            </div>

            {/* Filtres de sélection */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t(language as Language, 'grades.academicPeriod') || 'Période Académique'}</label>
                    <select
                        value={currentPeriode}
                        onChange={(e) => setCurrentPeriode(e.target.value as PeriodeType)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold text-gray-800"
                    >
                        {periods.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t(language as Language, 'common.class') || 'Classe'}</label>
                    <select
                        value={selectedClasse}
                        onChange={(e) => { setSelectedClasse(e.target.value); setSelectedMatiereId(''); }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold"
                    >
                        <option value="">{t(language as Language, 'grades.selectClass') || 'Sélectionner une classe...'}</option>
                        {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[250px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t(language as Language, 'common.subject') || 'Matière'}</label>
                    <select
                        value={selectedMatiereId}
                        onChange={(e) => setSelectedMatiereId(e.target.value)}
                        disabled={!selectedClasse}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold disabled:opacity-50"
                    >
                        <option value="">{t(language as Language, 'grades.selectSubject') || 'Sélectionner une matière...'}</option>
                        {availableMatieres.map(item => (
                            <option key={item.mat!.id} value={item.mat!.id}>
                                {item.mat!.nom} {(t(language as Language, 'grades.coef') || '(Coef: {{coef}})').replace('{{coef}}', String(item.cm.coefficient))}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table de Saisie */}
            {selectedClasse && selectedMatiereId ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in relative">
                    <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50 flex-wrap gap-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                            {t(language as Language, 'grades.classSize') || 'Effectif de la classe :'} <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">{classStudents.length}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownloadBordereau}
                                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 shadow-sm transition-all active:scale-95"
                            >
                                <Printer className="w-5 h-5 text-gray-500" />
                                {t(language as Language, 'grades.downloadSlip') || 'Télécharger le bordereau'}
                            </button>
                            <button
                                onClick={handleSave}
                                className="bg-rose-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-700 shadow-md transition-all active:scale-95"
                            >
                                <Save className="w-5 h-5" />
                                {t(language as Language, 'grades.saveNotes') || 'Enregistrer les notes'}
                            </button>
                        </div>
                    </div>

                    {saveStatus && (
                        <div className="p-3 bg-green-50 text-green-700 font-semibold flex items-center justify-center gap-2 text-sm">
                            <CheckCircle2 className="w-5 h-5" /> {saveStatus}
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white border-b border-gray-200 text-sm">
                                    <th className="p-4 font-bold text-gray-600 w-16">{t(language as Language, 'common.number') || 'N°'}</th>
                                    <th className="p-4 font-bold text-gray-600">{t(language as Language, 'common.fullName') || 'Nom & Prénom(s)'}</th>
                                    {activeEvalConfigs.map((cfg, ci) => {
                                        const colors = ['text-blue-600', 'text-indigo-600', 'text-purple-600'];
                                        return (
                                            <th key={cfg.id} className={`p-4 font-bold ${colors[ci] || 'text-gray-600'} w-36 text-center`}>
                                                {cfg.label} (/20)
                                                {cfg.nbNotes > 1 && (
                                                    <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                                                        ({cfg.nbNotes} {t(language as Language, 'grades.notesToAvg') || 'notes → moy.'})
                                                    </div>
                                                )}
                                            </th>
                                        );
                                    })}
                                    <th className="p-4 font-bold text-rose-600 w-32 text-center">{t(language as Language, 'common.average') || 'Moyenne'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classStudents.map((student, index) => (
                                    <tr key={student.id} className="border-b border-gray-50 hover:bg-rose-50/30 transition-colors">
                                        <td className="p-4 text-gray-500 font-medium">{index + 1}</td>
                                        <td className="p-4 font-bold text-gray-800">
                                            {student.nom} {student.prenom}
                                        </td>
                                        {activeEvalConfigs.map((cfg, ci) => {
                                            const ringColors = ['focus:ring-blue-500', 'focus:ring-indigo-500', 'focus:ring-purple-500'];
                                            const calcId = `calc-open-${cfg.id}-${student.id}`;
                                            return (
                                                <td key={cfg.id} className="p-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 relative">
                                                        <input
                                                            id={`input-${cfg.id}-${index}`}
                                                            type="number"
                                                            min="0" max="20" step="0.5"
                                                            className={`w-20 px-3 py-2 text-center border border-gray-300 rounded-lg ${ringColors[ci] || 'focus:ring-2'} focus:ring-2 font-bold ${draftNotes[student.id]?.[cfg.id] ? getColorClass(parseFloat(draftNotes[student.id][cfg.id])) : ''}`}
                                                            value={draftNotes[student.id]?.[cfg.id] ?? ''}
                                                            onChange={(e) => handleNoteChange(student.id, cfg.id as any, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, index, cfg.id)}
                                                            placeholder="--"
                                                        />
                                                        {cfg.nbNotes > 1 && (
                                                            <button
                                                                onClick={() => setActiveCalculator(activeCalculator === calcId ? null : calcId)}
                                                                className={`p-1.5 rounded-lg transition-colors ${activeCalculator === calcId ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                                                                title={(t(language as Language, 'grades.calculatorFor') || 'Calculatrice pour {{label}}').replace('{{label}}', cfg.label)}
                                                            >
                                                                <Calculator className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {/* Calculator Popup */}
                                                        {activeCalculator === calcId && (
                                                            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 w-56 bg-white rounded-xl shadow-xl border border-gray-200 p-3 animate-fade-in">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="text-xs font-bold text-gray-500 uppercase">{cfg.label}</span>
                                                                    <button onClick={() => setActiveCalculator(null)} className="text-gray-400 hover:text-gray-700">
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {Array.from({ length: cfg.nbNotes }, (_, i) => i + 1).map(num => (
                                                                        <div key={num} className="flex items-center gap-2">
                                                                            <span className="text-xs font-semibold text-gray-500 w-12">{t(language as Language, 'grades.noteNum') || 'Note'} {num}</span>
                                                                            <input
                                                                                type="number" min="0" max="20" step="0.5"
                                                                                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                                                                id={`calc-${student.id}-${cfg.id}-${num}`}
                                                                                onChange={() => {
                                                                                    let sum = 0; let count = 0;
                                                                                    for (let i = 1; i <= cfg.nbNotes; i++) {
                                                                                        const val = (document.getElementById(`calc-${student.id}-${cfg.id}-${i}`) as HTMLInputElement)?.value;
                                                                                        if (val) { sum += parseFloat(val); count++; }
                                                                                    }
                                                                                    if (count > 0) {
                                                                                        handleNoteChange(student.id, cfg.id as any, (sum / count).toFixed(2));
                                                                                    } else {
                                                                                        handleNoteChange(student.id, cfg.id as any, '');
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-3 pt-2 border-t border-gray-100 text-center">
                                                                    <span className="text-xs text-gray-500">{t(language as Language, 'grades.generatedAverage') || 'Moyenne générée :'}</span>
                                                                    <div className="font-black text-blue-600 text-lg">
                                                                        {draftNotes[student.id]?.[cfg.id] || '--'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td className="p-4 text-center">
                                            <div className={`w-24 mx-auto px-2 py-1 rounded-lg font-black text-center text-lg shadow-sm border ${calculateStudentAverage(student.id) !== null ? (calculateStudentAverage(student.id)! >= 10 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200') : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                {calculateStudentAverage(student.id) !== null
                                                    ? calculateStudentAverage(student.id)!.toFixed(2)
                                                    : '--'}
                                            </div>
                                            <div className={`text-xs font-bold mt-1.5 uppercase ${getColorClass(calculateStudentAverage(student.id))}`}>
                                                {getAppreciation(calculateStudentAverage(student.id))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {classStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={2 + activeEvalConfigs.length + 1} className="p-8 text-center text-gray-500 font-semibold">
                                            {t(language as Language, 'grades.noStudentsInClass') || 'Aucun élève trouvé dans cette classe.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {classStudents.length > 0 && classAverage !== null && (
                                <tfoot>
                                    <tr className="bg-rose-50/50 border-t-2 border-rose-100">
                                        <td colSpan={2 + activeEvalConfigs.length} className="p-4 font-black text-rose-700 text-right">
                                            {t(language as Language, 'grades.classGeneralAverage') || 'Moyenne Générale de la Classe :'}
                                        </td>
                                        <td className="p-4 text-center font-black text-rose-700 text-lg">
                                            {classAverage.toFixed(2)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Edit3 className="w-16 h-16 text-gray-200 mb-4" />
                    <p className="text-gray-500 font-semibold text-lg text-center max-w-sm">
                        {t(language as Language, 'grades.selectClassSubjectToStart') || 'Sélectionnez une classe et une matière pour commencer la saisie des notes.'}
                    </p>
                </div>
            )}
        </div>
    );
};
