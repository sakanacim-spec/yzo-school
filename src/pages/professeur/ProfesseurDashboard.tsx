import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BookOpen, Users, GraduationCap, Edit3 } from 'lucide-react';

export const ProfesseurDashboard: React.FC = () => {
    const { user, students, classeMatieres, matieres, setCurrentPage } = useStore();

    // Trouver les assignations pour ce professeur
    const myAssignations = useMemo(() => {
        if (!user) return [];
        const userName = (user.nom || '').trim().toLowerCase();
        const userUsername = (user.username || '').trim().toLowerCase();
        
        return classeMatieres.filter((cm) => {
            const profName = (cm.professeur || '').trim().toLowerCase();
            return profName === userName || profName === userUsername;
        });
    }, [classeMatieres, user]);

    // Calculer le nombre total de classes uniques
    const myClasses = useMemo(() => {
        const classesSet = new Set(myAssignations.map(a => a.classe));
        return Array.from(classesSet);
    }, [myAssignations]);

    // Calculer le nombre total d'élèves sous sa responsabilité
    const totalStudents = useMemo(() => {
        return students.filter(s => myClasses.includes(s.classe)).length;
    }, [students, myClasses]);

    const handleSaisieNotes = () => {
        setCurrentPage('saisie_notes');
    };

    const handleSaisiePresence = () => {
        setCurrentPage('saisie_presence');
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* EN-TÊTE */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-white mb-2">
                        Bienvenue, {user?.nom} 👋
                    </h1>
                    <p className="text-indigo-200 font-medium max-w-xl">
                        Voici un aperçu de vos classes et de vos statistiques pour cette année scolaire.
                    </p>
                </div>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                        <Users className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Total Élèves</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{totalStudents}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Classes Assignées</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{myClasses.length}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5">
                    <div className="w-14 h-14 bg-amber-100 dark:bg-amber-500/20 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                        <GraduationCap className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Matières Enseignées</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{myAssignations.length}</p>
                    </div>
                </div>
            </div>

            {/* QUICK ACTIONS & LIST */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-black text-slate-800 dark:text-white">Vos Classes et Matières</h2>
                    </div>

                    {myAssignations.length > 0 ? (
                        <div className="space-y-4">
                            {myAssignations.map((assignation) => {
                                const matiere = matieres.find(m => m.id === assignation.matiereId);
                                const countEleves = students.filter(s => s.classe === assignation.classe).length;
                                return (
                                    <div key={assignation.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-xl flex items-center justify-center">
                                                <BookOpen className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-white">{matiere?.nom || 'Matière Inconnue'}</p>
                                                <p className="text-sm text-slate-500 flex items-center gap-2">
                                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{assignation.classe}</span>
                                                    <span>•</span>
                                                    <span>{countEleves} élèves</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Coef</p>
                                            <p className="font-black text-slate-700 dark:text-slate-300">{assignation.coefficient}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Aucune classe assignée</h3>
                            <p className="text-sm text-slate-500">L'administration ne vous a pas encore assigné de classes ou de matières.</p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-gradient-to-b from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                        
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                                <Edit3 className="w-6 h-6 text-white" />
                            </div>
                            
                            <h3 className="text-2xl font-black mb-2">Saisie des notes</h3>
                            <p className="text-indigo-100 font-medium mb-8 flex-1">
                                Accédez à l'interface de saisie pour entrer les notes d'interrogation, de devoir et de composition de vos élèves.
                            </p>
                            
                            <button 
                                onClick={handleSaisieNotes}
                                className="w-full py-4 bg-white text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-lg"
                            >
                                Saisir les notes
                            </button>
                        </div>
                    </div>

                    <div className="bg-gradient-to-b from-emerald-500 to-emerald-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                        
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                                <BookOpen className="w-6 h-6 text-white" />
                            </div>
                            
                            <h3 className="text-2xl font-black mb-2">Cahier de Textes</h3>
                            <p className="text-emerald-100 font-medium mb-8 flex-1">
                                Saisissez les devoirs à la maison et faites l'appel de présence pour vos classes.
                            </p>
                            
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => setCurrentPage('cahier_textes')}
                                    className="w-full py-3 bg-white text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-colors shadow-lg"
                                >
                                    Ouvrir le cahier
                                </button>
                                <button 
                                    onClick={handleSaisiePresence}
                                    className="w-full py-3 bg-emerald-800 text-white border border-emerald-400/50 rounded-xl font-bold hover:bg-emerald-900 transition-colors shadow-lg"
                                >
                                    Faire l'appel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
