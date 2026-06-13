// ============================================================
// HISTORIQUE ACTIVITÉS — Journal de toutes les actions admin
// ============================================================
import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatLogDate, getActionStyle } from '../utils/activityLogger';
import {
    Clock, Search, Trash2, Activity,
    LogIn, CreditCard, UserCog, FileText, UserCheck,
    Upload, ArrowDownToLine, MoreHorizontal
} from 'lucide-react';

const ACTION_ICONS: Record<string, React.ReactNode> = {
    connexion: <LogIn className="w-3.5 h-3.5" />,
    paiement: <CreditCard className="w-3.5 h-3.5" />,
    modification_eleve: <UserCog className="w-3.5 h-3.5" />,
    generation_recu: <FileText className="w-3.5 h-3.5" />,
    presence: <UserCheck className="w-3.5 h-3.5" />,
    import: <Upload className="w-3.5 h-3.5" />,
    export: <ArrowDownToLine className="w-3.5 h-3.5" />,
    suppression: <Trash2 className="w-3.5 h-3.5" />,
    autre: <MoreHorizontal className="w-3.5 h-3.5" />,
};

export const HistoriqueActivites: React.FC = () => {
    const activityLogs = useStore((s) => s.activityLogs);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterAction, setFilterAction] = useState<string>('');
    const [filterUser, setFilterUser] = useState<string>('');
    const [page, setPage] = useState(0);
    const PER_PAGE = 30;

    // Utilisateurs uniques
    const users = useMemo(() => [...new Set(activityLogs.map(l => l.utilisateur))], [activityLogs]);

    // Actions uniques
    const actions = useMemo(() => [...new Set(activityLogs.map(l => l.action))], [activityLogs]);

    // Filtrage
    const filteredLogs = useMemo(() => {
        return activityLogs.filter(log => {
            const matchSearch = !searchQuery ||
                log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.utilisateur.toLowerCase().includes(searchQuery.toLowerCase());
            const matchAction = !filterAction || log.action === filterAction;
            const matchUser = !filterUser || log.utilisateur === filterUser;
            return matchSearch && matchAction && matchUser;
        });
    }, [activityLogs, searchQuery, filterAction, filterUser]);

    const totalPages = Math.ceil(filteredLogs.length / PER_PAGE);
    const paginated = filteredLogs.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    // Statistiques rapides
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = activityLogs.filter(l => l.dateHeure.startsWith(today));
    const todayConnexions = todayLogs.filter(l => l.action === 'connexion').length;
    const todayPaiements = todayLogs.filter(l => l.action === 'paiement').length;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-slate-700 to-slate-900 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Historique des activités</h2>
                        <p className="text-slate-300 text-sm">Journal complet des actions</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{todayLogs.length}</p>
                        <p className="text-xs text-slate-300">Actions aujourd'hui</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{todayConnexions}</p>
                        <p className="text-xs text-slate-300">Connexions</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{todayPaiements}</p>
                        <p className="text-xs text-slate-300">Paiements</p>
                    </div>
                </div>
            </div>

            {/* Filtres */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                            placeholder="Rechercher une action..."
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <select
                        value={filterAction}
                        onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white sm:w-40"
                    >
                        <option value="">Toutes actions</option>
                        {actions.map(a => {
                            const style = getActionStyle(a);
                            return <option key={a} value={a}>{style.label}</option>;
                        })}
                    </select>
                    <select
                        value={filterUser}
                        onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white sm:w-40"
                    >
                        <option value="">Tous utilisateurs</option>
                        {users.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
            </div>

            {/* Liste des logs */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">
                        {filteredLogs.length} entrée{filteredLogs.length !== 1 ? 's' : ''}
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="px-3 py-1 text-xs rounded-lg bg-gray-100 disabled:opacity-40"
                            >
                                ←
                            </button>
                            <span className="text-xs text-gray-500">{page + 1}/{totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="px-3 py-1 text-xs rounded-lg bg-gray-100 disabled:opacity-40"
                            >
                                →
                            </button>
                        </div>
                    )}
                </div>

                <div className="divide-y divide-gray-50">
                    {paginated.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            <Clock className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                            Aucune activité enregistrée
                        </div>
                    ) : (
                        paginated.map((log) => {
                            const style = getActionStyle(log.action);
                            return (
                                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                                    <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                                        <span className={style.color}>{ACTION_ICONS[log.action]}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.color}`}>
                                                {style.label}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium">
                                                {log.utilisateur} ({log.utilisateurRole})
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-700 mt-0.5 truncate">{log.description}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                                        {formatLogDate(log.dateHeure)}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
