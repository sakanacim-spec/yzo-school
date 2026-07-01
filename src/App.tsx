// ============================================================
// APP — Point d'entrée principal
// ============================================================
import React, { Suspense, lazy } from 'react';
import { useStore } from './store/useStore';
import { Login } from './components/Login';
import { LandingPage } from './components/LandingPage';
import { Layout } from './components/Layout';
import { AnnouncementPopup } from './components/AnnouncementPopup';
import { webPushService } from './services/webPushService';


// Lazy loading for pages to reduce initial bundle size
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Eleves = lazy(() => import('./pages/Eleves').then(m => ({ default: m.Eleves })));
const Paiements = lazy(() => import('./pages/Paiements').then(m => ({ default: m.Paiements })));
const Depenses = lazy(() => import('./pages/Depenses').then(m => ({ default: m.Depenses })));
const Analyses = lazy(() => import('./pages/Analyses').then(m => ({ default: m.Analyses })));
const Documents = lazy(() => import('./pages/Documents').then(m => ({ default: m.Documents })));
const Parametres = lazy(() => import('./pages/Parametres').then(m => ({ default: m.Parametres })));
const Recouvrement = lazy(() => import('./pages/Recouvrement').then(m => ({ default: m.Recouvrement })));
const ScanPresence = lazy(() => import('./pages/ScanPresence').then(m => ({ default: m.ScanPresence })));
const ScanSortie = lazy(() => import('./pages/ScanSortie').then(m => ({ default: m.ScanSortie })));
const ScanInformation = lazy(() => import('./pages/ScanInformation'));
const CarteScolaire = lazy(() => import('./pages/CarteScolaire').then(m => ({ default: m.CarteScolaire })));
const GestionAcademique = lazy(() => import('./pages/GestionAcademique' /* */).then(m => ({ default: m.GestionAcademique })));
const SaisieNotes = lazy(() => import('./pages/SaisieNotes' /* */).then(m => ({ default: m.SaisieNotes })));
const SaisiePresence = lazy(() => import('./pages/professeur/SaisiePresence' /* */).then(m => ({ default: m.SaisiePresence })));
const EmploiDuTemps = lazy(() => import('./pages/EmploiDuTemps').then(m => ({ default: m.EmploiDuTemps })));
const ProfEmploiDuTemps = lazy(() => import('./pages/professeur/ProfEmploiDuTemps').then(m => ({ default: m.ProfEmploiDuTemps })));
const Bulletins = lazy(() => import('./pages/Bulletins').then(m => ({ default: m.Bulletins })));
const VerificationRecu = lazy(() => import('./pages/VerificationRecu').then(m => ({ default: m.VerificationRecu })));
const HistoriqueActivites = lazy(() => import('./pages/HistoriqueActivites').then(m => ({ default: m.HistoriqueActivites })));
const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard').then(m => ({ default: m.ParentDashboard })));
const ParentHistorique = lazy(() => import('./pages/parent/ParentHistorique').then(m => ({ default: m.ParentHistorique })));
const ParentRecus = lazy(() => import('./pages/parent/ParentRecus').then(m => ({ default: m.ParentRecus })));
const ParentBadges = lazy(() => import('./pages/parent/ParentBadges').then(m => ({ default: m.ParentBadges })));
const ParentMessages = lazy(() => import('./pages/parent/ParentMessages').then(m => ({ default: m.ParentMessages })));
const ParentNotes = lazy(() => import('./pages/parent/ParentNotes').then(m => ({ default: m.ParentNotes })));
const ParentDevoirsPresence = lazy(() => import('./pages/parent/ParentDevoirsPresence').then(m => ({ default: m.ParentDevoirsPresence })));
const ParentsList = lazy(() => import('./pages/ParentsList').then(m => ({ default: m.ParentsList })));
const ImportExport = lazy(() => import('./components/ImportExport').then(m => ({ default: m.ImportExport })));
const ChatWindow = lazy(() => import('./components/ChatWindow').then(m => ({ default: m.ChatWindow })));
const Annonces = lazy(() => import('./pages/Annonces').then(m => ({ default: m.Annonces })));
const Communication = lazy(() => import('./pages/Communication').then(m => ({ default: m.Communication })));
const GestionPersonnel = lazy(() => import('./pages/GestionPersonnel').then(m => ({ default: m.GestionPersonnel })));
const ProfesseurDashboard = lazy(() => import('./pages/professeur/ProfesseurDashboard').then(m => ({ default: m.ProfesseurDashboard })));
const ProfRessources = lazy(() => import('./pages/professeur/ProfRessources').then(m => ({ default: m.ProfRessources })));
const ParentRessources = lazy(() => import('./pages/parent/ParentRessources').then(m => ({ default: m.ParentRessources })));
const Salaires = lazy(() => import('./pages/Salaires').then(m => ({ default: m.Salaires })));
const CahierTextes = lazy(() => import('./pages/professeur/CahierTextes').then(m => ({ default: m.CahierTextes })));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-12">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);


const PageContent: React.FC = () => {
  const currentPage = useStore((s) => s.currentPage);
  const user = useStore((s) => s.user);

  // SuperAdmin: uniquement ses pages
  if (user?.role === 'superadmin') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <SuperAdminDashboard />
      </Suspense>
    );
  }

  // Sécurité — Empêcher un parent de voir une page admin même si le store est désynchronisé
  if (user?.role === 'parent') {
    const parentPages = ['parent_dashboard', 'parent_historique', 'parent_recus', 'parent_badges', 'chat', 'annonces', 'parent_notes', 'parent_devoirs_presence'];
    if (!parentPages.includes(currentPage as any)) {
      return <ParentDashboard />;
    }
  }

  if (user?.role === 'superviseur' || user?.role === 'surveillant') {
    const superviseurPages = ['scan_presence', 'scan_sortie', 'scan_information', 'carte_scolaire'];
    if (!superviseurPages.includes(currentPage as any)) {
      return <ScanPresence />;
    }
  }

  switch (currentPage) {
    case 'dashboard': return <Dashboard />;
    case 'eleves': return <Eleves />;
    case 'paiements': return <Paiements />;
    case 'analyses': return <Analyses />;
    case 'recouvrement': return <Recouvrement />;
    case 'depenses': return <Depenses />;
    case 'documents': return <Documents />;
    case 'parametres': return <Parametres />;
    case 'scan_presence': return <ScanPresence />;
    case 'scan_sortie': return <ScanSortie />;
    case 'scan_information': return <ScanInformation />;
    case 'carte_scolaire': return <CarteScolaire />;
    case 'gestion_academique': return <GestionAcademique />;
    case 'saisie_notes': return <SaisieNotes />;
    case 'saisie_presence': return <SaisiePresence />;
    case 'emploi_du_temps': return (user?.role === 'professeur') ? <ProfEmploiDuTemps /> : <EmploiDuTemps />;
    case 'bulletins': return <Bulletins />;
    case 'verification_recu': return <VerificationRecu />;
    case 'historique_activites': return <HistoriqueActivites />;
    case 'parent_dashboard': return <ParentDashboard />;
    case 'parent_historique': return <ParentHistorique />;
    case 'parent_recus': return <ParentRecus />;
    case 'parent_badges': return <ParentBadges />;
    case 'parent_messages': return <ParentMessages />;
    case 'parent_notes': return <ParentNotes />;
    case 'parent_devoirs_presence': return <ParentDevoirsPresence />;
    case 'parents_list': return <ParentsList />;
    case 'import_export': return <ImportExport />;
    case 'chat': return <ChatWindow />;
    case 'annonces': return <Annonces />;
    case 'communication': return <Communication />;
    case 'gestion_personnel': return <GestionPersonnel />;
    case 'prof_dashboard': return <ProfesseurDashboard />;
    case 'cahier_textes': return <CahierTextes />;
    case 'prof_ressources': return <ProfRessources />;
    case 'parent_ressources': return <ParentRessources />;
    case 'salaires': return <Salaires />;
    case 'superadmin_dashboard':
    case 'superadmin_schools':
    case 'superadmin_billing':
      return <SuperAdminDashboard />;
    default: return user?.role === 'parent' ? <ParentDashboard /> : <Dashboard />;
  }
};

export function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const fetchAllFromBackend = useStore((s) => s.fetchAllFromBackend);

  // ── Chargement des paramètres publics (Logo, Nom App) ────────
  React.useEffect(() => {
    useStore.getState().fetchPublicSettings();
  }, []);

  // ── Initialisation Web Push (Uniquement pour les Parents ou Web) ──
  React.useEffect(() => {
    if (isAuthenticated) {
      webPushService.init();
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    // ── Synchronisation Manuelle Uniquement ──────────────────────
    // On ne fait qu'un fetch initial au chargement de l'app.
    // La suite sera gérée manuellement par l'utilisateur via le bouton Sync.
    fetchAllFromBackend();

    return () => {
      // Nettoyage si nécessaire
    };
  }, [isAuthenticated, fetchAllFromBackend]);

  // ── Écoute des messages du Service Worker (navigation depuis push) ──
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NAVIGATE') {
        const notifType: string = event.data.notifType || 'general';
        const store = useStore.getState();
        const user = store.user;
        if (!user || user.role !== 'parent') return;

        const pageMap: Record<string, string> = {
          message:      'chat',
          announcement: 'annonces',
          payment:      'parent_historique',
          presence:     'parent_dashboard',
          general:      'parent_dashboard',
        };
        const targetPage = pageMap[notifType] || 'parent_dashboard';
        store.setCurrentPage(targetPage as any);
        store.fetchAllFromBackend();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, []);

  const [showLogin, setShowLogin] = React.useState(false);

  if (!isAuthenticated) {
    if (!showLogin) {
      return <LandingPage onLogin={() => setShowLogin(true)} />;
    }
    return <Login onBackToLanding={() => setShowLogin(false)} />;
  }

  return (
    <Layout>
      <Suspense fallback={<LoadingSpinner />}>
        <PageContent />
      </Suspense>
      <AnnouncementPopup />
    </Layout>
  );
}
