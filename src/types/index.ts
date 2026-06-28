// ============================================================
// TYPES PRINCIPAUX — EduFinance
// ============================================================



export type Cycle = string;

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

export type ExpenseCategory = 'Salaires' | 'Électricité & Eau' | 'Loyer' | 'Fournitures' | 'Entretien' | 'Autre';

export interface Expense {
  id: string;
  titre: string;
  montant: number;
  categorie: ExpenseCategory;
  date: string; // YYYY-MM-DD
  beneficiaire?: string;
  reference?: string;
  commentaire?: string;
  enregistrePar: string;
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

export type ResourceType = 'pdf' | 'video' | 'link' | 'document';

export interface Resource {
  id: string;
  titre: string;
  description: string;
  type: ResourceType;
  url: string; // Base64 data URL for files, or standard URL for links
  classe: string;
  matiere: string;
  professeurId: string;
  professeurNom: string;
  createdAt: string;
}

export interface Payroll {
  id: string;
  personnelId: string;
  mois: string; // YYYY-MM
  salaireBase: number;
  primes: number;
  deductions: number;
  netAPayer: number;
  statut: 'Payé' | 'En attente';
  datePaiement?: string;
  referencePaiement?: string;
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
  schoolSlogan?: string; // Slogan de l'école
  schoolMinistry?: string; // Ministère de tutelle
  schoolCountry?: string; // Pays de provenance
  schoolLogo?: string | null;
  schoolStamp?: string | null;
  academicYear?: string; // Utilisé dans pdfUtils.ts
  
  // Paramètres de personnalisation des bulletins
  bulletinTemplate?: 'officiel' | 'classique';
  bulletinShowPhoto?: boolean;
  bulletinShowRank?: boolean;
  bulletinShowClassAverage?: boolean;
  bulletinShowAppreciation?: boolean;

  // Configuration des passerelles de paiement
  paymentGateway?: 'fedapay' | 'paystack' | 'stripe' | 'none';
  paymentPublicKey?: string | null;
  paymentSecretKey?: string | null;

  tranches?: Tranche[];
  classes?: ClassConfig[]; // Configuration personnalisée des classes et écolages
  cycleSchedules?: CycleSchedule[]; // Horaires
}

export interface GlobalStats {
  totalStudents: number;
  totalBoys: number;
  totalGirls: number;
  newRegistrations: number;
  totalRevenue: number;
  unpaidFees: number;
}

export interface DashboardStats {
  totalEleves: number;
  totalPrimaire?: number;
  totalCollege?: number;
  totalLycee?: number;
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
  | 'professeur'
  | 'parent';

export interface User {
  id: string;
  username: string; // phone number for parents
  role: UserRole;
  nom: string;
  prenom?: string;
  telephone?: string;
  schoolSlug?: string; // lié à une école (null pour superadmin)
  schoolName?: string; // nom de l'école pour affichage
  schoolCountry?: string; // code pays de l'école
  schoolAddress?: string;
  schoolPhone?: string;
  schoolSlogan?: string;
  schoolMinistry?: string;
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
  country?: string;
  city?: string;
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

export interface Seance {
  id: string;
  classe: string;
  jour: 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi' | 'Samedi' | 'Dimanche';
  heureDebut: string; // HH:mm
  heureFin: string;   // HH:mm
  matiereId: string;
  professeur: string;
  salle?: string;
  couleur?: string;
}

export interface Devoir {
  id: string;
  dateDonnee: string; // YYYY-MM-DD
  dateRendu: string;  // YYYY-MM-DD
  matiere: string;
  description: string;
  classe: string;
  professeurNom?: string;
  fichierUrl?: string;
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
  | 'depenses'
  | 'scan_presence'
  | 'scan_sortie'
  | 'scan_information'
  | 'carte_scolaire'
  | 'verification_recu'
  | 'historique_activites'
  | 'annonces'
  | 'communication'
  | 'gestion_academique'
  | 'saisie_notes'
  | 'saisie_presence'
  | 'emploi_du_temps'
  | 'bulletins'
  | 'parent_dashboard'
  | 'parent_historique'
  | 'parent_recus'
  | 'parent_badges'
  | 'parent_messages'
  | 'parent_notes'
  | 'parent_devoirs_presence'
  | 'parents_list'
  | 'import_export'
  | 'chat'
  | 'gestion_personnel'
  | 'cahier_textes'
  | 'prof_dashboard'
  | 'prof_ressources'
  | 'parent_ressources'
  | 'salaires'
  // ── Pages SuperAdmin (propriétaire SaaS) ──
  | 'superadmin_dashboard'
  | 'superadmin_schools'
  | 'superadmin_billing';



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


export interface Personnel {
  id: string;
  nom: string;
  prenom: string;
  role: string;
  telephone?: string;
  email?: string;
}

