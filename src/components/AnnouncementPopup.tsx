// ============================================================
// POPUP ANNONCE — Affiché automatiquement aux parents
// Si nouvelle annonce non lue → popup obligatoire
// ============================================================
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
    Megaphone, X, CheckCircle, Clock, Bell,
    AlertCircle, AlertTriangle, Info
} from 'lucide-react';
import type { Announcement, AnnouncementImportance } from '../types';

const IMPORTANCE_STYLES: Record<AnnouncementImportance, {
    bg: string; border: string; icon: React.ReactNode; headerBg: string;
}> = {
    info: {
        bg: 'bg-blue-50', border: 'border-blue-200',
        headerBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
        icon: <Info className="w-6 h-6 text-white" />,
    },
    important: {
        bg: 'bg-amber-50', border: 'border-amber-200',
        headerBg: 'bg-gradient-to-r from-amber-500 to-orange-600',
        icon: <AlertCircle className="w-6 h-6 text-white" />,
    },
    urgent: {
        bg: 'bg-red-50', border: 'border-red-200',
        headerBg: 'bg-gradient-to-r from-red-600 to-rose-700',
        icon: <AlertTriangle className="w-6 h-6 text-white" />,
    },
};

export const AnnouncementPopup: React.FC = () => {
    const user = useStore(s => s.user);
    const getUnreadAnnouncements = useStore(s => s.getUnreadAnnouncements);
    const markAnnouncementRead = useStore(s => s.markAnnouncementRead);
    const remindAnnouncementLater = useStore(s => s.remindAnnouncementLater);

    const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
    const [visible, setVisible] = useState(false);

    // Vérifier les annonces non lues au chargement et périodiquement
    useEffect(() => {
        if (user?.role !== 'parent') return;

        const checkAnnouncements = () => {
            const unread = getUnreadAnnouncements(user.id);
            if (unread.length > 0) {
                // Prioriser: urgent > important > info
                const sorted = [...unread].sort((a, b) => {
                    const order: Record<string, number> = { urgent: 0, important: 1, info: 2 };
                    return (order[a.importance] ?? 2) - (order[b.importance] ?? 2);
                });
                setCurrentAnnouncement(sorted[0]);
                setVisible(true);
            }
        };

        // Vérifier après un délai (laisser le dashboard charger)
        const timer = setTimeout(checkAnnouncements, 1500);
        // Re-vérifier toutes les 30 secondes
        const interval = setInterval(checkAnnouncements, 30000);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, [user, getUnreadAnnouncements]);

    if (!visible || !currentAnnouncement || user?.role !== 'parent') return null;

    const styles = IMPORTANCE_STYLES[currentAnnouncement.importance];

    const handleRead = () => {
        markAnnouncementRead(currentAnnouncement.id, user!.id);
        setVisible(false);
        setCurrentAnnouncement(null);
    };

    const handleRemind = () => {
        remindAnnouncementLater(currentAnnouncement.id, user!.id);
        setVisible(false);
        setCurrentAnnouncement(null);
    };

    const handleClose = () => {
        // Fermer sans marquer comme lu — réapparaîtra à la prochaine connexion
        setVisible(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className={`w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border-2 ${styles.border} animate-scaleIn`}
                 style={{ animation: 'scaleIn 0.3s ease-out' }}>

                {/* En-tête coloré */}
                <div className={`${styles.headerBg} px-6 py-5 text-white`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            {styles.icon}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <Megaphone className="w-4 h-4 opacity-80" />
                                <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                                    Annonce de l'école
                                </span>
                            </div>
                            <h3 className="text-lg font-bold mt-0.5 leading-tight">
                                {currentAnnouncement.titre}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Corps du message - Défilable pour les longs messages */}
                <div className={`${styles.bg} px-6 py-5 max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300`}>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {currentAnnouncement.message}
                    </p>
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-200/50 text-[11px] text-gray-500">
                        <Clock className="w-3 h-3" />
                        {new Date(currentAnnouncement.createdAt).toLocaleDateString('fr-FR', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                        })}
                        {currentAnnouncement.cible !== 'all' && (
                            <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded-full text-[10px] font-bold">
                                Classe: {currentAnnouncement.cible}
                            </span>
                        )}
                    </div>
                </div>

                {/* 3 boutons d'action */}
                <div className="bg-white px-6 py-4 flex flex-col gap-2">
                    {/* J'ai lu */}
                    <button
                        onClick={handleRead}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-md"
                    >
                        <CheckCircle className="w-4 h-4" />
                        J'ai lu et compris
                    </button>

                    {/* Me rappeler dans 1 jour */}
                    <button
                        onClick={handleRemind}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-all"
                    >
                        <Bell className="w-4 h-4" />
                        Me rappeler dans 1 jour
                    </button>

                    {/* Fermer */}
                    <button
                        onClick={handleClose}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-400 hover:text-gray-600 rounded-xl text-xs transition-all"
                    >
                        <X className="w-3.5 h-3.5" />
                        Fermer (réapparaîtra à la prochaine connexion)
                    </button>
                </div>
            </div>

            {/* Keyframes animation */}
            <style>{`
                @keyframes scaleIn {
                    0% { transform: scale(0.9); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};
