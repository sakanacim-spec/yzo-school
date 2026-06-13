import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { parentApi } from '../../services/parentApi';
import {
    CreditCard, Wallet, TrendingUp, Loader2, AlertCircle, UserPlus,
    Search, GraduationCap, X, Megaphone, AlertTriangle, Info, Bell, MessageSquare
} from 'lucide-react';
import { LinkStudentModal } from '../../components/LinkStudentModal';
import { SupportModal } from '../../components/SupportModal';
import { chatApi } from '../../services/chatApi';

// ── Types annonce ────────────────────────────────────────────
interface Announcement {
    id: string;
    titre: string;
    message: string;
    cible: string;
    importance: 'info' | 'important' | 'urgent';
    createdBy: string;
    createdAt: string;
    date?: string;
}

// ── Styles importance ────────────────────────────────────────
const IMP_STYLES = {
    info: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        header: 'bg-blue-600',
        badge: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: <Info className="w-5 h-5" />,
        dot: 'bg-blue-500',
        label: 'Information',
    },
    important: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        header: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: <AlertCircle className="w-5 h-5" />,
        dot: 'bg-amber-500',
        label: 'Important',
    },
    urgent: {
        bg: 'bg-red-50 dark:bg-red-950/20',
        border: 'border-red-200 dark:border-red-900',
        header: 'bg-red-600',
        badge: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200',
        icon: <AlertTriangle className="w-5 h-5" />,
        dot: 'bg-red-500',
        label: 'URGENT',
    },
};


// ── Composant principal ──────────────────────────────────────
export const ParentDashboard: React.FC = () => {
    const user = useStore((s) => s.user);
    const children = useStore((s) => s.students);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [notifStatus, setNotifStatus] = useState<NotificationPermission>(
        'Notification' in window ? Notification.permission : 'denied'
    );

    // État des annonces
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [showAnnouncementList, setShowAnnouncementList] = useState(false);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
    
    // Accès au store global pour les lectures
    const announcementReads = useStore(s => s.announcementReads);
    const markAnnouncementRead = useStore(s => s.markAnnouncementRead);
    
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initialiser l'état de notification (ne bloque pas)
    useEffect(() => {
        if ('Notification' in window) {
            setNotifPermission(Notification.permission);
            setNotifStatus(Notification.permission);
        } else {
            setNotifPermission('unsupported');
            setNotifStatus('denied');
        }
    }, []);

    const handleEnableNotifications = async () => {
        try {
            const permission = await Notification.requestPermission();
            setNotifPermission(permission);
            setNotifStatus(permission);
            
            if (permission === 'granted') {
                const { webPushService } = await import('../../services/webPushService');
                await webPushService.init();
                // console.log('🚀 Notifications activées');
            }
        } catch (err) {
            console.error('Erreur activation notifs:', err);
        }
    };

    // ── Chargement des données (Si store vide) ────────────────────────
    const fetchData = useCallback(async () => {
        if (children.length > 0) return; // Déjà chargé par useStore
        setLoading(true);
        setErrorMsg('');
        try {
            const data = await parentApi.getDashboard();
            // On s'assure que le store est mis à jour aussi
            useStore.setState({ students: data.students || [] });
        } catch (err: any) {
            setErrorMsg(err.message || "Erreur de chargement");
        } finally {
            setLoading(false);
        }
    }, [children.length]);

    // ── Polling toutes les 10 secondes ─────────────────────────
    useEffect(() => {
        fetchData();

        // Premier chargement annonces (via le store ou API locale si besoin)
        const fetchAnnouncementsLocal = async () => {
            try {
                const data = await parentApi.getAnnouncements();
                setAnnouncements(data.announcements || []);
            } catch (err) {
                console.warn('⚠️ Annonces non disponibles:', err);
            }
        };

        fetchAnnouncementsLocal();

        // Polling temps réel : toutes les 10 s
        pollingRef.current = setInterval(fetchAnnouncementsLocal, 10_000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [fetchData]);

    const handleUnlink = async (studentId: string, name: string) => {
        if (!window.confirm(`Voulez-vous vraiment retirer ${name} de votre compte ?`)) return;
        try {
            await parentApi.unlinkStudent(studentId);
            fetchData();
        } catch (err: any) {
            alert(err.error || "Erreur lors du retrait de l'enfant.");
        }
    };

    const totalEcolage = children.reduce((acc, s) => acc + s.ecolage, 0);
    const totalDejaPaye = children.reduce((acc, s) => acc + (s.dejaPaye || 0), 0);
    const totalRestant = children.reduce((acc, s) => acc + s.restant, 0);

    const handleStartChat = async (role: 'administration' | 'comptabilite') => {
        try {
            // On initialise la conversation d'abord
            await chatApi.initiateConversation(undefined, role);
            // Puis on navigue vers la page de chat
            useStore.getState().setCurrentPage('chat');
        } catch (err) {
            console.error('Erreur initiation chat:', err);
            alert('Impossible de lancer la discussion. Réessayez plus tard.');
        } finally {
            setShowSupportModal(false);
        }
    };

    // ── Nombre d'annonces non vues ───────────────────────────
    const unseenCount = announcements.filter(a => {
        const read = announcementReads.find(r => r.announcementId === a.id && r.parentId === user?.id);
        return !read || !read.readAt;
    }).length;

    if (loading && children.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p>Chargement de votre espace parent...</p>
            </div>
        );
    }

    if (errorMsg && children.length === 0) {
        return (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-red-900 mb-2">Erreur de connexion</h3>
                <p className="text-red-700">{errorMsg}</p>
                <button
                    onClick={() => fetchData()}
                    className="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    return (
        <>

            <div className="space-y-6">
                {/* ── Barre supérieure ── */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Salut, {user?.nom}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium italic mt-1">L'école de vos enfants dans votre poche.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Status Notifications */}
                        {notifStatus !== 'granted' && (
                            <button
                                onClick={handleEnableNotifications}
                                className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 transition-all animate-pulse"
                            >
                                <Bell className="w-4 h-4" />
                                Activer Notifications
                            </button>
                        )}
                        
                        {/* Bouton Annonces */}
                        <button
                            id="btn-announcements"
                            onClick={() => {
                                setShowAnnouncementList(v => !v);
                                if (!showAnnouncementList && user?.id) {
                                    // Marquer tout comme lu quand on ouvre la liste
                                    announcements.forEach(a => markAnnouncementRead(a.id, user.id));
                                }
                            }}
                            className="relative flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-slate-600 dark:text-slate-300 rounded-[20px] shadow-sm transition-all font-black text-sm active:scale-95"
                        >
                            <Bell className="w-5 h-5 text-blue-500" />
                            Annonces
                            {unseenCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-6 h-6 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-bounce">
                                    {unseenCount > 9 ? '9+' : unseenCount}
                                </span>
                            )}
                        </button>

                        <button
                            id="btn-link-child"
                            onClick={() => setIsLinkModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-600/20 transition-all font-bold text-sm"
                        >
                            <UserPlus className="w-5 h-5" />
                            Lier un nouvel enfant
                        </button>

                        <button
                            onClick={() => setShowSupportModal(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-600/20 transition-all font-bold text-sm"
                        >
                            <MessageSquare className="w-5 h-5" />
                            Assistance
                        </button>
                    </div>
                </div>

                {/* ── Panneau annonces (liste déroulante) ── */}
                {showAnnouncementList && (
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-blue-100 dark:border-slate-800 shadow-2xl overflow-hidden animate-slideDown">
                        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Megaphone className="w-6 h-6 text-white" />
                                <h3 className="font-black text-white">École Direct Info</h3>
                                <span className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full uppercase tracking-widest">
                                    {announcements.length} messages
                                </span>
                            </div>
                            <button onClick={() => setShowAnnouncementList(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                            {announcements.length === 0 ? (
                                <div className="py-10 text-center text-slate-400">
                                    <Megaphone className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                                    <p className="text-sm">Aucune annonce pour le moment</p>
                                </div>
                            ) : (
                                announcements.map(a => {
                                    const imp = IMP_STYLES[a.importance] || IMP_STYLES.info;
                                    return (
                                        <div
                                            key={a.id}
                                            className="px-6 py-4 hover:bg-slate-50 transition cursor-pointer"
                                            onClick={() => {
                                                if (user?.id) markAnnouncementRead(a.id, user.id);
                                                setShowAnnouncementList(false);
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${imp.dot}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${imp.badge}`}>
                                                            {imp.label}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    </div>
                                                    <p className="font-bold text-slate-800 text-sm truncate">{a.titre}</p>
                                                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{a.message}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* ── Bannière de Notifications Mobile/PWA ── */}
                {notifStatus === 'default' && (
                    <div className="bg-gradient-to-br from-indigo-700 via-blue-600 to-cyan-500 rounded-[32px] p-6 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-fadeIn border border-white/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-400/20 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
                        <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
                            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center shrink-0 border border-white/30 shadow-xl">
                                <Bell className="w-8 h-8 text-white animate-pulse" />
                            </div>
                            <div>
                                <h3 className="font-black text-xl md:text-2xl text-white tracking-tight">Restez Connecté</h3>
                                <p className="text-blue-50 text-[11px] md:text-sm mt-1 leading-snug max-w-sm font-medium">Ne ratez plus rien ! Soyez alerté dès que votre enfant rentre ou sort de l'école.</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleEnableNotifications}
                            className="w-full md:w-auto px-10 py-4 bg-white text-blue-700 hover:bg-blue-50 font-black rounded-[24px] transition-all shadow-2xl active:scale-95 text-sm uppercase tracking-widest"
                        >
                            M'alerter
                        </button>
                    </div>
                )}

                {/* ── Cards financières & Scolaires ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 p-7 flex flex-col justify-between transition-all hover:shadow-2xl h-full group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-3xl flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                                <Wallet className="w-7 h-7" />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest group-hover:text-blue-400 transition-colors">Total Scolarité</span>
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{totalEcolage.toLocaleString()} FCFA</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide">Pour {children.length} enfant{children.length > 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 p-7 flex flex-col justify-between transition-all hover:shadow-2xl h-full group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:emerald-400 rounded-3xl flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner">
                                <TrendingUp className="w-7 h-7" />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Déjà Payé</span>
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900 dark:text-white mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{totalDejaPaye.toLocaleString()} FCFA</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide">{totalEcolage > 0 ? Math.round((totalDejaPaye / totalEcolage) * 100) : 0}% du total</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 p-7 flex flex-col justify-between transition-all hover:shadow-2xl h-full group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-3xl flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-inner">
                                <CreditCard className="w-7 h-7" />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest group-hover:text-rose-400 transition-colors">Reste à Payer</span>
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900 dark:text-white mb-1 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{totalRestant.toLocaleString()} FCFA</p>
                            <p className="text-xs text-rose-400 dark:text-rose-500 font-bold uppercase tracking-wide">Délai Règlement à respecter</p>
                        </div>
                    </div>

                    <div 
                        onClick={() => useStore.getState().setCurrentPage('parent_notes')}
                        className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 p-7 flex flex-col justify-between transition-all hover:shadow-2xl h-full group cursor-pointer hover:border-amber-400"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-3xl flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-inner">
                                <GraduationCap className="w-7 h-7" />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest group-hover:text-amber-400 transition-colors">Résultats Scolaires</span>
                        </div>
                        <div>
                            <p className="text-xl font-black text-slate-900 dark:text-white mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Consulter les Notes</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide">Suivi des performances</p>
                        </div>
                    </div>
                </div>

                {/* ── Tableau dossiers scolaires ── */}
                <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mt-6 pb-20">
                    <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                                <GraduationCap className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Dossiers Scolaires</h3>
                        </div>
                        {children.length > 0 && (
                            <span className="px-4 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest">{children.length} enfant{children.length > 1 ? 's' : ''}</span>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-[0.1em] border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-6 py-4">Fiche Élève</th>
                                    <th className="px-6 py-4 text-center">Cursus</th>
                                    <th className="px-6 py-4 text-right">Encaissement</th>
                                    <th className="px-6 py-4 text-right">Reliquat</th>
                                    <th className="px-6 py-4 text-center">Situation</th>
                                    <th className="px-6 py-4 text-right">Gérer</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {children.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                                                    <Search className="w-8 h-8 text-slate-200" />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-bold text-slate-800 mb-1">Aucun enfant lié</p>
                                                    <p className="text-sm text-slate-400">Liez vos enfants pour voir leurs informations financières, leurs reçus et leurs badges.</p>
                                                </div>
                                                <button
                                                    onClick={() => setIsLinkModalOpen(true)}
                                                    className="px-6 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all text-sm"
                                                >
                                                    Lier un enfant maintenant
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    children.map(child => (
                                        <tr key={child.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-5">
                                                <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{child.prenom} {child.nom}</p>
                                                <code className="text-[10px] text-slate-300 font-mono tracking-tighter">REF: {child.id}</code>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-700 font-bold text-sm tracking-tight">{child.classe}</span>
                                                    <span className="text-[10px] text-slate-400 uppercase font-semibold">{child.cycle}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-emerald-600 font-bold text-base">{(child.dejaPaye || 0).toLocaleString()} F</p>
                                                {child.ecolage > 0 && (
                                                    <div className="w-24 h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                                                        <div
                                                            className="h-full bg-emerald-500 rounded-full"
                                                            style={{ width: `${Math.min(((child.dejaPaye || 0) / child.ecolage) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className={`font-bold text-base ${child.restant > 25000 ? 'text-red-500' : 'text-amber-600'}`}>
                                                    {(child.restant || 0).toLocaleString()} F
                                                </p>
                                                <p className="text-[10px] text-slate-400 italic">Total: {(child.ecolage || 0).toLocaleString()} F</p>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${child.status === 'Soldé' ? 'bg-emerald-100 text-emerald-700' :
                                                        child.status === 'Partiel' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {child.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    onClick={() => handleUnlink(child.id, `${child.prenom} ${child.nom}`)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    title="Retirer cet enfant"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <LinkStudentModal
                    isOpen={isLinkModalOpen}
                    onClose={() => setIsLinkModalOpen(false)}
                    onSuccess={() => fetchData()}
                />
            </div>

            <SupportModal 
                isOpen={showSupportModal}
                onClose={() => setShowSupportModal(false)}
                onSelect={handleStartChat}
            />
        </>
    );
};