import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { MatiereCategorie } from '../types';
import { v4 as uuid } from '../utils/uuid';
import { BookOpen, Plus, Trash2, Settings2, Users, Layers, Library } from 'lucide-react';

export const GestionAcademique: React.FC = () => {
    const { 
        matieres, addMatiere, deleteMatiere,
        classeMatieres, addClasseMatiere, deleteClasseMatiere,
        students
    } = useStore();

    const classesList = Array.from(new Set(students.map(s => s.classe))).sort();
    const [activeTab, setActiveTab] = useState<'matieres' | 'liaisons'>('matieres');

    const [nomMatiere, setNomMatiere] = useState('');
    const [categorie, setCategorie] = useState<MatiereCategorie>('1-MATIERES LITTERAIRES');

    const [selectedClasse, setSelectedClasse] = useState('');
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [professeur, setProfesseur] = useState('');
    const [coefficient, setCoefficient] = useState(1);

    const handleAddMatiere = (e: React.FormEvent) => {
        e.preventDefault();
        if (!nomMatiere.trim()) return;
        addMatiere({ id: uuid(), nom: nomMatiere.trim(), categorie });
        setNomMatiere('');
    };

    const handleAddLiaison = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClasse || !selectedMatiere || coefficient <= 0) return;
        const existing = classeMatieres.find(cm => cm.classe === selectedClasse && cm.matiereId === selectedMatiere);
        if (existing) {
            alert('Cette matière est déjà enseignée dans cette classe.');
            return;
        }

        addClasseMatiere({
            id: uuid(),
            classe: selectedClasse,
            matiereId: selectedMatiere,
            professeur: professeur.trim(),
            coefficient
        });
        setSelectedMatiere('');
        setProfesseur('');
        setCoefficient(1);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20 animate-slideUp">
            
            {/* ── HEADER ── */}
            <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-indigo-100 dark:border-indigo-900/30">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
                    <Library className="w-64 h-64 text-indigo-500" />
                </div>
                
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                        <BookOpen className="w-3.5 h-3.5" /> Pédagogie
                    </div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
                        Gestion <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-indigo-600">Académique</span>
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
                        Structurez le catalogue de matières et définissez les coefficients pour chaque classe.
                    </p>
                </div>
            </div>

            {/* ── TABS ── */}
            <div className="flex gap-2 p-2 bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-700/50 w-fit">
                <button
                    onClick={() => setActiveTab('matieres')}
                    className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                        activeTab === 'matieres' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
                    }`}
                >
                    <Settings2 className="w-4 h-4" /> Catalogue des Matières
                </button>
                <button
                    onClick={() => setActiveTab('liaisons')}
                    className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                        activeTab === 'liaisons' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
                    }`}
                >
                    <Users className="w-4 h-4" /> Assignations & Coefficients
                </button>
            </div>

            {/* ── TAB: MATIERES ── */}
            {activeTab === 'matieres' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                    
                    {/* Colonne Création */}
                    <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 h-fit sticky top-6">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            Nouvelle Matière
                        </h3>
                        <form onSubmit={handleAddMatiere} className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Intitulé
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={nomMatiere}
                                    onChange={(e) => setNomMatiere(e.target.value)}
                                    placeholder="Ex: Mathématiques"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Catégorie
                                </label>
                                <select
                                    value={categorie}
                                    onChange={(e) => setCategorie(e.target.value as MatiereCategorie)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                >
                                    <option value="1-MATIERES LITTERAIRES">1 - Littéraires</option>
                                    <option value="2-MATIERES SCIENTIFIQUES">2 - Scientifiques</option>
                                    <option value="3-AUTRES MATIERES">3 - Autres</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all"
                            >
                                Ajouter la matière
                            </button>
                        </form>
                    </div>

                    {/* Colonne Répertoire */}
                    <div className="lg:col-span-2 pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                                    <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                Répertoire Global
                            </h3>
                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                {matieres.length} enregistrements
                            </span>
                        </div>
                        
                        <div className="space-y-6">
                            {matieres.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                                    <p className="text-sm font-bold text-slate-500">Aucune matière n'est configurée.</p>
                                </div>
                            ) : (
                                ['1-MATIERES LITTERAIRES', '2-MATIERES SCIENTIFIQUES', '3-AUTRES MATIERES'].map((cat) => {
                                    const catsMatieres = matieres.filter(m => m.categorie === cat);
                                    if (catsMatieres.length === 0) return null;
                                    return (
                                        <div key={cat} className="space-y-3">
                                            <h4 className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                {cat.substring(2)}
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {catsMatieres.map(mat => (
                                                    <div key={mat.id} className="group flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all">
                                                        <span className="font-bold text-sm text-slate-900 dark:text-white">{mat.nom}</span>
                                                        <button 
                                                            onClick={() => deleteMatiere(mat.id)} 
                                                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: LIAISONS ── */}
            {activeTab === 'liaisons' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                    
                    {/* Colonne Assignation */}
                    <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 h-fit sticky top-6">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            Nouvelle Assignation
                        </h3>
                        <form onSubmit={handleAddLiaison} className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Classe cible
                                </label>
                                <select
                                    required
                                    value={selectedClasse}
                                    onChange={(e) => setSelectedClasse(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                >
                                    <option value="">Sélectionner une classe...</option>
                                    {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Matière à enseigner
                                </label>
                                <select
                                    required
                                    value={selectedMatiere}
                                    onChange={(e) => setSelectedMatiere(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                >
                                    <option value="">Sélectionner une matière...</option>
                                    {matieres.map(m => <option key={m.id} value={m.id}>{m.nom} ({m.categorie.substring(2)})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Professeur (Optionnel)
                                </label>
                                <input
                                    type="text"
                                    value={professeur}
                                    onChange={(e) => setProfesseur(e.target.value)}
                                    placeholder="Ex: M. DUBOIS"
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                    Coefficient
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="0.5"
                                    step="0.5"
                                    value={coefficient}
                                    onChange={(e) => setCoefficient(parseFloat(e.target.value))}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all"
                            >
                                Valider l'assignation
                            </button>
                        </form>
                    </div>

                    {/* Colonne Liste */}
                    <div className="lg:col-span-2 pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                                    <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                Programme par Classe
                            </h3>
                            <select
                                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                value={selectedClasse}
                                onChange={(e) => setSelectedClasse(e.target.value)}
                            >
                                <option value="">Toutes les classes</option>
                                {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        
                        <div>
                            {classeMatieres.filter(cm => selectedClasse === '' || cm.classe === selectedClasse).length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                                    <p className="text-sm font-bold text-slate-500">Aucune matière n'est assignée pour cette sélection.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">Classe</th>
                                                <th className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">Matière</th>
                                                <th className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">Professeur</th>
                                                <th className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">Coef.</th>
                                                <th className="py-4 px-4 font-black text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {classeMatieres
                                                .filter(cm => selectedClasse === '' || cm.classe === selectedClasse)
                                                .sort((a,b) => a.classe.localeCompare(b.classe))
                                                .map(cm => {
                                                    const mat = matieres.find(m => m.id === cm.matiereId);
                                                    return (
                                                        <tr key={cm.id} className="group border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <td className="py-4 px-4 font-black text-sm text-slate-900 dark:text-white">{cm.classe}</td>
                                                            <td className="py-4 px-4 font-bold text-sm text-slate-700 dark:text-slate-300">{mat ? mat.nom : 'Inconnue'}</td>
                                                            <td className="py-4 px-4 font-medium text-sm text-slate-500">{cm.professeur || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                                                            <td className="py-4 px-4">
                                                                <span className="inline-flex items-center justify-center min-w-[2.5rem] py-1 px-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-black">
                                                                    {cm.coefficient}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 px-4 text-right">
                                                                <button 
                                                                    onClick={() => deleteClasseMatiere(cm.id)} 
                                                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
