import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { ResourceType } from '../../types';
import { FileText, Video, Link as LinkIcon, File, Search, Filter, Download, ExternalLink } from 'lucide-react';

export const ParentRessources: React.FC = () => {
    const user = useStore(s => s.user);
    const students = useStore(s => s.students);
    const resources = useStore(s => s.resources);
    
    // Si connecté en tant que parent, on récupère les classes de ses enfants
    // Si connecté en tant qu'élève (le parent dashboard gère les deux), on récupère la classe de l'élève
    const parentStudents = students.filter(s => s.parentId === user?.id || s.id === user?.id);
    const studentClasses = Array.from(new Set(parentStudents.map(s => s.classe)));

    // Seules les ressources des classes des enfants sont visibles
    const availableResources = resources.filter(r => studentClasses.includes(r.classe));

    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState(studentClasses.length === 1 ? studentClasses[0] : '');

    const filteredResources = availableResources.filter(r => 
        (filterClass === '' || r.classe === filterClass) &&
        (r.titre.toLowerCase().includes(searchTerm.toLowerCase()) || r.matiere.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getIcon = (type: ResourceType) => {
        switch(type) {
            case 'pdf': return <FileText className="text-red-500 w-6 h-6" />;
            case 'video': return <Video className="text-blue-500 w-6 h-6" />;
            case 'link': return <LinkIcon className="text-green-500 w-6 h-6" />;
            default: return <File className="text-slate-500 w-6 h-6" />;
        }
    };

    const handleAction = (res: typeof resources[0]) => {
        if (res.type === 'link' || res.type === 'video') {
            window.open(res.url, '_blank');
        } else {
            // Pour les fichiers en base64, on déclenche un téléchargement
            const a = document.createElement('a');
            a.href = res.url;
            a.download = `${res.titre}.${res.type === 'pdf' ? 'pdf' : 'docx'}`; // Simplification
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Ressources & Cours (E-Learning)</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Consultez les cours et exercices partagés par les professeurs.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un cours..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                {studentClasses.length > 1 && (
                    <div className="relative w-full md:w-64">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <select
                            value={filterClass}
                            onChange={(e) => setFilterClass(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                        >
                            <option value="">Toutes les classes</option>
                            {studentClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredResources.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-white/50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700">
                        Aucun cours disponible pour le moment.
                    </div>
                ) : (
                    filteredResources.map(res => (
                        <div key={res.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                    {getIcon(res.type)}
                                </div>
                                <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">
                                    {new Date(res.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-1">{res.titre}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4 line-clamp-2 flex-grow">{res.description || "Aucune description"}</p>
                            
                            <div className="flex items-center gap-2 mb-4 text-xs font-medium">
                                <span className="px-2 py-1 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-md">
                                    {res.matiere}
                                </span>
                                <span className="px-2 py-1 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 rounded-md">
                                    Classe: {res.classe}
                                </span>
                            </div>

                            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                                Ajouté par: {res.professeurNom}
                            </p>

                            <button
                                onClick={() => handleAction(res)}
                                className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold transition-all mt-auto"
                            >
                                {res.type === 'link' || res.type === 'video' ? (
                                    <>Ouvrir le lien <ExternalLink className="w-4 h-4" /></>
                                ) : (
                                    <>Télécharger <Download className="w-4 h-4" /></>
                                )}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
