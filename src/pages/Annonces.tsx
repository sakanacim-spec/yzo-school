// ============================================================
// ANNONCES — Gestion des annonces de l'école (admin)
// ============================================================
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import {
    Megaphone, Plus, Trash2, X, Send, Eye, EyeOff, Clock,
    AlertCircle, Info, AlertTriangle, Filter, CheckCircle
} from 'lucide-react';
import type { AnnouncementImportance, AnnouncementTarget } from '../types';

const IMPORTANCE_LABELS: Record<AnnouncementImportance, { label: string; color: string; icon: React.ReactNode }> = {
    info:      { label: 'Information',   color: 'bg-blue-500/10 text-blue-700 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]',    icon: <Info className="w-3.5 h-3.5" /> },
    important: { label: 'Important',     color: 'bg-amber-500/10 text-amber-700 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]',  icon: <AlertCircle className="w-3.5 h-3.5" /> },
    urgent:    { label: 'Urgent',        color: 'bg-rose-500/10 text-rose-700 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]',        icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

export const Annonces: React.FC = () => {
    const user            = useStore(s => s.user);
    const students        = useStore(s => s.students);
    const announcements   = useStore(s => s.announcements);
    const announcementReads = useStore(s => s.announcementReads);
    const addAnnouncement = useStore(s => s.addAnnouncement);
    const deleteAnnouncement = useStore(s => s.deleteAnnouncement);

    const isParent = user?.role === 'parent';

    const [hiddenAnnouncements, setHiddenAnnouncements] = useState<string[]>(() => {
        if (isParent) return JSON.parse(localStorage.getItem(`hidden_announcements_${user?.id}`) || '[]');
        return [];
    });

    const hideForParent = (id: string, titre: string) => {
        if (window.confirm(`Retirer l'annonce "${titre}" de votre liste ?`)) {
            const updated = [...hiddenAnnouncements, id];
            setHiddenAnnouncements(updated);
            localStorage.setItem(`hidden_announcements_${user?.id}`, JSON.stringify(updated));
        }
    };

    const [showForm, setShowForm]     = useState(false);
    const [titre, setTitre]           = useState('');
    const [message, setMessage]       = useState('');
    const [cible, setCible]           = useState<AnnouncementTarget>('all');
    const [importance, setImportance] = useState<AnnouncementImportance>('info');

    const classes = [...new Set(students.map(s => s.classe))].sort();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!titre.trim() || !message.trim()) return;
        addAnnouncement({
            titre: titre.trim(),
            message: message.trim(),
            date: new Date().toISOString().split('T')[0],
            cible,
            importance,
            createdBy: user?.nom || 'Admin',
        });
        setTitre('');
        setMessage('');
        setCible('all');
        setImportance('info');
        setShowForm(false);
    };

    const handleDelete = (id: string, titre: string) => {
        if (window.confirm(`Supprimer l'annonce "${titre}" ?`)) {
            deleteAnnouncement(id);
        }
    };

    const displayAnnouncements = announcements.filter(a => {
        if (isParent && hiddenAnnouncements.includes(a.id)) return false;
        if (isParent) return a.cible === 'all' || classes.includes(a.cible);
        return true;
    });

    // Calcul stats de lecture pour chaque annonce
    const getReadStats = (annonceId: string) => {
        const reads = announcementReads.filter(r => r.announcementId === annonceId && r.readAt);
        const parentsTotal = useStore.getState().connectedParentsCount || 0;
        return { lus: reads.length, total: Math.max(reads.length, parentsTotal) };
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-24">
            
            {/* Header Ultra-Premium */}
            <div className="rounded-[24px] p-6 md:p-8 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 text-white relative overflow-hidden shadow-[0_8px_30px_rgba(49,46,129,0.2)]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/10 backdrop-blur-xl rounded-[20px] flex items-center justify-center shadow-inner">
                            <Megaphone className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">Annonces & Communications</h2>
                            <p className="text-indigo-200 text-sm mt-1 font-medium max-w-md">
                                Gérez les communications avec les parents d'élèves. Les annonces importantes nécessitent une confirmation de lecture.
                            </p>
                        </div>
                    </div>
                    
                    {!isParent && (
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="group flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-900 active:scale-[0.98] hover:bg-slate-50 rounded-[16px] text-sm font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        >
                            {showForm ? <X className="w-5 h-5 transition-transform group-hover:rotate-90" /> : <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />}
                            {showForm ? 'Annuler' : 'Nouvelle Annonce'}
                        </button>
                    )}
                </div>

                {!isParent && (
                    <div className="grid grid-cols-3 gap-3 mt-8 relative z-10">
                        <div className="bg-white/10 backdrop-blur-md rounded-[20px] p-4 transition-colors">
                            <p className="text-3xl font-black text-white drop-shadow-md mb-1">{announcements.length}</p>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Total Annonces</p>
                        </div>
                        <div className="bg-rose-500/20 backdrop-blur-md rounded-[20px] p-4 transition-colors">
                            <p className="text-3xl font-black text-rose-100 drop-shadow-md mb-1">
                                {announcements.filter(a => a.importance === 'urgent').length}
                            </p>
                            <p className="text-xs font-bold text-rose-200 uppercase tracking-wider">Urgentes</p>
                        </div>
                        <div className="bg-emerald-500/20 backdrop-blur-md rounded-[20px] p-4 transition-colors">
                            <p className="text-3xl font-black text-emerald-100 drop-shadow-md mb-1">
                                {announcementReads.filter(r => r.readAt).length}
                            </p>
                            <p className="text-xs font-bold text-emerald-200 uppercase tracking-wider">Confirmations "Lues"</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Formulaire création avec Bento Layout */}
            {showForm && !isParent && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6 md:p-8 animate-slideDown">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600">
                            <Send className="w-5 h-5" />
                        </div>
                        Rédiger une nouvelle annonce
                    </h3>
                    
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            {/* Colonne Principale */}
                            <div className="md:col-span-8 space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                        Titre de l'annonce <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        value={titre}
                                        onChange={e => setTitre(e.target.value)}
                                        placeholder="Ex: Réunion de rentrée, Modification des horaires..."
                                        className="w-full bg-slate-50 border-none rounded-[16px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none transition-all placeholder-slate-400 font-medium text-slate-800"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                        Contenu détaillé <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        rows={5}
                                        placeholder="Rédigez le message détaillé qui sera lu par les parents..."
                                        className="w-full bg-slate-50 border-none rounded-[16px] px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none transition-all placeholder-slate-400 resize-none font-medium text-slate-800"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Colonne Paramètres (Bento) */}
                            <div className="md:col-span-4 space-y-6">
                                <div className="bg-slate-50 p-5 rounded-[20px]">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
                                        <Filter className="w-3.5 h-3.5 text-slate-400" />
                                        Destinataires
                                    </label>
                                    <select
                                        value={cible}
                                        onChange={e => setCible(e.target.value as AnnouncementTarget)}
                                        className="w-full border-none rounded-[14px] px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-100 outline-none font-medium shadow-sm cursor-pointer"
                                    >
                                        <option value="all">Établissement entier</option>
                                        <optgroup label="Classes spécifiques">
                                            {classes.map(c => <option key={c} value={c}>Classe: {c}</option>)}
                                        </optgroup>
                                    </select>
                                </div>

                                <div className="bg-slate-50 p-5 rounded-[20px]">
                                    <label className="block text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
                                        Niveau de priorité
                                    </label>
                                    <div className="flex flex-col gap-2">
                                        {(['info', 'important', 'urgent'] as const).map(level => {
                                            const isSelected = importance === level;
                                            return (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setImportance(level)}
                                                    className={`flex items-center gap-3 py-2.5 px-4 rounded-[14px] text-xs font-bold transition-all ${
                                                        isSelected
                                                            ? IMPORTANCE_LABELS[level].color + ' scale-[1.02]'
                                                            : 'bg-white text-slate-500 border-none shadow-sm hover:bg-slate-100 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {IMPORTANCE_LABELS[level].icon}
                                                    <span className="flex-1 text-left">{IMPORTANCE_LABELS[level].label}</span>
                                                    {isSelected && <CheckCircle className="w-4 h-4 opacity-70" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                            <button
                                type="submit"
                                disabled={!titre.trim() || !message.trim()}
                                className="flex items-center gap-2 px-8 py-3 bg-slate-900 active:scale-[0.98] hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-[16px] text-sm font-bold transition-all shadow-md"
                            >
                                <Send className="w-4 h-4" />
                                Publier l'annonce
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Liste des annonces */}
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-black text-slate-800">Journal des annonces</h3>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200">
                        {displayAnnouncements.length} {displayAnnouncements.length > 1 ? 'publiées' : 'publiée'}
                    </span>
                </div>

                {displayAnnouncements.length === 0 ? (
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-16 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Megaphone className="w-10 h-10 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-700 mb-2">
                            {isParent ? "Aucune annonce disponible" : "Le journal est vide"}
                        </p>
                        <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
                            {isParent 
                                ? "L'établissement n'a publié aucune annonce vous concernant pour le moment." 
                                : "Créez votre première annonce pour communiquer des informations importantes aux parents."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {displayAnnouncements.map(a => {
                            const imp = IMPORTANCE_LABELS[a.importance];
                            const stats = getReadStats(a.id);
                            const nonLus = stats.total - stats.lus;
                            const isReadByMe = isParent && announcementReads.some(r => r.announcementId === a.id && r.parentId === user?.id && r.readAt);

                            return (
                                <div key={a.id} className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-0 overflow-hidden group hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all">
                                    <div className="flex flex-col sm:flex-row">
                                        {/* Bande de couleur latérale (Importance) */}
                                        <div className={`w-2 shrink-0 ${
                                            a.importance === 'urgent' ? 'bg-rose-500' :
                                            a.importance === 'important' ? 'bg-amber-500' : 'bg-blue-500'
                                        }`}></div>
                                        
                                        <div className="flex-1 p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                                            <div className="flex-1 min-w-0">
                                                {/* Meta-données */}
                                                <div className="flex items-center gap-3 mb-4 flex-wrap">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[10px] text-[10px] font-black uppercase tracking-wider border ${imp.color}`}>
                                                        {imp.icon} {imp.label}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-[10px] bg-slate-50 text-[10px] font-bold text-slate-600">
                                                        <Filter className="w-3 h-3 text-slate-400" />
                                                        {a.cible === 'all' ? 'Toutes les classes' : `Cible: ${a.cible}`}
                                                    </span>
                                                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 ml-auto">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>

                                                {/* Contenu */}
                                                <h4 className="text-lg font-bold text-slate-900 mb-3 leading-tight">{a.titre}</h4>
                                                <p className="text-sm font-medium text-slate-600 leading-relaxed bg-slate-50/50 p-5 rounded-[20px]">
                                                    {a.message}
                                                </p>

                                                {/* Footer (Stats / Status) */}
                                                {!isParent ? (
                                                    <div className="flex items-center gap-6 mt-5">
                                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-[12px]">
                                                            <Eye className="w-4 h-4" />
                                                            <span>{stats.lus}</span>
                                                            <span className="font-medium text-emerald-700/70">Parent{stats.lus > 1 ? 's' : ''} touché{stats.lus > 1 ? 's' : ''}</span>
                                                        </div>
                                                        {nonLus > 0 && (
                                                            <div className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-[12px]">
                                                                <EyeOff className="w-4 h-4" />
                                                                <span>{nonLus}</span>
                                                                <span className="font-medium text-rose-700/70">En attente</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-5">
                                                        {isReadByMe ? (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-emerald-50 text-xs font-bold text-emerald-700">
                                                                <CheckCircle className="w-4 h-4 text-emerald-500" /> Confirmée lue
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-amber-50 text-xs font-bold text-amber-700">
                                                                <Clock className="w-4 h-4 text-amber-500" /> Lecture en attente
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-start shrink-0">
                                                <button
                                                    onClick={() => isParent ? hideForParent(a.id, a.titre) : handleDelete(a.id, a.titre)}
                                                    className="p-3 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[14px] transition-all group/btn active:scale-[0.98]"
                                                    title={isParent ? "Retirer de la liste" : "Supprimer définitivement"}
                                                >
                                                    <Trash2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

