import React, { useEffect, useState } from 'react';
import { parentApi } from '../services/parentApi';
import { useStore } from '../store/useStore';
import { Users, Phone, Calendar, MessageSquare, Search, Loader2, UserCheck, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export const ParentsList: React.FC = () => {
    const parents = useStore((s) => s.parents);
    const setParents = useStore((s) => s.setParents);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const setCurrentPage = useStore((s) => s.setCurrentPage);
    const user = useStore((s) => s.user);

    const fetchParents = async () => {
        setLoading(true);
        try {
            const data = await parentApi.getParentList();
            setParents(data);
        } catch (err) {
            console.error("Erreur chargement parents:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdminDelete = async (parentId: string) => {
        if (deleteConfirm !== parentId) {
            setDeleteConfirm(parentId);
            return;
        }

        try {
            await parentApi.adminDeleteParent(parentId);
            setParents(parents.filter(p => p.id !== parentId));
            setDeleteConfirm(null);
        } catch (err) {
            alert("Erreur lors de la suppression. Seul le Directeur Général peut le faire.");
        }
    };

    useEffect(() => {
        fetchParents();
    }, []);

    const filteredParents = parents.filter(p =>
        p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.telephone.includes(searchTerm)
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p className="text-slate-500">Chargement des comptes parents...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Gestion des Parents</h2>
                    <p className="text-sm text-slate-500">Liste des {parents.length} parents inscrits sur la plateforme.</p>
                </div>

                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un parent..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredParents.map((parent) => (
                    <div key={parent.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-all">
                                {parent.nom.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-lg uppercase flex items-center gap-1">
                                    <UserCheck className="w-3 h-3" />
                                    Actif
                                </span>
                                {(user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general') && (
                                    <button
                                        onClick={() => handleAdminDelete(parent.id)}
                                        className={`p-1.5 rounded-lg transition-colors ${deleteConfirm === parent.id ? 'bg-red-600 text-white animate-pulse' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'}`}
                                        title="Supprimer définitivement ce compte"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{parent.nom}</h3>
                                <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>{parent.telephone}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>Inscrit le {format(new Date(parent.createdAt || parent.created_at || Date.now()), 'dd/MM/yyyy')}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        useStore.getState().setChatRecipientId(parent.id);
                                        setCurrentPage('chat');
                                    }}
                                    className="flex items-center gap-1.5 text-blue-600 font-bold hover:underline"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Contacter
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {filteredParents.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>Aucun compte parent trouvé.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
