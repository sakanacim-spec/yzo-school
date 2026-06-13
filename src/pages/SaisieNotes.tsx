import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Edit3, Save, CheckCircle2 } from 'lucide-react';
import { Note, PeriodeType } from '../types';
import { v4 as uuid } from '../utils/uuid';

export const SaisieNotes: React.FC = () => {
    const currentPeriode = useStore((s) => s.currentPeriode);
    const setCurrentPeriode = useStore((s) => s.setCurrentPeriode);
    const students = useStore((s) => s.students);
    const matieres = useStore((s) => s.matieres);
    const classeMatieres = useStore((s) => s.classeMatieres);


    const periods: PeriodeType[] = ['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3', 'SEMESTRE 1', 'SEMESTRE 2'];
    const classesList = Array.from(new Set(students.map(s => s.classe))).sort();

    const [selectedClasse, setSelectedClasse] = useState('');
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [saveStatus, setSaveStatus] = useState<string | null>(null);

    // Filter students for the selected class
    const classStudents = useMemo(() => {
        return students.filter(s => s.classe === selectedClasse).sort((a,b) => a.nom.localeCompare(b.nom));
    }, [students, selectedClasse]);

    // Matieres available for this class
    const availableMatieres = useMemo(() => {
        return classeMatieres
            .filter(cm => cm.classe === selectedClasse)
            .map(cm => ({ cm, mat: matieres.find(m => m.id === cm.matiereId) }))
            .filter(item => item.mat !== undefined);
    }, [classeMatieres, matieres, selectedClasse]);

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
            setSaveStatus('💾 Sauvegarde en cours...');
            try {
                const allNotes = useStore.getState().notes;
                console.log(`📤 [Notes] Envoi de ${allNotes.length} notes vers le cloud...`);
                const { syncToBackend } = await import('../services/backendSync');
                const result = await syncToBackend({ notes: allNotes });
                // Mettre à jour le timestamp pour bloquer le polling pendant 55s
                useStore.setState({ lastSyncTimestamp: Date.now() });
                if (result) {
                    setSaveStatus('✅ Notes enregistrées et synchronisées !');
                    console.log('✅ [Notes] Sync cloud réussie, résultat:', result);
                } else {
                    setSaveStatus('⚠️ Sauvé localement, le serveur n\'a pas répondu');
                    console.warn('⚠️ [Notes] syncToBackend a retourné null');
                }
            } catch (err) {
                console.error('❌ [Notes] Erreur sync cloud:', err);
                setSaveStatus('⚠️ Sauvé localement, sync cloud en attente');
            }
        } else {
            setSaveStatus('Aucune note à enregistrer');
        }
        
        setTimeout(() => setSaveStatus(null), 3000);
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
                        <h2 className="text-2xl font-bold">Saisie des Notes</h2>
                        <p className="text-pink-100">Saisissez les notes de classe, de devoir et de composition.</p>
                    </div>
                </div>
            </div>

            {/* Filtres de sélection */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Période Académique</label>
                    <select
                        value={currentPeriode}
                        onChange={(e) => setCurrentPeriode(e.target.value as PeriodeType)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold text-gray-800"
                    >
                        {periods.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Classe</label>
                    <select
                        value={selectedClasse}
                        onChange={(e) => { setSelectedClasse(e.target.value); setSelectedMatiereId(''); }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold"
                    >
                        <option value="">Sélectionner une classe...</option>
                        {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[250px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Matière</label>
                    <select
                        value={selectedMatiereId}
                        onChange={(e) => setSelectedMatiereId(e.target.value)}
                        disabled={!selectedClasse}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 font-bold disabled:opacity-50"
                    >
                        <option value="">Sélectionner une matière...</option>
                        {availableMatieres.map(item => (
                            <option key={item.mat!.id} value={item.mat!.id}>
                                {item.mat!.nom} (Coef: {item.cm.coefficient})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table de Saisie */}
            {selectedClasse && selectedMatiereId ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                    <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                            Effectif de la classe : <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">{classStudents.length}</span>
                        </div>
                        <button
                            onClick={handleSave}
                            className="bg-rose-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-700 shadow-md transition-all active:scale-95"
                        >
                            <Save className="w-5 h-5" />
                            Enregistrer les notes
                        </button>
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
                                    <th className="p-4 font-bold text-gray-600 w-16">N°</th>
                                    <th className="p-4 font-bold text-gray-600">Nom & Prénom(s)</th>
                                    <th className="p-4 font-bold text-blue-600 w-40 text-center">Interro. (/20)</th>
                                    <th className="p-4 font-bold text-indigo-600 w-40 text-center">Devoir (/20)</th>
                                    <th className="p-4 font-bold text-purple-600 w-40 text-center">Compo. (/20)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classStudents.map((student, index) => (
                                    <tr key={student.id} className="border-b border-gray-50 hover:bg-rose-50/30 transition-colors">
                                        <td className="p-4 text-gray-500 font-medium">{index + 1}</td>
                                        <td className="p-4 font-bold text-gray-800">
                                            {student.nom} {student.prenom}
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="number"
                                                min="0" max="20" step="0.5"
                                                className="w-20 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                                                value={draftNotes[student.id]?.noteClasse ?? ''}
                                                onChange={(e) => handleNoteChange(student.id, 'noteClasse', e.target.value)}
                                                placeholder="--"
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="number"
                                                min="0" max="20" step="0.5"
                                                className="w-20 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold"
                                                value={draftNotes[student.id]?.noteDevoir ?? ''}
                                                onChange={(e) => handleNoteChange(student.id, 'noteDevoir', e.target.value)}
                                                placeholder="--"
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="number"
                                                min="0" max="20" step="0.5"
                                                className="w-20 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-semibold"
                                                value={draftNotes[student.id]?.noteCompo ?? ''}
                                                onChange={(e) => handleNoteChange(student.id, 'noteCompo', e.target.value)}
                                                placeholder="--"
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {classStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-500 font-semibold">
                                            Aucun élève trouvé dans cette classe.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Edit3 className="w-16 h-16 text-gray-200 mb-4" />
                    <p className="text-gray-500 font-semibold text-lg text-center max-w-sm">
                        Sélectionnez une classe et une matière pour commencer la saisie des notes.
                    </p>
                </div>
            )}
        </div>
    );
};
