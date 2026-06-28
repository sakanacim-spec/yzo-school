import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Resource, ResourceType } from '../../types';
import { FileText, Video, Link as LinkIcon, File, Plus, X, Trash2, Search, Filter } from 'lucide-react';
import { v4 as uuid } from '../../utils/uuid';
import { playSuccessSound } from '../../utils/audio';

export const ProfRessources: React.FC = () => {
    const user = useStore(s => s.user);
    const resources = useStore(s => s.resources);
    const addResource = useStore(s => s.addResource);
    const deleteResource = useStore(s => s.deleteResource);
    const classes = useStore(s => s.classes);
    
    const myResources = resources.filter(r => r.professeurId === user?.id);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('');

    const [form, setForm] = useState({
        titre: '',
        description: '',
        type: 'pdf' as ResourceType,
        url: '',
        classe: '',
        matiere: ''
    });

    const filteredResources = myResources.filter(r => 
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                setForm({ ...form, url: ev.target.result as string });
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.titre || !form.classe || !form.matiere || !form.url) {
            alert("Veuillez remplir tous les champs et fournir un fichier/lien.");
            return;
        }

        const newResource: Resource = {
            id: uuid(),
            titre: form.titre,
            description: form.description,
            type: form.type,
            url: form.url,
            classe: form.classe,
            matiere: form.matiere,
            professeurId: user!.id,
            professeurNom: `${user!.prenom} ${user!.nom}`,
            createdAt: new Date().toISOString()
        };

        addResource(newResource);
        setIsModalOpen(false);
        playSuccessSound();
        alert("Ressource ajoutée avec succès !");
        setForm({ titre: '', description: '', type: 'pdf', url: '', classe: '', matiere: '' });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Mes Ressources Pédagogiques</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Partagez des cours, exercices et vidéos avec vos élèves.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                    <Plus className="w-5 h-5" />
                    Ajouter une ressource
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre ou matière..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="relative w-full md:w-64">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                        value={filterClass}
                        onChange={(e) => setFilterClass(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                    >
                        <option value="">Toutes les classes</option>
                        {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredResources.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-white/50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700">
                        Aucune ressource trouvée. Cliquez sur "Ajouter une ressource" pour commencer.
                    </div>
                ) : (
                    filteredResources.map(res => (
                        <div key={res.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all group flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                    {getIcon(res.type)}
                                </div>
                                <button 
                                    onClick={() => deleteResource(res.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-1">{res.titre}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 flex-grow">{res.description || "Aucune description"}</p>
                            
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
                                <span className="text-xs font-medium px-2 py-1 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-md">
                                    {res.matiere}
                                </span>
                                <span className="text-xs font-medium px-2 py-1 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 rounded-md">
                                    Classe: {res.classe}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ajouter une ressource</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Titre de la ressource *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.titre}
                                    onChange={e => setForm({ ...form, titre: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Classe *</label>
                                    <select
                                        required
                                        value={form.classe}
                                        onChange={e => setForm({ ...form, classe: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Sélectionner</option>
                                        {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Matière *</label>
                                    <input
                                        type="text"
                                        required
                                        value={form.matiere}
                                        onChange={e => setForm({ ...form, matiere: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type de contenu *</label>
                                <select
                                    value={form.type}
                                    onChange={e => setForm({ ...form, type: e.target.value as ResourceType, url: '' })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="pdf">Document PDF</option>
                                    <option value="document">Fichier Word/Excel</option>
                                    <option value="video">Vidéo</option>
                                    <option value="link">Lien externe</option>
                                </select>
                            </div>

                            {form.type === 'link' || form.type === 'video' ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL / Lien *</label>
                                    <input
                                        type="url"
                                        required
                                        value={form.url}
                                        onChange={e => setForm({ ...form, url: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fichier *</label>
                                    <input
                                        type="file"
                                        required={!form.url}
                                        accept={form.type === 'pdf' ? '.pdf' : '.doc,.docx,.xls,.xlsx'}
                                        onChange={handleFileChange}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optionnel)</label>
                                <textarea
                                    rows={3}
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    type="submit"
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all"
                                >
                                    Publier la ressource
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
