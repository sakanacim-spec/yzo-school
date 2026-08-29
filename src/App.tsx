// ============================================================
// APP — Point d'entrée principal
// ============================================================
import React, { Suspense, lazy } from 'react';
import { useStore } from './store/useStore';
import { Login } from './components/Login';
import { LandingPage } from './components/LandingPage';
import { Layout } from './components/Layout';
import { AnnouncementPopup } from './components/AnnouncementPopup';
import { About } from './pages/public/About';
import { Contact } from './pages/public/Contact';
import { Careers } from './pages/public/Careers';
import { LegalPage, LegalPageType } from './pages/public/LegalPage';
import { GuideAssistantWidget } from './components/GuideAssistantWidget';
import { SupportPage } from './pages/SupportPage';
import { UserGuide } from './pages/public/UserGuide';
import { Register } from './components/Register';
import {
  PublicPage,
  ContactExtra,
  parsePublicLocation,
  handlePublicNavigate,
  handleBlogNavigate,
  handleRegisterSchool,
  handleLoginNavigate,
  handleBackToLanding
} from './utils/publicNavigation';

// Lazy loading for pages to reduce initial bundle size
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Eleves = lazy(() => import('./pages/Eleves').then(m => ({ default: m.Eleves })));
const Paiements = lazy(() => import('./pages/Paiements').then(m => ({ default: m.Paiements })));
const Depenses = lazy(() => import('./pages/Depenses').then(m => ({ default: m.Depenses })));
const Analyses = lazy(() => import('./pages/Analyses').then(m => ({ default: m.Analyses })));
const Documents = lazy(() => import('./pages/Documents').then(m => ({ default: m.Documents })));
const Parametres = lazy(() => import('./pages/Parametres').then(m => ({ default: m.Parametres })));
const Recouvrement = lazy(() => import('./pages/Recouvrement').then(m => ({ default: m.Recouvrement })));
const Dons = lazy(() => import('./pages/Dons').then(m => ({ default: m.default })));
const AffiliateLogin = lazy(() => import('./pages/affiliate/AffiliateLogin').then(m => ({ default: m.AffiliateLogin })));
const AffiliateDashboard = lazy(() => import('./pages/affiliate/AffiliateDashboard').then(m => ({ default: m.AffiliateDashboard })));
const AmbassadorKitPage = lazy(() => import('./pages/affiliate/AmbassadorKitPage').then(m => ({ default: m.AmbassadorKitPage })));
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
const ParentEmploiDuTemps = lazy(() => import('./pages/parent/ParentEmploiDuTemps').then(m => ({ default: m.ParentEmploiDuTemps })));
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
const Blog = lazy(() => import('./pages/public/Blog'));
const BlogPost = lazy(() => import('./pages/public/BlogPost'));
const Partners = lazy(() => import('./pages/public/Partners'));

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
    const parentPages = ['parent_dashboard', 'parent_historique', 'parent_recus', 'parent_badges', 'chat', 'annonces', 'parent_notes', 'parent_devoirs_presence', 'parent_ressources', 'parent_emploi_du_temps'];
    if (!parentPages.includes(currentPage as any)) {
      return <ParentDashboard />;
    }
  }

  // Routes publiques (Dons)
  if (window.location.pathname.startsWith('/d/')) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <DonationPage />
      </Suspense>
    );
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
    case 'dons': return <Dons />;
    case 'scan_presence': return <ScanPresence />;
    case 'scan_sortie': return <ScanSortie />;
    case 'scan_information': return <ScanInformation />;
    case 'carte_scolaire': return <CarteScolaire />;
    case 'gestion_academique': return <GestionAcademique />;
    case 'saisie_notes': return <SaisieNotes />;
    case 'saisie_presence': return <SaisiePresence />;
    case 'emploi_du_temps': return <EmploiDuTemps />;
    case 'prof_emploi_du_temps': return <ProfEmploiDuTemps />;
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
    case 'parent_emploi_du_temps': return <ParentEmploiDuTemps />;
    case 'parents_list': return <ParentsList />;
    case 'import_export': return <ImportExport />;
    case 'chat': return <ChatWindow />;
    case 'annonces': return <Annonces />;
    case 'communication': return <Communication />;
    case 'gestion_personnel': return <GestionPersonnel />;
    case 'support': return <SupportPage />;
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
  const translationVersion = useStore((s) => s.translationVersion);

  // ── Chargement des paramètres publics (Logo, Nom App) ────────
  React.useEffect(() => {
    useStore.getState().fetchPublicSettings();
  }, []);

  const language = useStore((s) => s.language);
  React.useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (language === 'ar') {
      document.documentElement.classList.add('dir-rtl');
    } else {
      document.documentElement.classList.remove('dir-rtl');
    }
  }, [language]);

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

  const [publicPage, setPublicPage] = React.useState<PublicPage>(() =>
    parsePublicLocation(typeof window !== 'undefined' ? window.location.pathname : '/').publicPage
  );
  const [contactExtra, setContactExtra] = React.useState<ContactExtra | null>(() =>
    parsePublicLocation(typeof window !== 'undefined' ? window.location.pathname : '/').contactExtra
  );
  const [blogSlug, setBlogSlug] = React.useState<string | null>(() =>
    parsePublicLocation(typeof window !== 'undefined' ? window.location.pathname : '/').blogSlug
  );

  const applyNavState = (state: { publicPage: PublicPage; contactExtra: ContactExtra | null; blogSlug?: string | null }) => {
    setContactExtra(state.contactExtra);
    setBlogSlug(state.blogSlug || null);
    setPublicPage(state.publicPage);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  React.useEffect(() => {
    const handlePopState = () => {
      const state = parsePublicLocation(window.location.pathname);
      applyNavState(state);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Routes Ambassadeurs / Affiliés (Accessibles à tous) ──
  const pathname = window.location.pathname.replace(/\/$/, '');
  if (pathname === '/ambassadeur') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AffiliateLogin />
      </Suspense>
    );
  }
  if (pathname === '/ambassadeur/dashboard') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AffiliateDashboard />
      </Suspense>
    );
  }
  if (pathname === '/ambassadeur/kit') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AmbassadorKitPage />
      </Suspense>
    );
  }

  // ── Routes Blog (Publiques et consultables par tous, y compris utilisateurs authentifiés) ──
  if (publicPage === 'blog') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Blog
          onBack={() => {
            window.history.pushState({}, '', '/');
            applyNavState(handleBackToLanding());
          }}
          onHome={() => {
            window.history.pushState({}, '', '/');
            applyNavState(handleBackToLanding());
          }}
          onNavigate={(page) => {
            if (page === 'landing') {
              window.history.pushState({}, '', '/');
              applyNavState(handleBackToLanding());
            } else {
              window.history.pushState({}, '', `/${page}`);
              applyNavState(handlePublicNavigate(page as any));
            }
          }}
          onSelectPost={(slug) => {
            window.history.pushState({}, '', `/blog/${slug}`);
            applyNavState(handleBlogNavigate(slug));
          }}
        />
      </Suspense>
    );
  }
  if (publicPage === 'blog-post') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <BlogPost
          slug={blogSlug || ''}
          onBack={() => {
            window.history.pushState({}, '', '/blog');
            applyNavState(handleBlogNavigate());
          }}
          onHome={() => {
            window.history.pushState({}, '', '/');
            applyNavState(handleBackToLanding());
          }}
          onNavigate={(page) => {
            if (page === 'landing') {
              window.history.pushState({}, '', '/');
              applyNavState(handleBackToLanding());
            } else if (page === 'blog') {
              window.history.pushState({}, '', '/blog');
              applyNavState(handleBlogNavigate());
            } else {
              window.history.pushState({}, '', `/${page}`);
              applyNavState(handlePublicNavigate(page as any));
            }
          }}
        />
      </Suspense>
    );
  }

  if (publicPage === 'partners') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Partners
          onBack={() => {
            window.history.pushState({}, '', '/');
            applyNavState(handleBackToLanding());
          }}
          onHome={() => {
            window.history.pushState({}, '', '/');
            applyNavState(handleBackToLanding());
          }}
          onNavigate={(page) => {
            if (page === 'landing') {
              window.history.pushState({}, '', '/');
              applyNavState(handleBackToLanding());
            } else if (page === 'blog') {
              window.history.pushState({}, '', '/blog');
              applyNavState(handleBlogNavigate());
            } else if (page === 'partners') {
              window.history.pushState({}, '', '/partenaires');
              applyNavState(handlePublicNavigate('partners'));
            } else {
              window.history.pushState({}, '', `/${page}`);
              applyNavState(handlePublicNavigate(page as any));
            }
          }}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    if (publicPage === 'login') {
      return <Login onBackToLanding={() => applyNavState(handleBackToLanding())} />;
    }
    if (publicPage === 'register') {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <Register
              onBack={() => applyNavState(handleBackToLanding())}
              onSuccess={() => window.location.reload()}
            />
          </div>
        </div>
      );
    }
    if (publicPage === 'guide') {
      return (
        <UserGuide
          onBack={() => applyNavState(handleBackToLanding())}
          onRegister={() => applyNavState(handleRegisterSchool())}
        />
      );
    }
    if (publicPage === 'about') {
      return <About onBack={() => applyNavState(handleBackToLanding())} />;
    }
    if (publicPage === 'contact') {
      return (
        <Contact
          initialSubject={contactExtra?.subject}
          initialMessage={contactExtra?.message}
          onBack={() => applyNavState(handleBackToLanding())}
        />
      );
    }
    if (publicPage === 'careers') {
      return <Careers onBack={() => applyNavState(handleBackToLanding())} />;
    }
    if (['cgu', 'privacy', 'legal'].includes(publicPage)) {
      return <LegalPage type={publicPage as LegalPageType} onBack={() => applyNavState(handleBackToLanding())} />;
    }
    return (
      <>
        <LandingPage
          onLogin={() => applyNavState(handleLoginNavigate())}
          onRegisterSchool={() => applyNavState(handleRegisterSchool())}
          onNavigate={(page, extra) => {
            if (page === 'blog') {
              window.history.pushState({}, '', '/blog');
              applyNavState(handleBlogNavigate());
            } else if (page === 'partners') {
              window.history.pushState({}, '', '/partenaires');
              applyNavState(handlePublicNavigate('partners', extra));
            } else {
              applyNavState(handlePublicNavigate(page, extra));
            }
          }}
        />
        <GuideAssistantWidget
          onOpenRegisterSchool={() => applyNavState(handleRegisterSchool())}
          onOpenRegisterParent={() => applyNavState(handleLoginNavigate())}
          onOpenLogin={() => applyNavState(handleLoginNavigate())}
        />
      </>
    );
  }

  return (
    <Layout key={language}>
      <Suspense fallback={<LoadingSpinner />}>
        <PageContent />
      </Suspense>
      <AnnouncementPopup />
    </Layout>
  );
}
