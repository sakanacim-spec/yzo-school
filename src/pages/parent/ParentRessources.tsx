import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { ResourceType } from '../../types';
import {
    FileText, Video, Link as LinkIcon, File, Search,
    Download, ExternalLink, BookOpen, Layers, GraduationCap,
    Filter, Clock, User, ChevronRight, Zap
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';
import type { Language } from '../../types';

// ── Catégorisation des ressources ────────────────────────────
type ResourceCategory = 'all' | 'cours' | 'exercices' | 'autre';

const getCategoryFromResource = (res: any): ResourceCategory => {
    const titre = (res.titre || '').toLowerCase();
    const desc = (res.description || '').toLowerCase();
    if (titre.includes('cours') || titre.includes('leçon') || titre.includes('chapitre') || desc.includes('cours')) return 'cours';
    if (titre.includes('exercice') || titre.includes('devoir') || titre.includes('tp') || titre.includes('travail') || desc.includes('exercice')) return 'exercices';
    return 'autre';
};

const getCategoryConfig = (language: Language) => ({
    all: { label: t(language, 'parentResources.catAll') || 'Tout', icon: <Layers className="w-4 h-4" />, color: 'bg-slate-700 text-white' },
    cours: { label: t(language, 'parentResources.catCours') || 'Cours', icon: <BookOpen className="w-4 h-4" />, color: 'bg-blue-600 text-white' },
    exercices: { label: t(language, 'parentResources.catExercices') || 'Exercices', icon: <GraduationCap className="w-4 h-4" />, color: 'bg-indigo-600 text-white' },
    autre: { label: t(language, 'parentResources.catAutre') || 'Autre', icon: <File className="w-4 h-4" />, color: 'bg-slate-500 text-white' },
});

const getTypeConfig = (language: Language): Record<ResourceType | string, { icon: React.ReactNode; badge: string; badgeColor: string }> => ({
    pdf: { icon: <FileText className="w-6 h-6 text-red-500" />, badge: 'PDF', badgeColor: 'bg-red-100 text-red-700' },
    video: { icon: <Video className="w-6 h-6 text-blue-500" />, badge: t(language, 'common.video') || 'Vidéo', badgeColor: 'bg-blue-100 text-blue-700' },
    link: { icon: <LinkIcon className="w-6 h-6 text-green-500" />, badge: t(language, 'common.link') || 'Lien', badgeColor: 'bg-green-100 text-green-700' },
    default: { icon: <File className="w-6 h-6 text-slate-400" />, badge: t(language, 'common.file') || 'Fichier', badgeColor: 'bg-slate-100 text-slate-600' },
});

export const ParentRessources: React.FC = () => {
    const { language } = useStore();
    const students = useStore(s => s.students);
    const resources = useStore(s => s.resources);

    const studentClasses = useMemo(
        () => Array.from(new Set(students.map(s => s.classe).filter(Boolean))),
        [students]
    );

    const availableResources = useMemo(
        () => resources.filter(r => studentClasses.includes(r.classe)),
        [resources, studentClasses]
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState(studentClasses.length === 1 ? studentClasses[0] : '');
    const [activeCategory, setActiveCategory] = useState<ResourceCategory>('all');

    const categoryCounts = useMemo(() => {
        const counts: Record<ResourceCategory, number> = { all: 0, cours: 0, exercices: 0, autre: 0 };
        availableResources.forEach(r => {
            const cat = getCategoryFromResource(r);
            counts[cat]++;
            counts.all++;
        });
        return counts;
    }, [availableResources]);

    const filteredResources = useMemo(() => {
        return availableResources.filter(r => {
            const matchClass = filterClass === '' || r.classe === filterClass;
            const matchSearch = searchTerm === '' ||
                r.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.matiere.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCategory = activeCategory === 'all' || getCategoryFromResource(r) === activeCategory;
            return matchClass && matchSearch && matchCategory;
        });
    }, [availableResources, filterClass, searchTerm, activeCategory]);

    const handleAction = (res: typeof resources[0]) => {
        if (res.type === 'link' || res.type === 'video') {
            window.open(res.url, '_blank', 'noopener,noreferrer');
        } else {
            const a = document.createElement('a');
            a.href = res.url;
            a.download = `${res.titre}.${res.type === 'pdf' ? 'pdf' : 'docx'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* ── Header ── */}
            <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                            <Zap className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">{t(language as Language, 'parentResources.title') || 'E-Learning'}</h2>
                            <p className="text-teal-100 font-medium text-sm mt-0.5">{t(language as Language, 'parentResources.subtitle') || 'Cours, exercices et ressources partagés par les professeurs'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 px-5 py-3 rounded-2xl">
                            <p className="text-white font-black text-2xl leading-none">{availableResources.length}</p>
                            <p className="text-teal-100 text-[10px] font-bold uppercase tracking-widest">{t(language as Language, 'common.resources') || 'Ressource(s)'}</p>
                        </div>
                        <div className="bg-white/20 px-5 py-3 rounded-2xl">
                            <p className="text-white font-black text-2xl leading-none">{studentClasses.length}</p>
                            <p className="text-teal-100 text-[10px] font-bold uppercase tracking-widest">{t(language as Language, 'common.classes') || 'Classe(s)'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Filtres ── */}
            <div className="flex flex-col md:flex-row gap-4">
                {/* Recherche */}
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder={t(language as Language, 'parentResources.searchPlaceholder') || "Rechercher un cours, une matière..."}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none font-medium text-slate-700 dark:text-slate-300"
                    />
                </div>
                {/* Filtre classe */}
                {studentClasses.length > 1 && (
                    <div className="relative w-full md:w-52">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={filterClass}
                            onChange={e => setFilterClass(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none appearance-none font-bold text-slate-700 dark:text-slate-300"
                        >
                            <option value="">{t(language as Language, 'parentResources.allClasses') || 'Toutes les classes'}</option>
                            {studentClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* ── Catégories ── */}
            <div className="flex flex-wrap gap-2">
                {(Object.keys(getCategoryConfig(language as Language)) as ResourceCategory[]).map(cat => {
                    const cfg = getCategoryConfig(language as Language)[cat];
                    const count = categoryCounts[cat];
                    const isActive = activeCategory === cat;
                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${
                                isActive
                                    ? `${cfg.color} border-transparent shadow-md scale-105`
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-300'
                            }`}
                        >
                            {cfg.icon}
                            {cfg.label}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Grille ressources ── */}
            {filteredResources.length === 0 ? (
                <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-700">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <BookOpen className="w-8 h-8 text-slate-200" />
                    </div>
                    <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">{t(language as Language, 'parentResources.noResourceTitle') || 'Aucune ressource'}</h3>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto">
                        {availableResources.length === 0
                            ? (t(language as Language, 'parentResources.noResourceShared') || "Les professeurs n'ont pas encore partagé de cours pour vos classes.")
                            : (t(language as Language, 'parentResources.noResourceFilterMatch') || "Aucune ressource ne correspond à vos filtres.")}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredResources.map(res => {
                        const typeCfg = getTypeConfig(language as Language)[res.type] || getTypeConfig(language as Language).default;
                        const category = getCategoryFromResource(res);
                        const catCfg = getCategoryConfig(language as Language)[category];
                        const isDownloadable = res.type !== 'link' && res.type !== 'video';

                        return (
                            <div
                                key={res.id}
                                className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all group flex flex-col overflow-hidden"
                            >
                                {/* Barre catégorie */}
                                <div className={`h-1.5 w-full ${category === 'cours' ? 'bg-blue-500' : category === 'exercices' ? 'bg-indigo-500' : 'bg-slate-300'}`} />

                                <div className="p-6 flex flex-col flex-1">
                                    {/* Header card */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl group-hover:scale-110 transition-transform">
                                            {typeCfg.icon}
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${typeCfg.badgeColor}`}>{typeCfg.badge}</span>
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${catCfg.color}`}>{catCfg.label}</span>
                                        </div>
                                    </div>

                                    {/* Titre & Description */}
                                    <h3 className="font-black text-slate-900 dark:text-white text-lg line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-snug mb-2">{res.titre}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 flex-grow">{res.description || (t(language as Language, 'common.noDescription') || 'Aucune description')}</p>

                                    {/* Badges matière / classe */}
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        <span className="px-2.5 py-1 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 rounded-xl text-[10px] font-black">{res.matiere}</span>
                                        <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl text-[10px] font-black">{res.classe}</span>
                                    </div>

                                    {/* Méta */}
                                    <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400">
                                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {res.professeurNom}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(res.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}</span>
                                    </div>

                                    {/* Bouton action */}
                                    <button
                                        onClick={() => handleAction(res)}
                                        className="mt-5 w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-2xl font-bold transition-all active:scale-95 shadow-sm shadow-teal-600/20"
                                    >
                                        {isDownloadable ? (
                                            <><Download className="w-4 h-4" /> {t(language as Language, 'common.download') || 'Télécharger'}</>
                                        ) : (
                                            <><ExternalLink className="w-4 h-4" /> {t(language as Language, 'common.open') || 'Ouvrir'}</>
                                        )}
                                        <ChevronRight className="w-4 h-4 ml-auto" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
