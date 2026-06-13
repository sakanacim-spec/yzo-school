// ============================================================
// PERMISSIONS PAR RÔLE — Contrôle d'accès centralisé
// ============================================================
import { AppPage } from '../types';

type Role = 'superadmin' | 'admin' | 'directeur' | 'directeur_general' | 'proviseur' | 'censeur' | 'superviseur' | 'surveillant' | 'comptable' | 'parent';

// Pages accessibles par rôle
const ROLE_PAGES: Record<Role, AppPage[]> = {
    // ── SuperAdmin : accès global SaaS ──
    superadmin: [
        'superadmin_dashboard', 'superadmin_schools', 'superadmin_billing'
    ],
    directeur_general: [
        'dashboard', 'eleves', 'paiements', 'analyses', 'documents',
        'parametres', 'recouvrement', 'scan_information',
        'verification_recu', 'historique_activites', 'parents_list', 'import_export', 'chat', 'annonces',
        'gestion_academique', 'saisie_notes', 'bulletins'
    ],
    admin: [
        'dashboard', 'eleves', 'paiements', 'analyses', 'documents',
        'parametres', 'recouvrement', 'scan_information',
        'verification_recu', 'historique_activites', 'parents_list', 'import_export', 'chat', 'annonces',
        'gestion_academique', 'saisie_notes', 'bulletins'
    ],
    directeur: [
        'dashboard', 'eleves', 'paiements', 'analyses', 'documents',
        'parametres', 'recouvrement', 'scan_information',
        'verification_recu', 'historique_activites', 'parents_list', 'import_export', 'chat', 'annonces',
        'gestion_academique', 'saisie_notes', 'bulletins'
    ],
    comptable: [
        'dashboard', 'eleves', 'paiements', 'analyses', 'documents',
        'recouvrement', 'verification_recu', 'import_export', 'chat', 'scan_information'
    ],
    superviseur: [
        'scan_presence', 'scan_sortie', 'scan_information', 'carte_scolaire'
    ],
    surveillant: [
        'scan_presence', 'scan_sortie', 'scan_information', 'carte_scolaire'
    ],
    proviseur: [
        'dashboard', 'eleves', 'analyses', 'chat', 'scan_information',
        'gestion_academique', 'saisie_notes', 'bulletins'
    ],
    censeur: [
        'dashboard', 'eleves', 'analyses', 'chat', 'scan_information',
        'gestion_academique', 'saisie_notes', 'bulletins'
    ],
    parent: [
        'parent_dashboard', 'parent_historique', 'parent_recus',
        'parent_badges', 'parent_messages', 'chat', 'annonces'
    ],
};

// Actions possibles
type ActionType =
    | 'modifier_parametres'
    | 'ajouter_eleve'
    | 'modifier_eleve'
    | 'supprimer_eleve'
    | 'ajouter_paiement'
    | 'generer_recu'
    | 'exporter_donnees'
    | 'importer_donnees'
    | 'voir_historique'
    | 'scan_presence'
    | 'generer_carte'
    | 'supprimer_parent';

const ROLE_ACTIONS: Record<Role, ActionType[]> = {
    superadmin: [], // Le superadmin a ses propres actions API dédiées
    directeur_general: [
        'modifier_parametres', 'ajouter_eleve', 'modifier_eleve', 'supprimer_eleve',
        'ajouter_paiement', 'generer_recu', 'exporter_donnees', 'importer_donnees',
        'voir_historique', 'supprimer_parent'
    ],
    admin: [
        'modifier_parametres', 'ajouter_eleve', 'modifier_eleve', 'supprimer_eleve',
        'ajouter_paiement', 'generer_recu', 'exporter_donnees', 'importer_donnees',
        'voir_historique', 'supprimer_parent'
    ],
    directeur: [
        'modifier_parametres', 'ajouter_eleve', 'modifier_eleve', 'supprimer_eleve',
        'ajouter_paiement', 'generer_recu', 'exporter_donnees', 'importer_donnees',
        'voir_historique', 'supprimer_parent'
    ],
    comptable: [
        'ajouter_paiement', 'generer_recu', 'exporter_donnees', 'ajouter_eleve',
        'modifier_eleve', 'importer_donnees'
    ],
    superviseur: [
        'scan_presence', 'generer_carte'
    ],
    surveillant: [
        'scan_presence', 'generer_carte'
    ],
    proviseur: [
        'voir_historique'
    ],
    censeur: [],
    parent: [],
};

export const canAccessPage = (role: string | undefined, page: AppPage): boolean => {
    if (!role) return false;
    const r = role as Role;
    return ROLE_PAGES[r]?.includes(page) ?? false;
};

export const canPerformAction = (role: string | undefined, action: ActionType): boolean => {
    if (!role) return false;
    const r = role as Role;
    return ROLE_ACTIONS[r]?.includes(action) ?? false;
};

export const isAdminRole = (role: string | undefined): boolean => {
    return role === 'admin' || role === 'directeur' || role === 'directeur_general';
};

export const isSuperAdmin = (role: string | undefined): boolean => {
    return role === 'superadmin';
};

export const isSchoolAdmin = (role: string | undefined): boolean => {
    return role === 'admin' || role === 'directeur' || role === 'directeur_general';
};

export const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
        directeur_general: 'Directeur Général',
        admin: 'Administrateur',
        directeur: 'Directeur',
        comptable: 'Comptable',
        superviseur: 'Surveillant',
        proviseur: 'Proviseur',
        censeur: 'Censeur',
        parent: 'Parent',
    };
    return labels[role] || role;
};

export const getFilteredNavItems = (role: string | undefined, items: { id: AppPage }[]): typeof items => {
    if (!role) return [];
    return items.filter(item => canAccessPage(role, item.id));
};
