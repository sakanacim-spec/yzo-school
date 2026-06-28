import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Seance } from '../types';
import { Calendar as CalendarIcon, Plus, X, Clock, MapPin, User as UserIcon, Trash2 } from 'lucide-react';
import { v4 as uuid } from '../utils/uuid';
import { notificationService } from '../services/notificationService';
import { playSuccessSound } from '../utils/audio';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;
const HEURES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

const COULEURS = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 
    'bg-purple-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-blue-500'
];

export const EmploiDuTemps: React.FC = () => {
    const { students, classeMatieres, matieres, seances, addSeance, deleteSeance } = useStore();
    
    // Extraire les classes uniques
    const classesList = useMemo(() => {
        return Array.from(new Set(students.map(s => s.classe))).sort();
    }, [students]);

    const [selectedClasse, setSelectedClasse] = useState(classesList[0] || '');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Formulaire d'ajout
    const [form, setForm] = useState<Partial<Seance>>({
        jour: 'Lundi',
        heureDebut: '08:00',
        heureFin: '10:00',
        salle: '',
        couleur: 'bg-indigo-500'
    });
    const [selectedAssignation, setSelectedAssignation] = useState('');

    // Assignations pour la classe sélectionnée
    const classAssignations = useMemo(() => {
        if (!selectedClasse) return [];
        return classeMatieres.filter(cm => cm.classe === selectedClasse);
    }, [classeMatieres, selectedClasse]);

    // Séances filtrées pour la classe sélectionnée
    const currentSeances = useMemo(() => {
        return seances.filter(s => s.classe === selectedClasse);
    }, [seances, selectedClasse]);

    const handleOpenModal = (jour: typeof JOURS[number], heureDebut: string) => {
        setForm(prev => ({ ...prev, jour, heureDebut }));
        setIsModalOpen(true);
    };

    const handleSaveSeance = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClasse || !selectedAssignation || !form.jour || !form.heureDebut || !form.heureFin) {
            notificationService.error("Veuillez remplir tous les champs obligatoires.");
            return;
        }

        const assignation = classAssignations.find(a => a.id === selectedAssignation);
        if (!assignation) return;

        const newSeance: Seance = {
            id: uuid(),
            classe: selectedClasse,
            jour: form.jour as any,
            heureDebut: form.heureDebut,
            heureFin: form.heureFin,
            matiereId: assignation.matiereId,
            professeur: assignation.professeur,
            salle: form.salle || '',
            couleur: form.couleur || 'bg-indigo-500'
        };

        addSeance(newSeance);
        setIsModalOpen(false);
        playSuccessSound();
        notificationService.success("Séance ajoutée avec succès !");
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Voulez-vous vraiment supprimer cette séance ?")) {
            deleteSeance(id);
            notificationService.success("Séance supprimée.");
        }
    };

    // Helper pour calculer le positionnement CSS
    const getSeanceStyle = (seance: Seance) => {
        const startIdx = HEURES.indexOf(seance.heureDebut);
        const endIdx = HEURES.indexOf(seance.heureFin);
        if (startIdx === -1 || endIdx === -1) return {};

        return {
            top: `${(startIdx) * 100}px`,
            height: `${(endIdx - startIdx) * 100}px`
        };
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
            {/* EN-TÊTE */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        <CalendarIcon className="w-8 h-8" />
                        Emploi du Temps
                    </h1>
                    <p className="text-indigo-200 font-medium max-w-xl">
                        Planifiez et gérez l'emploi du temps hebdomadaire de chaque classe.
                    </p>
                </div>
            </div>

            {/* SÉLECTEUR DE CLASSE */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">
                        Sélectionnez une classe
                    </label>
                    <select
                        value={selectedClasse}
                        onChange={(e) => setSelectedClasse(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex items-end">
                    <button
                        onClick={() => handleOpenModal('Lundi', '08:00')}
                        disabled={!selectedClasse}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                    >
                        <Plus className="w-5 h-5" />
                        Nouvelle Séance
                    </button>
                </div>
            </div>

            {/* GRILLE D'EMPLOI DU TEMPS */}
            {selectedClasse ? (
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto p-6">
                    <div className="min-w-[800px] relative">
                        {/* En-tête des Jours */}
                        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 mb-4 sticky top-0 bg-white dark:bg-slate-800 z-20 pb-4">
                            <div className="text-center font-black text-slate-400 dark:text-slate-500">Heures</div>
                            {JOURS.map(jour => (
                                <div key={jour} className="text-center font-black text-slate-800 dark:text-white text-lg">
                                    {jour}
                                </div>
                            ))}
                        </div>

                        {/* Corps de la grille */}
                        <div className="grid grid-cols-7 relative h-[1000px]">
                            {/* Colonne des heures */}
                            <div className="border-r border-slate-100 dark:border-slate-700">
                                {HEURES.map(heure => (
                                    <div key={heure} className="h-[100px] flex items-start justify-center pt-2">
                                        <span className="text-xs font-bold text-slate-400">{heure}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Colonnes des jours */}
                            {JOURS.map(jour => (
                                <div key={jour} className="relative border-r border-slate-100 dark:border-slate-700">
                                    {/* Lignes horizontales pour les heures */}
                                    {HEURES.map(heure => (
                                        <div key={`${jour}-${heure}`} className="h-[100px] border-b border-slate-50 dark:border-slate-800/50" />
                                    ))}

                                    {/* Séances positionnées en absolu */}
                                    {currentSeances.filter(s => s.jour === jour).map(seance => {
                                        const matiere = matieres.find(m => m.id === seance.matiereId);
                                        return (
                                            <div 
                                                key={seance.id} 
                                                className={`absolute left-1 right-1 rounded-xl p-3 shadow-lg flex flex-col justify-between overflow-hidden group ${seance.couleur || 'bg-indigo-500'} text-white z-10 hover:z-30 transition-all hover:scale-105 cursor-pointer border border-white/20`}
                                                style={getSeanceStyle(seance)}
                                            >
                                                <div>
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-black text-sm leading-tight line-clamp-2">
                                                            {matiere?.nom}
                                                        </h4>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(seance.id); }}
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/40 p-1 rounded-lg"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-white/80 mt-1 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {seance.heureDebut} - {seance.heureFin}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-[10px] space-y-1">
                                                    <div className="flex items-center gap-1 bg-black/20 rounded px-1.5 py-0.5 w-max font-medium">
                                                        <UserIcon className="w-3 h-3" />
                                                        <span className="truncate max-w-[80px]">{seance.professeur || 'À définir'}</span>
                                                    </div>
                                                    {seance.salle && (
                                                        <div className="flex items-center gap-1 font-medium">
                                                            <MapPin className="w-3 h-3 opacity-70" />
                                                            {seance.salle}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 text-slate-500">
                    Sélectionnez une classe pour afficher l'emploi du temps.
                </div>
            )}

            {/* MODALE D'AJOUT */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center border-b border-slate-100 dark:border-slate-700">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white">
                                Ajouter une séance
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSeance} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Matière & Professeur assigné</label>
                                <select 
                                    value={selectedAssignation}
                                    onChange={e => setSelectedAssignation(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    required
                                >
                                    <option value="">Sélectionnez...</option>
                                    {classAssignations.map(a => {
                                        const mat = matieres.find(m => m.id === a.matiereId);
                                        return (
                                            <option key={a.id} value={a.id}>
                                                {mat?.nom} ({a.professeur})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Jour</label>
                                    <select 
                                        value={form.jour}
                                        onChange={e => setForm({...form, jour: e.target.value as any})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    >
                                        {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Salle (Optionnel)</label>
                                    <input 
                                        type="text"
                                        placeholder="Ex: Salle A1"
                                        value={form.salle}
                                        onChange={e => setForm({...form, salle: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Heure de début</label>
                                    <select 
                                        value={form.heureDebut}
                                        onChange={e => setForm({...form, heureDebut: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    >
                                        {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Heure de fin</label>
                                    <select 
                                        value={form.heureFin}
                                        onChange={e => setForm({...form, heureFin: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    >
                                        {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">Couleur</label>
                                <div className="flex gap-2">
                                    {COULEURS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setForm({...form, couleur: c})}
                                            className={`w-8 h-8 rounded-full ${c} transition-all ${form.couleur === c ? 'ring-4 ring-indigo-500/50 scale-110' : 'hover:scale-110'}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black transition-colors shadow-lg shadow-indigo-600/30">
                                Sauvegarder la séance
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
