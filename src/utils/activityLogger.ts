// ============================================================
// ACTIVITY LOGGER — Enregistrement centralisé des actions
// ============================================================
import { ActivityLog } from '../types';
import { v4 as uuid } from './uuid';

export type ActivityAction = ActivityLog['action'];

export const createActivityLog = (
    utilisateur: string,
    utilisateurRole: string,
    action: ActivityAction,
    description: string,
    metadata?: Record<string, any>
): ActivityLog => ({
    id: uuid(),
    utilisateur,
    utilisateurRole,
    action,
    description,
    dateHeure: new Date().toISOString(),
    metadata,
});

// Formatter la date pour l'affichage
export const formatLogDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Icônes/couleurs par type d'action
export const getActionStyle = (action: ActivityAction) => {
    const styles: Record<ActivityAction, { color: string; bg: string; label: string }> = {
        connexion: { color: 'text-blue-600', bg: 'bg-blue-50', label: 'Connexion' },
        paiement: { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Paiement' },
        modification_eleve: { color: 'text-amber-600', bg: 'bg-amber-50', label: 'Modification' },
        generation_recu: { color: 'text-purple-600', bg: 'bg-purple-50', label: 'Reçu généré' },
        presence: { color: 'text-cyan-600', bg: 'bg-cyan-50', label: 'Présence' },
        import: { color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Import' },
        export: { color: 'text-slate-600', bg: 'bg-slate-50', label: 'Export' },
        suppression: { color: 'text-red-600', bg: 'bg-red-50', label: 'Suppression' },
        autre: { color: 'text-gray-600', bg: 'bg-gray-50', label: 'Autre' },
    };
    return styles[action] || styles.autre;
};
