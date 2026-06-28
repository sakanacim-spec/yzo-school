import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Presence } from '../../types';
import { Users, Calendar, CheckCircle, XCircle, AlertCircle, Save, Loader2 } from 'lucide-react';
import { v4 as uuid } from '../../utils/uuid';
import { notificationService } from '../../services/notificationService';
import { playSuccessSound } from '../../utils/audio';

export const SaisiePresence: React.FC = () => {
    const { 
        user, 
        students, 
        classeMatieres, 
        presences, 
        savePresencesBatch 
    } = useStore();

    const [selectedClasse, setSelectedClasse] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [localPresences, setLocalPresences] = useState<Record<string, Presence['statut']>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Classes assignées au professeur
    const myClasses = useMemo(() => {
        if (!user) return [];
        const userName = (user.nom || '').trim().toLowerCase();
        const userUsername = (user.username || '').trim().toLowerCase();
        
        const assignations = classeMatieres.filter(cm => {
            const profName = (cm.professeur || '').trim().toLowerCase();
            return profName === userName || profName === userUsername;
        });
        
        return Array.from(new Set(assignations.map(a => a.classe))).sort();
    }, [user, classeMatieres]);

    // Élèves de la classe sélectionnée
    const classStudents = useMemo(() => {
        if (!selectedClasse) return [];
        return students
            .filter(s => s.classe === selectedClasse)
            .sort((a, b) => a.nom.localeCompare(b.nom));
    }, [students, selectedClasse]);

    // Initialiser les présences locales (récupérer existantes ou défaut "présent")
    useEffect(() => {
        if (!selectedClasse || !selectedDate) return;

        const initialStatus: Record<string, Presence['statut']> = {};
        
        classStudents.forEach(student => {
            // Chercher s'il y a déjà une présence pour cet élève à cette date
            const existing = presences.find(
                p => p.eleveId === student.id && p.date === selectedDate && (!p.type || p.type === 'ENTREE')
            );
            
            if (existing) {
                initialStatus[student.id] = existing.statut;
            } else {
                initialStatus[student.id] = 'present'; // Par défaut tout le monde est présent
            }
        });

        setLocalPresences(initialStatus);
    }, [selectedClasse, selectedDate, classStudents, presences]);

    const handleStatusChange = (studentId: string, status: Presence['statut']) => {
        setLocalPresences(prev => ({
            ...prev,
            [studentId]: status
        }));
    };

    const handleSave = async () => {
        if (!selectedClasse || !selectedDate || classStudents.length === 0) return;
        setIsSaving(true);

        const newPresences: Presence[] = classStudents.map(student => {
            const statut = localPresences[student.id] || 'present';
            
            // On vérifie s'il y avait déjà un enregistrement pour garder le même ID si on veut (optionnel)
            const existing = presences.find(
                p => p.eleveId === student.id && p.date === selectedDate && (!p.type || p.type === 'ENTREE')
            );

            return {
                id: existing ? existing.id : uuid(),
                eleveId: student.id,
                eleveNom: student.nom,
                elevePrenom: student.prenom,
                eleveClasse: student.classe,
                date: selectedDate,
                heure: existing ? existing.heure : new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                statut,
                type: 'ENTREE'
            };
        });

        // Sauvegarder dans le store
        savePresencesBatch(newPresences);
        
        // Notifications
        playSuccessSound();
        notificationService.success(`L'appel pour la classe ${selectedClasse} a été enregistré avec succès !`);

        // TODO: Déclencher des SMS ou Push WhatsApp aux parents des élèves marqués "absent" si nécessaire.

        setIsSaving(false);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
            {/* EN-TÊTE */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        Faire l'Appel
                    </h1>
                    <p className="text-indigo-200 font-medium max-w-xl">
                        Saisissez manuellement la liste de présence pour vos classes assignées.
                    </p>
                </div>
            </div>

            {/* FILTRES */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-500" />
                        Classe
                    </label>
                    <select
                        value={selectedClasse}
                        onChange={(e) => setSelectedClasse(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Sélectionnez une classe</option>
                        {myClasses.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-1">
                    <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        Date de l'appel
                    </label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>
            </div>

            {/* LISTE DES ÉLÈVES */}
            {selectedClasse ? (
                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">
                            Liste de la classe : <span className="text-indigo-600 dark:text-indigo-400">{selectedClasse}</span>
                        </h3>
                        <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 py-1 px-3 rounded-full text-xs font-bold">
                            {classStudents.length} Élève(s)
                        </span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {classStudents.length > 0 ? (
                            classStudents.map((student) => {
                                const currentStatus = localPresences[student.id] || 'present';
                                
                                return (
                                    <div key={student.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-black text-lg shrink-0 overflow-hidden">
                                                {student.photoUrl ? (
                                                    <img src={student.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                                                ) : (
                                                    `${student.prenom.charAt(0)}${student.nom.charAt(0)}`
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 dark:text-white text-base">
                                                    {student.prenom} <span className="uppercase">{student.nom}</span>
                                                </p>
                                                <p className="text-xs font-bold text-slate-500">Matricule: {student.id.split('-')[0].toUpperCase()}</p>
                                            </div>
                                        </div>

                                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl w-full sm:w-auto">
                                            <button
                                                onClick={() => handleStatusChange(student.id, 'present')}
                                                className={`flex-1 sm:w-28 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-bold transition-all ${
                                                    currentStatus === 'present' 
                                                    ? 'bg-emerald-500 text-white shadow-md' 
                                                    : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Présent
                                            </button>
                                            <button
                                                onClick={() => handleStatusChange(student.id, 'retard')}
                                                className={`flex-1 sm:w-28 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-bold transition-all ${
                                                    currentStatus === 'retard' 
                                                    ? 'bg-amber-500 text-white shadow-md' 
                                                    : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <AlertCircle className="w-4 h-4" />
                                                Retard
                                            </button>
                                            <button
                                                onClick={() => handleStatusChange(student.id, 'absent')}
                                                className={`flex-1 sm:w-28 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-bold transition-all ${
                                                    currentStatus === 'absent' 
                                                    ? 'bg-rose-500 text-white shadow-md' 
                                                    : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Absent
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-12 text-center text-slate-500">
                                Aucun élève dans cette classe.
                            </div>
                        )}
                    </div>

                    {classStudents.length > 0 && (
                        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-8 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Enregistrer l'appel
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-bold">Sélectionnez une classe pour commencer l'appel</p>
                </div>
            )}
        </div>
    );
};
