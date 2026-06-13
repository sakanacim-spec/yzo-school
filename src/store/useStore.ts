// ============================================================
// STORE ZUSTAND — État global de l'application
// ============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Student, User, AppPage, Payment, Parent, AppSettings, Presence, ActivityLog, CycleSchedule, Announcement, AnnouncementRead, Matiere, ClasseMatiere, Note, PeriodeType } from '../types';
import { API_BASE_URL } from '../config';
import { getEcolage, getCycle } from '../data/classConfig';
import { v4 as uuid } from '../utils/uuid';
import { createActivityLog } from '../utils/activityLogger';

export interface AppState {
  // Identité de l'app
  appName: string;
  setAppName: (name: string) => void;
  schoolLogo: string | null;        // base64 de l'image PNG
  setSchoolLogo: (logo: string | null) => void;
  schoolStamp: string | null;       // Sceau de l'école
  setSchoolStamp: (stamp: string | null) => void;
  tranches: any[];
  setTranches: (tranches: any[]) => void;

  // Auth
  user: User | null;
  isAuthenticated: boolean;
  connectedParentsCount: number;
  setConnectedParentsCount: (count: number) => void;
  badges: any[];
  unreadMessages: number;
  setUnreadMessages: (count: number) => void;
  fetchUnreadMessages: () => Promise<void>;
  login: (username: string, password: string, schoolSlug?: string) => Promise<boolean>;
  logout: () => void;

  // Navigation
  currentPage: AppPage;
  setCurrentPage: (page: AppPage) => void;

  // Élèves
  students: Student[];
  setStudents: (students: Student[]) => void;
  addStudent: (student: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'cycle' | 'status' | 'restant' | 'historiquesPaiements' | 'ecolage'>) => void;
  updateStudent: (id: string, updates: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  addPayment: (studentId: string, payment: Omit<Payment, 'id' | 'studentId'>) => void;

  // Parents
  parents: Parent[];
  setParents: (parents: Parent[]) => void;

  // UI
  selectedStudent: Student | null;
  setSelectedStudent: (student: Student | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterClasse: string;
  setFilterClasse: (c: string) => void;
  filterCycle: string;
  setFilterCycle: (c: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  chatRecipientId: string | null;
  setChatRecipientId: (id: string | null) => void;

  // Paramètres
  schoolName: string;
  setSchoolName: (name: string) => void;
  schoolYear: string;
  setSchoolYear: (year: string) => void;
  messageRemerciement: string;
  setMessageRemerciement: (m: string) => void;
  messageRappel: string;
  setMessageRappel: (m: string) => void;
  updateAllSettings: (settings: {
    appName?: string,
    schoolName?: string,
    schoolYear?: string,
    schoolLogo?: string | null,
    schoolStamp?: string | null,
    messageRemerciement?: string,
    messageRappel?: string,
    tranches?: any[]
  }) => Promise<void>;
  settings: AppSettings;
  updateSettings: (settings: AppSettings) => void;

  // Présences
  presences: Presence[];
  addPresence: (presence: Presence) => void;
  getPresencesToday: () => Presence[];
  getSortiesToday: () => Presence[];
  isAlreadyPresent: (eleveId: string) => boolean;
  hasAlreadyExited: (eleveId: string) => boolean;

  // Logs d'activité
  activityLogs: ActivityLog[];
  addActivityLog: (log: ActivityLog) => void;

  // Reçus vérifiables
  receiptCounter: number;
  incrementReceiptCounter: () => string;

  // Synchronisation Cloud
  links: any[];
  setLinks: (links: any[]) => void;
  fetchAllFromBackend: (force?: boolean) => Promise<void>;
  isSyncing: boolean;
  setIsSyncing: (s: boolean) => void;
  lastSyncTimestamp: number;
  setLastSyncTimestamp: (t: number) => void;
  clearCloudPresences: () => Promise<boolean>;
  clearCloudActivityLogs: () => Promise<boolean>;
  clearCloudStudents: () => Promise<boolean>;
  fetchPublicSettings: () => Promise<void>;

  // Horaires par cycle
  cycleSchedules: CycleSchedule[];
  setCycleSchedules: (schedules: CycleSchedule[]) => void;
  getHeureLimite: (cycle: string) => string;

  // Annonces
  announcements: Announcement[];
  addAnnouncement: (a: Omit<Announcement, 'id' | 'createdAt'>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  announcementReads: AnnouncementRead[];
  markAnnouncementRead: (announcementId: string, parentId: string) => void;
  reportAnnouncementReadToBackend: (announcementId: string) => Promise<void>;
  remindAnnouncementLater: (announcementId: string, parentId: string) => void;
  getUnreadAnnouncements: (parentId: string, classes?: string[]) => Announcement[];

  // ── MODULE 2 : ACADÉMIQUE & NOTES ──
  currentPeriode: PeriodeType;
  setCurrentPeriode: (p: PeriodeType) => void;
  matieres: Matiere[];
  setMatieres: (m: Matiere[]) => void;
  addMatiere: (m: Matiere) => void;
  updateMatiere: (id: string, m: Partial<Matiere>) => void;
  deleteMatiere: (id: string) => void;

  classeMatieres: ClasseMatiere[];
  setClasseMatieres: (cm: ClasseMatiere[]) => void;
  addClasseMatiere: (cm: ClasseMatiere) => void;
  updateClasseMatiere: (id: string, cm: Partial<ClasseMatiere>) => void;
  deleteClasseMatiere: (id: string) => void;

  notes: Note[];
  setNotes: (n: Note[]) => void;
  upsertNote: (note: Note) => void;
  upsertNotes: (notes: Note[]) => void;
  deleteNote: (id: string) => void;

  // Thème
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  lastReportMonth: string | null;
  setLastReportMonth: (month: string) => void;
  privacyMode: boolean;
  setPrivacyMode: (v: boolean) => void;
}

// Authentification gérée par Supabase

const computeStatus = (restant: number, ecolage: number) => {
  if (restant <= 0) return 'Soldé' as const;
  const paye = ecolage - restant;
  const taux = paye / ecolage;
  if (taux >= 0.7) return 'Partiel' as const;
  return 'Non soldé' as const;
};

// Déduplication des élèves (Autorité sur l'ID, puis sur le couple Nom+Prénom+Classe)
const deduplicateStudents = (list: Student[]): { list: Student[]; countRemoved: number } => {
  const seenById = new Map<string, Student>();
  const seenByNameClass = new Map<string, Student>();
  let removedCount = 0;
  
  // 1. Déduplication par ID (Technique)
  list.forEach(s => {
    if (!seenById.has(s.id)) {
      seenById.set(s.id, s);
    } else {
      removedCount++;
      const existing = seenById.get(s.id)!;
      if (new Date(s.updatedAt) > new Date(existing.updatedAt)) {
        seenById.set(s.id, s);
      }
    }
  });

  const uniqueById = Array.from(seenById.values());
  const result: Student[] = [];

  // 2. Déduplication par Nom + Prénom + Classe (Métier)
  uniqueById.forEach(s => {
    const key = `${(s.nom || '').trim().toLowerCase()}|${((s.prenom || '')).trim().toLowerCase()}|${(s.classe || '').trim().toLowerCase()}`;
    if (!seenByNameClass.has(key)) {
      seenByNameClass.set(key, s);
      result.push(s);
    } else {
      removedCount++;
      const existing = seenByNameClass.get(key)!;
      
      // On garde le plus récent ou celui qui a le plus de paiements
      const existingUpdatedAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const sUpdatedAt = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
      
      const shouldReplace = (s.historiquesPaiements?.length || 0) > (existing.historiquesPaiements?.length || 0) || 
                            sUpdatedAt > existingUpdatedAt;
      
      if (shouldReplace) {
        const allPayments = [...(existing.historiquesPaiements || []), ...(s.historiquesPaiements || [])];
        const uniquePayments = Array.from(new Map(allPayments.map(p => [p.id, p])).values());
        const merged = { ...s, historiquesPaiements: uniquePayments };
        seenByNameClass.set(key, merged);
        const idx = result.findIndex(r => {
           const rKey = `${(r.nom || '').trim().toLowerCase()}|${((r.prenom || '')).trim().toLowerCase()}|${(r.classe || '').trim().toLowerCase()}`;
           return rKey === key;
        });
        if (idx !== -1) result[idx] = merged;
      } else {
        const allPayments = [...(existing.historiquesPaiements || []), ...(s.historiquesPaiements || [])];
        const uniquePayments = Array.from(new Map(allPayments.map(p => [p.id, p])).values());
        existing.historiquesPaiements = uniquePayments;
      }
    }
  });

  return { list: result, countRemoved: removedCount };
};

// Réparation des données (cycle, écolage, restant, status)
const repairStudent = (s: Student): Student => {
  const correctCycle = getCycle(s.classe);
  const correctEcolage = getEcolage(s.classe);
  const correctRestant = Math.max(0, correctEcolage - s.dejaPaye);
  const correctStatus = computeStatus(correctRestant, correctEcolage);

  if (s.cycle !== correctCycle || s.ecolage !== correctEcolage || s.restant !== correctRestant || s.status !== correctStatus) {
    return {
      ...s,
      cycle: correctCycle,
      ecolage: correctEcolage,
      restant: correctRestant,
      status: correctStatus,
      updatedAt: new Date().toISOString()
    };
  }
  return s;
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Identité ─────────────────────────────────────────
      appName: 'EduFinance',
      setAppName: (name) => set({ appName: name }),
      schoolLogo: null,
      setSchoolLogo: (logo) => set({ schoolLogo: logo }),
      schoolStamp: null,
      setSchoolStamp: (stamp) => set({ schoolStamp: stamp }),
      tranches: [],
      setTranches: (tranches) => {
        set({ tranches });
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend(get()).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },

      // ── Thème ──────────────────────────────────────────
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      lastReportMonth: null,
      setLastReportMonth: (lastReportMonth) => set({ lastReportMonth }),
      privacyMode: false,
      setPrivacyMode: (privacyMode) => set({ privacyMode }),

      // ── Auth ──────────────────────────────────────────────
      user: null,
      isAuthenticated: false,
      connectedParentsCount: 0,
      setConnectedParentsCount: (count) => set({ connectedParentsCount: count }),
      badges: [],
    unreadMessages: 0,
      setUnreadMessages: (count) => set({ unreadMessages: count }),

      reportAnnouncementReadToBackend: async (announcementId: string) => {
        try {
          const { API_BASE_URL } = await import('../config');
          const { getAuthHeaders } = await import('../services/apiHelpers');
          
          await fetch(`${API_BASE_URL}/announcements/${announcementId}/read`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.warn('⚠️ Échec report read status sur backend:', err);
        }
      },

      fetchUnreadMessages: async () => {
        // Désactivé temporairement pour le compte parent car l'API retourne 500 
        // et pollue la console.
        const user = get().user;
        if (user?.role === 'parent') return;

        try {
          const { chatApi } = await import('../services/chatApi');
          const count = await chatApi.getUnreadCount();
          set({ unreadMessages: count });
        } catch (err) {
          // Silence noise
        }
      },
      login: async (username, password, schoolSlug) => {
        try {
          const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telephone: username, password, schoolSlug })
          });

          const text = await res.text();
          let result: any;
          try {
            result = JSON.parse(text);
          } catch (parseErr) {
            console.error('Login response not JSON:', text);
            throw new Error('Réponse API invalide');
          }

          // Gérer les erreurs spécifiques multi-tenant
          if (res.status === 402 && result.error === 'trial_expired') {
            throw new Error(`TRIAL_EXPIRED:${result.school_name || 'votre école'}`);
          }
          if (res.status === 403) {
            throw new Error(result.error || 'Accès refusé.');
          }

          if (res.ok && result.token) {
            localStorage.setItem('parent_token', result.token);
            const loggedUser: User = {
              id: result.user.id,
              username: result.user.telephone,
              role: result.user.role,
              nom: result.user.nom,
              telephone: result.user.telephone,
              // ⚡ Informations multi-tenant
              schoolSlug: result.user.school_slug || undefined,
              schoolName: result.user.school_name || undefined,
            };

            // Déterminer la page de redirection selon le rôle
            let targetPage: AppPage = 'dashboard';
            if (loggedUser.role === 'superadmin') targetPage = 'superadmin_dashboard';
            else if (loggedUser.role === 'parent') targetPage = 'parent_dashboard';
            else if (loggedUser.role === 'superviseur' || loggedUser.role === 'surveillant') targetPage = 'scan_presence';

            // Si l'école est en période d'essai, stocker la date de fin
            if (result.user.trial_ends_at) {
              localStorage.setItem('trial_ends_at', result.user.trial_ends_at);
              localStorage.setItem('school_status', result.user.school_status || 'trial');
            }

            // ⚠️ CRITIQUE : Vider intégralement le cache local de l'école précédente 
            // pour garantir une architecture SaaS 100% isolée.
            // On préserve uniquement les lectures d'annonces persistantes si besoin
            const savedReadsStr = localStorage.getItem(`announcements_read_${result.user.id}`);
            const savedReads = savedReadsStr ? JSON.parse(savedReadsStr) : [];

            set({
              students: [],
              parents: [],
              presences: [],
              activityLogs: [],
              links: [],
              announcements: [],
              announcementReads: savedReads, // Restaurer les lectures locales
              matieres: [],
              classeMatieres: [],
              notes: [],
              schoolLogo: result.user.school_logo || null,
              schoolStamp: null,
              schoolName: result.user.school_name || 'Établissement',
            });

            set({ user: loggedUser, isAuthenticated: true, currentPage: targetPage });
            get().addActivityLog(createActivityLog(loggedUser.nom, loggedUser.role, 'connexion', 'Connexion API réussie'));
            if (loggedUser.role !== 'superadmin') get().fetchAllFromBackend();
            return true;
          }
        } catch (err: any) {
          // Re-lancer les erreurs spécifiques pour les afficher à l'utilisateur
          if (err.message?.startsWith('TRIAL_EXPIRED:') || err.message?.includes('suspendu') || err.message?.includes('Accès')) {
            throw err;
          }
          console.error("Erreur login backend, essai local...", err);
        }

        // ⛔ Fallback local supprimé pour la sécurité SaaS multi-tenant.
        // Toute authentification doit passer par le backend API.
        return false;
      },
      logout: () => {
        const u = get().user;
        if (u) {
          get().addActivityLog(createActivityLog(u.nom, u.role, 'connexion', 'Déconnexion'));
        }
        localStorage.removeItem('parent_token');
        set({
          user: null, 
          isAuthenticated: false, 
          currentPage: 'dashboard',
          students: [],
          parents: [],
          presences: [],
          activityLogs: [],
          links: [],
          announcements: [],
          announcementReads: [],
          matieres: [],
          classeMatieres: [],
          notes: []
        });
      },

      // ── Navigation ───────────────────────────────────────
      currentPage: 'dashboard',
      setCurrentPage: (page) => {
        const u = get().user;
        // SuperAdmin : accès uniquement aux pages superadmin
        if (u?.role === 'superadmin') {
          const allowed: AppPage[] = ['superadmin_dashboard', 'superadmin_schools', 'superadmin_billing'];
          if (!allowed.includes(page)) {
            set({ currentPage: 'superadmin_dashboard' });
            return;
          }
        } else if (u?.role === 'parent') {
          const allowed: AppPage[] = ['parent_dashboard', 'parent_historique', 'parent_recus', 'parent_badges', 'chat', 'annonces', 'parent_notes'];
          if (!allowed.includes(page)) {
            set({ currentPage: 'parent_dashboard' });
            return;
          }
        } else if (u?.role === 'superviseur' || u?.role === 'surveillant') {
          const allowed: AppPage[] = ['scan_presence', 'scan_sortie', 'scan_information', 'carte_scolaire'];
          if (!allowed.includes(page)) {
            set({ currentPage: 'scan_presence' });
            return;
          }
        }
        set({ currentPage: page });
      },

      // ── Élèves ───────────────────────────────────────────
      students: [],
      setStudents: (students) => set({ students: deduplicateStudents(students.map(repairStudent)).list }),
      addStudent: (data) => {
        const ecolage = getEcolage((data as { classe: string }).classe);
        const restant = ecolage - ((data as { dejaPaye?: number }).dejaPaye || 0);
        const studentId = uuid();
        const existing = get().students.find(s => 
          s.nom.toLowerCase() === data.nom.toLowerCase() && 
          (s.prenom || '').toLowerCase() === (data.prenom || '').toLowerCase() && 
          s.classe.toLowerCase() === data.classe.toLowerCase()
        );

        if (existing) {
          console.warn(`[AddStudent] L'élève ${data.prenom} ${data.nom} existe déjà dans cette classe. Mise à jour de l'existant.`);
          get().updateStudent(existing.id, data);
          return;
        }

        const student: Student = {
          ...data,
          id: studentId,
          ecolage,
          restant,
          cycle: getCycle(data.classe),
          status: computeStatus(restant, ecolage),
          historiquesPaiements: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const u = get().user;
        if (u) get().addActivityLog(createActivityLog(u.nom, u.role, 'autre', `Ajout de l'élève : ${data.prenom} ${data.nom}`));

        set({ students: [...get().students, student] });

        // Background sync
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend({
            students: get().students,
            presences: get().presences,
            activityLogs: get().activityLogs
          }).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },
      updateStudent: (id, updates) => {
        const students = get().students.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...s, ...updates, updatedAt: new Date().toISOString() };
          if (updates.classe) {
            updated.ecolage = getEcolage(updates.classe);
            updated.cycle = getCycle(updates.classe);
          }
          if (updates.dejaPaye !== undefined || updates.classe) {
            updated.restant = updated.ecolage - updated.dejaPaye;
          }
          updated.status = computeStatus(updated.restant, updated.ecolage);
          return updated;
        });

        const u = get().user;
        if (u) {
          const student = get().students.find(s => s.id === id);
          get().addActivityLog(createActivityLog(u.nom, u.role, 'modification_eleve', `Modification : ${student ? student.prenom + ' ' + student.nom : id}`));
        }

        set({ students });

        // Background sync
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend({
            students: get().students,
            presences: get().presences,
            activityLogs: get().activityLogs
          }).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },
      deleteStudent: async (id) => {
        const u = get().user;
        if (u) {
          const student = get().students.find(s => s.id === id);
          get().addActivityLog(createActivityLog(u.nom, u.role, 'suppression', `Suppression : ${student ? student.prenom + ' ' + student.nom : id}`));
        }
        set({
          students: get().students.filter((s) => s.id !== id),
          lastSyncTimestamp: Date.now() // Bloque le polling entrant pendant 60s
        });

        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          await fetch(`${API_BASE_URL}/sync/student/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to delete student from cloud:', err);
        }
      },
      addPayment: (studentId, paymentData) => {
        const students = get().students.map((s) => {
          if (s.id !== studentId) return s;
          const payment: Payment = { id: uuid(), studentId, ...paymentData };
          const newDejaPaye = s.dejaPaye + paymentData.montant;
          const newRestant = Math.max(0, s.ecolage - newDejaPaye);
          return {
            ...s,
            dejaPaye: newDejaPaye,
            restant: newRestant,
            status: computeStatus(newRestant, s.ecolage),
            historiquesPaiements: [...s.historiquesPaiements, payment],
            updatedAt: new Date().toISOString(),
          };
        });

        const u = get().user;
        if (u) {
          const student = get().students.find(s => s.id === studentId);
          get().addActivityLog(createActivityLog(u.nom, u.role, 'paiement', `Paiement : ${paymentData.montant} FCFA pour ${student ? student.prenom + ' ' + student.nom : studentId}`));
        }

        set({ students });

        // Background sync
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend({
            students: get().students,
            presences: get().presences,
            activityLogs: get().activityLogs
          }).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },

      // ── Parents ──────────────────────────────────────────
      parents: [],
      setParents: (parents) => set({ parents }),

      // ── UI ───────────────────────────────────────────────
      selectedStudent: null,
      setSelectedStudent: (student) => set({ selectedStudent: student }),
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),
      filterClasse: '',
      setFilterClasse: (c) => set({ filterClasse: c }),
      filterCycle: '',
      setFilterCycle: (c) => set({ filterCycle: c }),
      filterStatus: '',
      setFilterStatus: (s) => set({ filterStatus: s }),
      chatRecipientId: null,
      setChatRecipientId: (id) => set({ chatRecipientId: id }),

      // ── Paramètres ───────────────────────────────────────
      schoolName: 'Établissement Scolaire',
      setSchoolName: (name) => set({ schoolName: name }),
      schoolYear: '2024-2025',
      setSchoolYear: (year) => set({ schoolYear: year }),
      messageRemerciement:
        "Nous vous remercions sincèrement pour votre ponctualité dans le règlement de la scolarité. Votre soutien contribue au bon fonctionnement de notre établissement.",
      setMessageRemerciement: (m) => set({ messageRemerciement: m }),
      messageRappel:
        "Nous vous rappelons cordialement que le règlement du solde de scolarité est attendu. Veuillez régulariser votre situation dans les meilleurs délais.",
      setMessageRappel: (m) => set({ messageRappel: m }),

      updateAllSettings: async (newSettings) => {
        console.log('💾 [Store] Saving all settings to cloud...', Object.keys(newSettings));
        set(newSettings);
        try {
          const { syncToBackend } = await import('../services/backendSync');
          const result = await syncToBackend(newSettings);
          if (result) {
            console.log('✅ [Store] All settings synced successfully!');
          }
        } catch (err) {
          console.error('❌ [Store] Error syncing settings:', err);
        }
      },
      settings: {
        seuilDeuxiemeTranche: 70,
        schoolName: 'Établissement Scolaire',
        schoolYear: '2024-2025',
        messageRemerciement: "Nous vous remercions sincèrement pour votre ponctualité dans le règlement de la scolarité. Votre soutien contribue au bon fonctionnement de notre établissement.",
        messageRappel: "Nous vous rappelons cordialement que le règlement du solde de scolarité est attendu. Veuillez régulariser votre situation dans les meilleurs délais.",
        currency: 'FCFA',
        nomEcole: 'Établissement Scolaire',
        anneScolaire: '2024-2025',
        adresse: 'Adresse de l\'établissement',
        telephone: '+229 XX XX XX XX',
        email: 'contact@ecole.ci',
        badgeParentResponsable: 'Parent Responsable',
        badge2emeTranche: '2ème Tranche Validée',
        tranches: []
      },
      updateSettings: (newSettings) => set({ settings: newSettings }),

      // ── Présences ─────────────────────────────────────────
      presences: [],
      addPresence: (presence) => {
        set({ presences: [presence, ...get().presences] });
        // Background sync
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend({
            students: get().students,
            presences: get().presences,
            activityLogs: get().activityLogs
          }).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },
      getPresencesToday: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().presences.filter(p => p.date === today && (p.type === 'ENTREE' || !p.type));
      },
      getSortiesToday: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().presences.filter(p => p.date === today && p.type === 'SORTIE');
      },
      isAlreadyPresent: (eleveId: string) => {
        const today = new Date().toISOString().split('T')[0];
        return get().presences.some(p => p.eleveId === eleveId && p.date === today && (p.type === 'ENTREE' || !p.type));
      },
      hasAlreadyExited: (eleveId: string) => {
        const today = new Date().toISOString().split('T')[0];
        return get().presences.some(p => p.eleveId === eleveId && p.date === today && p.type === 'SORTIE');
      },

      // ── Horaires par cycle ──────────────────────────────────
      cycleSchedules: [
        { cycle: 'Primaire', heureLimite: '07:30' },
        { cycle: 'Collège', heureLimite: '07:45' },
        { cycle: 'Lycée', heureLimite: '08:00' },
      ],
      setCycleSchedules: (schedules) => {
        set({ cycleSchedules: schedules });
        // Sync to backend
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend(get()).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },
      getHeureLimite: (cycle: string) => {
        const schedule = get().cycleSchedules.find(s => s.cycle === cycle);
        return schedule?.heureLimite || '08:00';
      },

      // ── Annonces ────────────────────────────────────────────
      announcements: [],
      addAnnouncement: async (data) => {
        const announcement: Announcement = {
          ...data,
          id: uuid(),
          createdAt: new Date().toISOString(),
        };
        // Mise à jour locale immédiate
        set({ announcements: [announcement, ...get().announcements] });

        // Appel backend dédié → sauvegarde Supabase + Push à tous les parents
        try {
          const { BACKEND_URL } = await import('../config');
          const { getAuthHeaders } = await import('../services/apiHelpers');
          const res = await fetch(`${BACKEND_URL}/api/announcements`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              id: announcement.id,
              titre: announcement.titre,
              message: announcement.message,
              cible: announcement.cible,
              importance: announcement.importance,
              createdBy: announcement.createdBy,
              createdAt: announcement.createdAt,
            }),
          });
          const result = await res.json();
          if (result.success) {
            console.log(`✅ Annonce publiée : ${result.notificationsSent}/${result.totalParents} notifications push envoyées`);
          } else {
            console.warn('⚠️ Problème publication annonce:', result.error);
          }
        } catch (err) {
          console.error('❌ Erreur envoi annonce backend:', err);
        }

        // Sync global pour garder la cohérence
        import('../services/backendSync').then(({ syncToBackend }) => {
          syncToBackend(get()).then(() => set({ lastSyncTimestamp: Date.now() }));
        });
      },
      deleteAnnouncement: async (id) => {
        set({
          announcements: get().announcements.filter(a => a.id !== id),
          announcementReads: get().announcementReads.filter(r => r.announcementId !== id),
        });
        set({ lastSyncTimestamp: Date.now() }); // Bloque le polling entrant
        try {
          const { BACKEND_URL } = await import('../config');
          const { getAuthHeaders } = await import('../services/apiHelpers');
          await fetch(`${BACKEND_URL}/api/announcements/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
        } catch (err) {
          console.error('❌ Erreur suppression annonce backend:', err);
        }
      },
      announcementReads: [],
      markAnnouncementRead: (announcementId, parentId) => {
        const reads = get().announcementReads;
        const existing = reads.find(
          r => r.announcementId === announcementId && r.parentId === parentId
        );
        
        let newReads;
        if (existing) {
          newReads = reads.map(r =>
            r.announcementId === announcementId && r.parentId === parentId
              ? { ...r, readAt: new Date().toISOString(), remindAt: undefined }
              : r
          );
        } else {
          newReads = [
            ...reads,
            { announcementId, parentId, readAt: new Date().toISOString() },
          ];
        }
        
        set({ announcementReads: newReads });
        
        // Persistance locale robuste pour éviter que ça revienne à la reconnexion
        localStorage.setItem(`announcements_read_${parentId}`, JSON.stringify(newReads));

        const user = get().user;
        if (user?.role === 'parent') {
          // Envoyer l'info au backend pour que l'admin voie les stats
          get().reportAnnouncementReadToBackend(announcementId);
        }

        // On ne tente de sync vers le cloud que si on n'est pas un parent 
        // car l'URL /api/sync est restreinte.
        if (user && user.role !== 'parent') {
          import('../services/backendSync').then(({ syncToBackend }) => {
            syncToBackend({ announcementReads: newReads }).then(() => set({ lastSyncTimestamp: Date.now() }));
          });
        }
      },
      remindAnnouncementLater: (announcementId, parentId) => {
        const remindAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +24h
        const reads = get().announcementReads;
        const existing = reads.find(
          r => r.announcementId === announcementId && r.parentId === parentId
        );
        
        let newReads;
        if (existing) {
          newReads = reads.map(r =>
            r.announcementId === announcementId && r.parentId === parentId
              ? { ...r, remindAt, readAt: '' }
              : r
          );
        } else {
          newReads = [
            ...reads,
            { announcementId, parentId, readAt: '', remindAt },
          ];
        }
        set({ announcementReads: newReads });
        localStorage.setItem(`announcements_read_${parentId}`, JSON.stringify(newReads));
      },
      getUnreadAnnouncements: (parentId, classes) => {
        const now = new Date().toISOString();
        const reads = get().announcementReads;
        return get().announcements.filter(a => {
          // Filtrer par cible (toutes ou classe spécifique)
          if (a.cible !== 'all' && classes && !classes.includes(a.cible)) return false;
          // Vérifier si lu
          const read = reads.find(r => r.announcementId === a.id && r.parentId === parentId);
          if (!read) return true; // jamais ouvert
          if (read.readAt) return false; // marqué comme lu
          // Si remindAt et que le moment n'est pas encore arrivé, ne pas afficher
          if (read.remindAt && read.remindAt > now) return false;
          return true; // le rappel est passé, réafficher
        });
      },

      // ── Logs d'activité ────────────────────────────────────
      activityLogs: [],
      addActivityLog: (log) => set({ activityLogs: [log, ...get().activityLogs].slice(0, 500) }),

      // ── Compteur reçus ─────────────────────────────────────
      receiptCounter: 0,
      incrementReceiptCounter: () => {
        const next = get().receiptCounter + 1;
        const year = new Date().getFullYear();
        const code = `REC-${year}-${String(next).padStart(6, '0')}`;
        set({ receiptCounter: next });
        return code;
      },

      // ── Synchronisation Cloud ───────────────────────────
      links: [],
      setLinks: (links) => set({ links }),
      isSyncing: false,
      setIsSyncing: (s) => set({ isSyncing: s }),
      lastSyncTimestamp: 0,
      setLastSyncTimestamp: (t) => set({ lastSyncTimestamp: t }),
      fetchAllFromBackend: async (force = false) => {
        const user = get().user;
        if (!user) return;

        // ── Parents : sync spécifique (annonces, paiements, messages) ──
        if (user.role === 'parent') {
          // Les parents ont un cooldown de 12s max (poll toutes les 15s)
          const now = Date.now();
          if (!force && now - get().lastSyncTimestamp < 12000) return;
          try {
            const { getAuthHeaders } = await import('../services/apiHelpers');
            const { BACKEND_URL } = await import('../config');
            const res = await fetch(`${BACKEND_URL}/api/parent/data`, {
              headers: getAuthHeaders()
            });
            if (!res.ok) return;
            const data = await res.json();
            
            // 🎨 Paramètres de l'école (Match logic admin)
            if (data.appSettings) {
              const { appSettings } = data;
              set({
                appName: appSettings.appName || 'YZO GESTION',
                schoolName: appSettings.schoolName || '',
                schoolYear: appSettings.schoolYear || '',
                schoolLogo: appSettings.schoolLogo || null,
                schoolStamp: appSettings.schoolStamp || null,
                messageRemerciement: appSettings.messageRemerciement || '',
                messageRappel: appSettings.messageRappel || '',
                tranches: appSettings.tranches || []
              });
              console.log(`🎨 [Sync Parent] Paramètres appliqués ! Logo: ${!!appSettings.schoolLogo}`);
            }

            // 👨‍👩‍👧‍👦 Élèves (Enfants)
            if (Array.isArray(data.students)) {
              set({ students: data.students });
              console.log(`✅ [Sync Parent] ${data.students.length} enfant(s) chargé(s).`);
            }

             if (data.announcements) set({ announcements: data.announcements });
            if (data.announcementReads || localStorage.getItem(`announcements_read_${user.id}`)) {
              // Fusionner avec les lectures locales pour ne pas perdre les "lus" récents 
              // si le backend n'a pas pu être mis à jour (403 Forbidden)
              const savedReadsStr = localStorage.getItem(`announcements_read_${user.id}`);
              const localReads = savedReadsStr ? JSON.parse(savedReadsStr) : get().announcementReads;
              const serverReads = data.announcementReads || [];
              const merged = [...serverReads];
              
              localReads.forEach((lr: any) => {
                if (!merged.find((mr: any) => mr.announcementId === lr.announcementId && mr.parentId === lr.parentId)) {
                  merged.push(lr);
                }
              });
              set({ announcementReads: merged });
              // Mettre à jour le cache local avec le merge
              localStorage.setItem(`announcements_read_${user.id}`, JSON.stringify(merged));
            }
            if (typeof data.unreadMessages === 'number') set({ unreadMessages: data.unreadMessages });
            
            // 📝 Données académiques
            if (Array.isArray(data.notes)) {
              set({ notes: data.notes });
              console.log(`📝 [Sync Parent] ${data.notes.length} notes synchronisées.`);
            }
            if (Array.isArray(data.matieres)) set({ matieres: data.matieres });
            if (Array.isArray(data.classeMatieres)) set({ classeMatieres: data.classeMatieres });
            
            // 🏅 Badges
            if (Array.isArray(data.badges)) {
              set({ badges: data.badges });
              console.log(`🏅 [Sync Parent] ${data.badges.length} badge(s) chargé(s).`);
            }
            
            console.log('🏁 [Sync Parent] Synchronisation complète terminée.');
            set({ lastSyncTimestamp: now });
          } catch (err) {
            console.warn('[Parent Sync] Erreur:', err);
          }
          return;
        }

        // ── Gestion des appels concurrents ──
        // Si un sync est déjà en cours, on attend qu'il finisse pour le forced, sinon on quitte
        if (get().isSyncing) {
          if (force) {
            console.log('🔄 [Sync] Sync forcée mais un sync est en cours, retry dans 2s...');
            setTimeout(() => get().fetchAllFromBackend(true), 2000);
          } else {
            console.log('⏳ [Sync] Fetch ignoré (sync en cours)');
          }
          return;
        }

        // Éviter de fetch si on vient de faire une sync (cooldown 55s) — sauf si forcé
        const now = Date.now();
        if (!force && now - get().lastSyncTimestamp < 55000) {
          console.log('⏳ [Sync] Fetch skipped (cooldown active)');
          return;
        }

        console.log(`🔄 [Sync] Démarrage du fetch cloud... (force=${force})`);
        set({ isSyncing: true });
        try {
          const { fetchFromBackend } = await import('../services/backendSync');
          const data = await fetchFromBackend();

          if (!data) {
            console.warn('⚠️ [Sync] Le backend n\'a retourné aucune donnée.');
            return;
          }

          // ════════════════════════════════════════════════════════
          // 🔑 PARAMÈTRES — TOUJOURS mis à jour indépendamment des élèves
          // ════════════════════════════════════════════════════════
          if (data.appSettings) {
            console.log('🎨 [Sync] Mise à jour des paramètres depuis le cloud:', {
              appName: data.appSettings.appName,
              schoolName: data.appSettings.schoolName,
              hasLogo: !!data.appSettings.schoolLogo,
              logoLength: data.appSettings.schoolLogo?.length || 0,
              hasStamp: !!data.appSettings.schoolStamp,
              stampLength: data.appSettings.schoolStamp?.length || 0,
            });
            set({
              appName: data.appSettings.appName || get().appName,
              schoolName: data.appSettings.schoolName || get().schoolName,
              schoolYear: data.appSettings.schoolYear || get().schoolYear,
              schoolLogo: data.appSettings.schoolLogo !== undefined ? data.appSettings.schoolLogo : get().schoolLogo,
              schoolStamp: data.appSettings.schoolStamp !== undefined ? data.appSettings.schoolStamp : get().schoolStamp,
              messageRemerciement: data.appSettings.messageRemerciement || get().messageRemerciement,
              messageRappel: data.appSettings.messageRappel || get().messageRappel,
              ...(data.appSettings.cycleSchedules ? { cycleSchedules: data.appSettings.cycleSchedules } : {}),
              ...(data.appSettings.tranches ? { tranches: data.appSettings.tranches } : {}),
            });
            console.log('✅ [Sync] Paramètres appliqués ! Logo:', !!get().schoolLogo, '| Sceau:', !!get().schoolStamp);
          } else {
            console.warn('⚠️ [Sync] Aucun appSettings dans la réponse du backend.');
          }

          // ════════════════════════════════════════════════════════
          // 👨‍🎓 ÉLÈVES & DONNÉES — AUTORITÉ CLOUD
          // ════════════════════════════════════════════════════════
          if (Array.isArray(data.students)) {
            const rawCount = data.students.length;
            const { list: repairedStudents, countRemoved } = deduplicateStudents(data.students.map(repairStudent));
            
            set({
              students: repairedStudents,
              presences: data.presences || [],
              activityLogs: data.activityLogs || [],
              links: data.links || [],
              lastSyncTimestamp: Date.now() // Bloque le polling et synchro sortante immédiate
            });

            if (countRemoved > 0) {
              console.warn(`🧹 [Sync] Déduplication effectuée : ${rawCount} reçus -> ${repairedStudents.length} uniques (${countRemoved} doublons supprimés).`);
              console.log("🚀 Lancement du nettoyage permanent sur le Cloud...");
              import('../services/backendSync').then(({ syncToBackend }) => {
                syncToBackend(get(), true); 
              });
            } else {
              console.log(`✅ [Sync] ${repairedStudents.length} élèves chargés (Source: Cloud).`);
            }
          }

          // Annonces et reads venant du cloud
          if (Array.isArray(data.announcements)) {
            set({ announcements: data.announcements });
          }
          if (Array.isArray(data.announcementReads)) {
            set({ announcementReads: data.announcementReads });
          }
          // Récupération des données académiques
          if (Array.isArray(data.matieres)) {
            const hasCloud = data.matieres.length > 0;
            const hasLocal = get().matieres.length > 0;
            if (hasCloud || !hasLocal) {
              set({ matieres: data.matieres });
            }
          }
          if (Array.isArray(data.classeMatieres)) {
            const hasCloud = data.classeMatieres.length > 0;
            const hasLocal = get().classeMatieres.length > 0;
            if (hasCloud || !hasLocal) {
              set({ classeMatieres: data.classeMatieres });
            }
          }
          if (Array.isArray(data.notes)) {
            const cloudNotes = data.notes.map((n: Note) => ({
              ...n,
              noteClasse: n.noteClasse !== null && n.noteClasse !== undefined ? Number(n.noteClasse) : null,
              noteDevoir: n.noteDevoir !== null && n.noteDevoir !== undefined ? Number(n.noteDevoir) : null,
              noteCompo: n.noteCompo !== null && n.noteCompo !== undefined ? Number(n.noteCompo) : null,
            }));

            // 🛡 AUTORITÉ CLOUD : On écrase les notes locales par celles du Cloud lors de la sync
            // sauf si l'utilisateur est sur la page de saisie (sécurisé par le polling manuel)
            set({ notes: cloudNotes });
            console.log(`📝 [Sync] Notes: ${cloudNotes.length} notes synchronisées depuis le cloud.`);
          }

          // Mise à jour du timestamp après succès
          set({ lastSyncTimestamp: Date.now() });
          console.log(`🏁 [Sync] Synchronisation complète terminée avec succès.`);

        } catch (err) {
          console.error('💥 [Sync] Erreur fatale lors de la synchronisation:', err);
        } finally {
          set({ isSyncing: false });
        }
      },
      clearCloudPresences: async () => {
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          const res = await fetch(`${API_BASE_URL}/sync/presences`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (res.ok) {
            set({ presences: [] });
            return true;
          }
          return false;
        } catch (err) {
          console.error('Failed to clear presences:', err);
          return false;
        }
      },
      clearCloudActivityLogs: async () => {
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          const res = await fetch(`${API_BASE_URL}/sync/logs`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (res.ok) {
            set({ activityLogs: [] });
            return true;
          }
          return false;
        } catch (err) {
          console.error('Failed to clear logs:', err);
          return false;
        }
      },
      clearCloudStudents: async () => {
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          const res = await fetch(`${API_BASE_URL}/sync/students`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (res.ok) {
            set({ students: [] });
            return true;
          }
          return false;
        } catch (err) {
          console.error('Failed to clear students:', err);
          return false;
        }
      },
      fetchPublicSettings: async () => {
        // Bloquer l'écrasement des paramètres locaux si l'utilisateur est déjà authentifié (SaaS: chaque école a ses propres données)
        if (get().isAuthenticated) {
          return;
        }
        
        console.log('🌐 [Settings] Fetching public settings...');
        try {
          const res = await fetch(`${API_BASE_URL}/settings`);
          if (res.ok) {
            const data = await res.json();
            console.log('🌐 [Settings] Data received:', data);
            if (data) {
              set({
                // Ne remplacer que si le champ ciblé est réellement pertinent et différent, ou si non existant
                appName: get().appName && get().appName !== 'EduFinance' ? get().appName : (data.appName || get().appName),
                schoolName: get().schoolName && get().schoolName !== 'Établissement Scolaire' ? get().schoolName : (data.schoolName || get().schoolName),
                schoolYear: data.schoolYear || get().schoolYear,
                schoolLogo: data.schoolLogo !== null && data.schoolLogo !== undefined ? data.schoolLogo : get().schoolLogo,
                schoolStamp: data.schoolStamp !== null && data.schoolStamp !== undefined ? data.schoolStamp : get().schoolStamp,
                tranches: data.tranches || get().tranches
              });
              console.log('✅ [Settings] App state updated with cloud settings.');
            }
          } else {
            console.warn('⚠️ [Settings] Fetch failed with status:', res.status);
          }
        } catch (err) {
          console.error('❌ [Settings] Fatal error fetching settings:', err);
        }
      },

      // ── M2 : ACADÉMIQUE & NOTES ──
      currentPeriode: 'TRIMESTRE 1',
      setCurrentPeriode: (p) => set({ currentPeriode: p }),
      matieres: [],
      setMatieres: (m) => set({ matieres: m }),
      addMatiere: (m) => {
        set(s => ({ matieres: [...s.matieres, m] }));
        import('../services/backendSync').then(({ syncToBackend }) =>
          syncToBackend({ matieres: get().matieres }).then(() => set({ lastSyncTimestamp: Date.now() }))
        );
      },
      updateMatiere: (id, m) => {
        set(s => ({ matieres: s.matieres.map(x => x.id === id ? { ...x, ...m } : x) }));
        import('../services/backendSync').then(({ syncToBackend }) =>
          syncToBackend({ matieres: get().matieres }).then(() => set({ lastSyncTimestamp: Date.now() }))
        );
      },
      deleteMatiere: async (id) => {
        set(s => ({
          matieres: s.matieres.filter(x => x.id !== id),
          lastSyncTimestamp: Date.now()
        }));
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          await fetch(`${API_BASE_URL}/sync/matiere/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to delete matiere from cloud:', err);
        }
      },

      classeMatieres: [],
      setClasseMatieres: (cm) => set({ classeMatieres: cm }),
      addClasseMatiere: (cm) => {
        set(s => ({ classeMatieres: [...s.classeMatieres, cm] }));
        import('../services/backendSync').then(({ syncToBackend }) =>
          syncToBackend({ classeMatieres: get().classeMatieres }).then(() => set({ lastSyncTimestamp: Date.now() }))
        );
      },
      updateClasseMatiere: (id, cm) => {
        set(s => ({ classeMatieres: s.classeMatieres.map(x => x.id === id ? { ...x, ...cm } : x) }));
        import('../services/backendSync').then(({ syncToBackend }) =>
          syncToBackend({ classeMatieres: get().classeMatieres }).then(() => set({ lastSyncTimestamp: Date.now() }))
        );
      },
      deleteClasseMatiere: async (id) => {
        set(s => ({
          classeMatieres: s.classeMatieres.filter(x => x.id !== id),
          lastSyncTimestamp: Date.now()
        }));
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          await fetch(`${API_BASE_URL}/sync/classe-matiere/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to delete classeMatiere from cloud:', err);
        }
      },

      notes: [],
      setNotes: (n) => set({ notes: n }),
      upsertNote: (n) => get().upsertNotes([n]),
      upsertNotes: (batch) => {
        set(s => {
          let currentNotes = [...s.notes];
          batch.forEach(n => {
            const idx = currentNotes.findIndex(x => x.eleveId === n.eleveId && x.matiereId === n.matiereId && x.periode === n.periode);
            if (idx >= 0) {
              currentNotes[idx] = n;
            } else {
              currentNotes.push(n);
            }
          });
          return { notes: currentNotes };
        });
        // ⚠️ PAS de sync automatique ici ! 
        // La sync est déclenchée manuellement depuis SaisieNotes.tsx 
        // pour éviter les boucles Realtime et la perte de notes pendant la saisie.
        console.log(`📝 [Notes] ${batch.length} notes sauvegardées localement.`);
      },
      deleteNote: async (id) => {
        set(s => ({
          notes: s.notes.filter(x => x.id !== id),
          lastSyncTimestamp: Date.now()
        }));
        try {
          const { getAuthHeaders } = await import('../services/apiHelpers');
          await fetch(`${API_BASE_URL}/sync/note/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to delete note from cloud:', err);
        }
      }

    }),
    {
      name: 'edufinance-storage',
      partialize: (state) => ({
        students: state.students,
        schoolName: state.schoolName,
        schoolYear: state.schoolYear,
        messageRemerciement: state.messageRemerciement,
        messageRappel: state.messageRappel,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        appName: state.appName,
        schoolLogo: state.schoolLogo,
        parents: state.parents || [],
        presences: state.presences || [],
        activityLogs: (state.activityLogs || []).slice(0, 500),
        receiptCounter: state.receiptCounter || 0,
        cycleSchedules: state.cycleSchedules || [],
        tranches: state.tranches || [],
        announcements: state.announcements || [],
        announcementReads: state.announcementReads || [],
        currentPeriode: state.currentPeriode || 'TRIMESTRE 1',
        matieres: state.matieres || [],
        classeMatieres: state.classeMatieres || [],
        notes: state.notes || [],
        lastReportMonth: state.lastReportMonth,
        currentPage: state.currentPage,
        theme: state.theme,
        chatRecipientId: state.chatRecipientId,
      }),
      onRehydrateStorage: () => (state) => {
        // Auto-réparation au chargement du storage local
        if (state) {
          if (state.students && state.students.length > 0) {
            // Déduplication agressive pour éradiquer les doublons (Nom+Prénom+Classe)
            state.students = deduplicateStudents(state.students.map(repairStudent)).list;
          }

          // Sécurité — Empêcher la re-connexion automatique de switcher un parent sur l'admin
          if (state.user?.role === 'parent') {
            const allowed: AppPage[] = ['parent_dashboard', 'parent_historique', 'parent_recus', 'parent_badges', 'chat', 'annonces', 'parent_notes'];
            if (!allowed.includes(state.currentPage)) {
              state.currentPage = 'parent_dashboard';
            }
          } else if (state.user?.role === 'superviseur') {
            const allowed: AppPage[] = ['scan_presence', 'scan_sortie', 'carte_scolaire'];
            if (!allowed.includes(state.currentPage)) {
              state.currentPage = 'scan_presence';
            }
          }
        }
        console.log('🔄 [Storage] Rehydrated. Current Logo:', state?.schoolLogo ? 'Present (Base64)' : 'None');
      },
    }
  )
);
