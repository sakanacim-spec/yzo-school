import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Seance } from '../../types';
import { Calendar as CalendarIcon, Clock, MapPin, Users } from 'lucide-react';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;
const HEURES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export const ProfEmploiDuTemps: React.FC = () => {
    const { user, seances, matieres } = useStore();

    // Séances filtrées pour le professeur connecté
    const mySeances = useMemo(() => {
        if (!user) return [];
        const userName = (user.nom || '').trim().toLowerCase();
        const userUsername = (user.username || '').trim().toLowerCase();

        return seances.filter(s => {
            const profName = (s.professeur || '').trim().toLowerCase();
            return profName === userName || profName === userUsername;
        });
    }, [seances, user]);

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
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 bg-gradient-to-br from-emerald-900 to-emerald-800 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        <CalendarIcon className="w-8 h-8" />
                        Mon Emploi du Temps
                    </h1>
                    <p className="text-emerald-200 font-medium max-w-xl">
                        Retrouvez toutes vos heures de cours programmées selon les classes assignées.
                    </p>
                </div>
            </div>

            {/* GRILLE D'EMPLOI DU TEMPS */}
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
                                {mySeances.filter(s => s.jour === jour).map(seance => {
                                    const matiere = matieres.find(m => m.id === seance.matiereId);
                                    return (
                                        <div 
                                            key={seance.id} 
                                            className={`absolute left-1 right-1 rounded-xl p-3 shadow-lg flex flex-col justify-between overflow-hidden group ${seance.couleur || 'bg-emerald-500'} text-white z-10 hover:z-30 transition-all hover:scale-105 cursor-default border border-white/20`}
                                            style={getSeanceStyle(seance)}
                                        >
                                            <div>
                                                <h4 className="font-black text-sm leading-tight line-clamp-2">
                                                    {matiere?.nom}
                                                </h4>
                                                <div className="text-[10px] font-bold text-white/80 mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {seance.heureDebut} - {seance.heureFin}
                                                </div>
                                            </div>

                                            <div className="mt-2 text-[10px] space-y-1">
                                                <div className="flex items-center gap-1 bg-black/20 rounded px-1.5 py-0.5 w-max font-medium uppercase">
                                                    <Users className="w-3 h-3" />
                                                    {seance.classe}
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
        </div>
    );
};
