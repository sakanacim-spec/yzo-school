// ============================================================
// TYPES PRINCIPAUX — EduFinance
// ============================================================



export type Cycle = 'Primaire' | 'Collège' | 'Lycée';

export type PaymentStatus = 'Soldé' | 'Partiel' | 'Non soldé';

export interface Student {
  id: string;
  nom: string;
  prenom: string;
  classe: string;
  telephone: string;
  parentId?: string;
  sexe: 'M' | 'F';
  redoublant: boolean;
  ecoleProvenance: string;
  ecolage: number;
  dejaPaye: number;
  restant: number;
  recu: string;
  adsn?: string;
  statutElv?: 'NOUVEAU' | 'ANCIEN' | 'REDOUBLANT';
  dateNaissance?: string;
  acteNaissanceUrl?: string;
  photoUrl?: string;  // Photo passeport de l'élève (base64 data URL)
  cycle: Cycle;
  status: PaymentStatus;
  historiquesPaiements: Payment[];
  paiements?: Payment[];
  dateInscription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  studentId: string;
  montant: number;
  date: string;
  recu: string;
  mode?: string;
  reference?: string;
  commentaire?: string;
  note?: string;
  methode?: string;
}

export interface ClassConfig {
  name: string;
  cycle: Cycle;
  ecolage: number;
}

export type StatusPaiement = 'solde' | 'tranche_validee' | 'tranche_partielle' | 'non_solde';

export interface ClassStats {
  classe: string;
  cycle: Cycle;
  totalEleves: number;
  effectif: number;
  totalEcolage: number;
  ecolageTotal: number;
  totalPaye: number;
  paye: number;
  totalRestant: number;
  restant: number;
  tauxRecouvrement: number;
}

export interface AdminSettings {
  seuilDeuxiemeTranche: number;
  schoolName: string;
  schoolYear: string;
  messageRemerciement: string;
  messageRappel: string;
  // Champs additionnels pour la génération PDF
  nomEcole?: string;
  anneScolaire?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
}

export interface Tranche {
  id: string;
  nom: string;
  dateLimite: string; // YYYY-MM-DD
  pourcentage: number; // 0 à 100
}

export interface AppSettings extends AdminSettings {
  currency: string;
  badgeParentResponsable: string;
  badge2emeTranche: string;
  messageSolde?: string; // Utilisé dans pdfUtils.ts
  messagePartiel?: string; // Utilisé dans pdfUtils.ts
  messageNonPaye?: string; // Utilisé dans pdfUtils.ts
  schoolAddress?: string; // Utilisé dans pdfUtils.ts
  schoolPhone?: string; // Utilisé dans pdfUtils.ts
  schoolEmail?: string; // Utilisé dans pdfUtils.ts
  academicYear?: string; // Utilisé dans pdfUtils.ts
  tranches?: Tranche[];
}

export interface DashboardStats {
  totalEleves: number;
  totalPrimaire: number;
  totalCollege: number;
  totalLycee: number;
  totalEcolageAttendu: number;
  totalDejaPaye: number;
  totalRestant: number;
  tauxRecouvrement: number;
  elevesSoldes: number;
  elevesNonSoldes: number;
}

export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'directeur'
  | 'directeur_general'
  | 'proviseur'
  | 'censeur'
  | 'superviseur'
  | 'surveillant'
  | 'comptable'
  | 'parent';

export interface User {
  id: string;
  username: string; // phone number for parents
  role: UserRole;
  nom: string;
  telephone?: string;
  schoolSlug?: string; // lié à une école (null pour superadmin)
  schoolName?: string; // nom de l'école pour affichage
}

// ── École (Multi-Tenant) ─────────────────────────────────
export interface School {
  id: string;
  name: string;
  slug: string;            // ex: 'ecole-alpha'
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  trial_ends_at: string;   // ISO date
  status: 'active' | 'suspended' | 'trial';
  created_at: string;
  student_count?: number;  // calculé côté serveur
  revenue?: number;        // 2000 FCFA/élève
}

export interface Parent {
  id: string;
  nom: string;
  telephone: string; // serves as username
  password?: string;
  createdAt: string;
  created_at?: string;
}

// ── Présences (pointage QR) ──────────────────────────────
export interface Presence {
  id: string;
  eleveId: string;
  eleveNom: string;
  elevePrenom: string;
  eleveClasse: string;
  date: string;      // YYYY-MM-DD
  heure: string;     // HH:mm:ss
  statut: 'present' | 'absent' | 'retard';
  type?: 'ENTREE' | 'SORTIE';
}

// ── Horaires par cycle ───────────────────────────────────
export interface CycleSchedule {
  cycle: Cycle;
  heureLimite: string; // HH:mm (ex: "07:30")
}

// ── Annonces école ──────────────────────────────────────
export type AnnouncementImportance = 'info' | 'important' | 'urgent';
export type AnnouncementTarget = 'all' | string; // 'all' ou nom de classe

export interface Announcement {
  id: string;
  titre: string;
  message: string;
  date: string;          // YYYY-MM-DD
  cible: AnnouncementTarget;
  importance: AnnouncementImportance;
  createdBy: string;     // nom de l'utilisateur
  createdAt: string;     // ISO string
}

export interface AnnouncementRead {
  announcementId: string;
  parentId: string;
  readAt: string;        // ISO string
  remindAt?: string;     // ISO string — si "rappeler dans 24h"
}

// ── Logs d'activité ──────────────────────────────────────
export interface ActivityLog {
  id: string;
  utilisateur: string;
  utilisateurRole: string;
  action: 'connexion' | 'paiement' | 'modification_eleve' | 'generation_recu' | 'presence' | 'import' | 'export' | 'suppression' | 'autre';
  description: string;
  dateHeure: string;  // ISO string
  metadata?: Record<string, any>;
}

// ── Vérification de reçu ─────────────────────────────────
export interface ReceiptVerification {
  code: string;       // REC-ANNEE-NUMERO
  studentId: string;
  eleveNom: string;
  elevePrenom: string;
  eleveClasse: string;
  montant: number;
  date: string;
  tranche: string;
  statut: 'authentique' | 'invalide';
}

export type AppPage =
  | 'dashboard'
  | 'eleves'
  | 'paiements'
  | 'analyses'
  | 'documents'
  | 'parametres'
  | 'recouvrement'
  | 'scan_presence'
  | 'scan_sortie'
  | 'scan_information'
  | 'carte_scolaire'
  | 'verification_recu'
  | 'historique_activites'
  | 'annonces'
  | 'gestion_academique'
  | 'saisie_notes'
  | 'bulletins'
  | 'parent_dashboard'
  | 'parent_historique'
  | 'parent_recus'
  | 'parent_badges'
  | 'parent_messages'
  | 'parent_notes'
  | 'parents_list'
  | 'import_export'
  | 'chat'
  | 'gestion_personnel'
  // ── Pages SuperAdmin (propriétaire SaaS) ──
  | 'superadmin_dashboard'
  | 'superadmin_schools'
  | 'superadmin_billing';

// Les types de cycles existants
export const CYCLES: Cycle[] = ['Primaire', 'Collège', 'Lycée'];

// ── MODULE 2 : ACADÉMIQUE & NOTES ─────────────────────────

export type MatiereCategorie = '1-MATIERES LITTERAIRES' | '2-MATIERES SCIENTIFIQUES' | '3-AUTRES MATIERES';
export type PeriodeType = 'TRIMESTRE 1' | 'TRIMESTRE 2' | 'TRIMESTRE 3' | 'SEMESTRE 1' | 'SEMESTRE 2';

export interface Matiere {
  id: string;
  nom: string;
  categorie: MatiereCategorie;
}

export interface ClasseMatiere {
  id: string;
  classe: string; // ex: '3ème A'
  matiereId: string;
  professeur: string;
  coefficient: number;
}

export interface Note {
  id: string;
  eleveId: string;
  matiereId: string;
  periode: PeriodeType;
  noteClasse: number | null; // ex: Interrogations (sur 20)
  noteDevoir: number | null; // ex: Devoirs surveillés
  noteCompo: number | null;  // ex: Composition
}

