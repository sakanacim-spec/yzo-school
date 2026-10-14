import React, { useEffect, useState } from 'react';
import { parentApi } from '../services/parentApi';
import { useStore } from '../store/useStore';
import { Users, Phone, Calendar, MessageSquare, Search, Loader2, UserCheck, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { t } from '../i18n';
import type { Language } from '../i18n';
import { DirectorLinkRequests } from '../components/DirectorLinkRequests';

type ParentsListTab = 'accounts' | 'link_requests';

const ALLOWED_DIRECTOR_ROLES = ['admin', 'directeur', 'directeur_general'];

export const ParentsList: React.FC = () => {
    const { language } = useStore();
    const parents = useStore((s) => s.parents);
    const setParents = useStore((s) => s.setParents);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const setCurrentPage = useStore((s) => s.setCurrentPage);
    const user = useStore((s) => s.user);

    const [activeTab, setActiveTab] = useState<ParentsListTab>('accounts');
    const [pendingRequestsCount, setPendingRequestsCount] = useState<number | null>(null);

    const canManageLinkRequests = !!(user?.role && ALLOWED_DIRECTOR_ROLES.includes(user.role));

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
            alert(t(language as Language, 'parents.deleteError') || "Erreur lors de la suppression. Seul le Directeur Général peut le faire.");
        }
    };

    useEffect(() => {
        fetchParents();
    }, []);

    const filteredParents = parents.filter(p =>
        p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.telephone.includes(searchTerm)
    );

    if (loading && activeTab === 'accounts' && parents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p className="text-slate-500">{t(language as Language, 'parents.loadingAccounts') || 'Chargement des comptes parents...'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Barre de titre et sélecteur d'onglets */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                            {t(language as Language, 'parents.management') || 'Gestion des Parents'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {activeTab === 'accounts'
                                ? (t(language as Language, 'parents.listCount') || 'Liste des {{count}} parents inscrits sur la plateforme.').replace('{{count}}', String(parents.length))
                                : 'Traitement et validation des demandes de rattachement parent-élève.'}
                        </p>
                    </div>

                    {/* Champ de recherche pour l'onglet Comptes */}
                    {activeTab === 'accounts' && (
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t(language as Language, 'parents.searchPlaceholder') || "Rechercher un parent..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                    )}
                </div>

                {/* Onglets navigation (uniquement pour les rôles autorisés) */}
                {canManageLinkRequests && (
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
                        <button
                            type="button"
                            onClick={() => setActiveTab('accounts')}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all ${
                                activeTab === 'accounts'
                                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            <span>Comptes Parents</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                {parents.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('link_requests')}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all ${
                                activeTab === 'link_requests'
                                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Clock className="w-4 h-4" />
                            <span>Demandes de rattachement</span>
                            {pendingRequestsCount !== null && pendingRequestsCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                                    {pendingRequestsCount}
                                </span>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Contenu selon l'onglet actif */}
            {activeTab === 'link_requests' && canManageLinkRequests ? (
                <DirectorLinkRequests onCountChange={setPendingRequestsCount} />
            ) : (
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
                                        {t(language as Language, 'common.active') || 'Actif'}
                                    </span>
                                    {(user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general') && (
                                        <button
                                            onClick={() => handleAdminDelete(parent.id)}
                                            className={`p-1.5 rounded-lg transition-colors ${deleteConfirm === parent.id ? 'bg-red-600 text-white animate-pulse' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'}`}
                                            title={t(language as Language, 'parents.deleteAccount') || "Supprimer définitivement ce compte"}
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
                                        <span>{(t(language as Language, 'parents.registeredOn') || 'Inscrit le {{date}}').replace('{{date}}', format(new Date(parent.createdAt || parent.created_at || Date.now()), 'dd/MM/yyyy'))}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            useStore.getState().setChatRecipientId(parent.id);
                                            setCurrentPage('chat');
                                        }}
                                        className="flex items-center gap-1.5 text-blue-600 font-bold hover:underline"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        {t(language as Language, 'common.contact') || 'Contacter'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredParents.length === 0 && (
                        <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>{t(language as Language, 'parents.notFound') || 'Aucun compte parent trouvé.'}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
