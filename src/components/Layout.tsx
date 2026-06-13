import React, { useState, useEffect } from 'react';
import { parseResponse, getAuthHeaders } from '../services/apiHelpers';
import { useStore } from '../store/useStore';
import { AppPage } from '../types';
import { getFilteredNavItems, isAdminRole } from '../utils/rolePermissions';
import {
  GraduationCap, LayoutDashboard, Users, CreditCard,
  BarChart3, FileText, Settings, LogOut, Menu, X,
  Bell, ChevronRight, ChevronLeft, Target, Award, MessageSquare,
  ScanLine, IdCard, ShieldCheck, Activity, Database, Megaphone,
  BookOpen, Edit3, FileSpreadsheet, Sun, Moon, Clock,
  PanelLeftClose, PanelLeftOpen, RefreshCw, Command, Shield
} from 'lucide-react';

import { SupportModal } from './SupportModal';
import { chatApi } from '../services/chatApi';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

interface NavItem { id: AppPage; label: string; icon: React.ReactNode; badge?: number }

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { id: 'dashboard',            label: 'Tableau de bord',   icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: 'eleves',               label: 'Élèves',            icon: <Users className="w-[18px] h-[18px]" /> },
  { id: 'parents_list',         label: 'Parents',           icon: <Users className="w-[18px] h-[18px]" /> },
  { id: 'paiements',            label: 'Paiements',         icon: <CreditCard className="w-[18px] h-[18px]" /> },
  { id: 'recouvrement',         label: 'Recouvrement',      icon: <Target className="w-[18px] h-[18px]" /> },
  { id: 'scan_presence',        label: 'Scan Présence',     icon: <ScanLine className="w-[18px] h-[18px]" /> },
  { id: 'scan_sortie',          label: 'Scan Sortie',       icon: <ScanLine className="w-[18px] h-[18px]" /> },
  { id: 'scan_information',     label: 'Scan Information',  icon: <ScanLine className="w-[18px] h-[18px]" /> },
  { id: 'carte_scolaire',       label: 'Cartes Scolaires',  icon: <IdCard className="w-[18px] h-[18px]" /> },
  { id: 'gestion_academique',   label: 'Académique',        icon: <BookOpen className="w-[18px] h-[18px]" /> },
  { id: 'saisie_notes',         label: 'Saisie Notes',      icon: <Edit3 className="w-[18px] h-[18px]" /> },
  { id: 'bulletins',            label: 'Bulletins',         icon: <FileSpreadsheet className="w-[18px] h-[18px]" /> },
  { id: 'verification_recu',    label: 'Vérif. Reçus',      icon: <ShieldCheck className="w-[18px] h-[18px]" /> },
  { id: 'analyses',             label: 'Analyses',          icon: <BarChart3 className="w-[18px] h-[18px]" /> },
  { id: 'documents',            label: 'Documents',         icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: 'historique_activites', label: 'Historique',        icon: <Activity className="w-[18px] h-[18px]" /> },
  { id: 'chat',                 label: 'Messagerie',        icon: <MessageSquare className="w-[18px] h-[18px]" /> },
  { id: 'annonces',             label: 'Annonces',          icon: <Megaphone className="w-[18px] h-[18px]" /> },
  { id: 'gestion_personnel',    label: 'Personnel',         icon: <Users className="w-[18px] h-[18px]" /> },
  { id: 'import_export',        label: 'Base de données',   icon: <Database className="w-[18px] h-[18px]" /> },
  { id: 'parametres',           label: 'Paramètres',        icon: <Settings className="w-[18px] h-[18px]" /> },
];

const PARENT_NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { id: 'parent_dashboard',  label: 'Mon Tableau de bord', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: 'parent_historique', label: 'Paiements',           icon: <CreditCard className="w-[18px] h-[18px]" /> },
  { id: 'parent_recus',      label: 'Mes reçus',           icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: 'parent_badges',     label: 'Mes badges',          icon: <Award className="w-[18px] h-[18px]" /> },
  { id: 'chat',              label: 'Messagerie',          icon: <MessageSquare className="w-[18px] h-[18px]" /> },
  { id: 'annonces',          label: 'Annonces',            icon: <Megaphone className="w-[18px] h-[18px]" /> },
];

const NAV_GROUPS: Record<string, string> = {
  dashboard: 'Principal',
  eleves: 'Gestion',
  parents_list: 'Gestion',
  paiements: 'Finance',
  recouvrement: 'Finance',
  scan_presence: 'Présences',
  scan_sortie: 'Présences',
  scan_information: 'Présences',
  carte_scolaire: 'Présences',
  gestion_academique: 'Académique',
  saisie_notes: 'Académique',
  bulletins: 'Académique',
  verification_recu: 'Outils',
  analyses: 'Outils',
  documents: 'Outils',
  historique_activites: 'Outils',
  chat: 'Communication',
  annonces: 'Communication',
  gestion_personnel: 'Administration',
  import_export: 'Administration',
  parametres: 'Administration',
};

// ── Real-time clock ──
const RealTimeClock: React.FC = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const lomeTime = time.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Lome', hour: '2-digit', minute: '2-digit' });
  const lomeDate = time.toLocaleDateString('fr-FR', { timeZone: 'Africa/Lome', weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="hidden md:flex flex-col items-end gap-0 mr-4">
      <div className="flex items-center gap-1.5 text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">
        {lomeTime}
      </div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{lomeDate} — GMT</p>
    </div>
  );
};

// ── Sidebar Nav ──
const SidebarNav: React.FC<{
  navItems: NavItem[];
  currentPage: AppPage;
  setCurrentPage: (p: AppPage) => void;
  setSidebarOpen: (v: boolean) => void;
  collapsed: boolean;
  onOpenSupport: () => void;
}> = ({ navItems, currentPage, setCurrentPage, setSidebarOpen, collapsed, onOpenSupport }) => {
  let lastGroup = '';
  return (
    <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1 custom-scrollbar">
      {navItems.map((item) => {
        const active = currentPage === item.id;
        const group = NAV_GROUPS[item.id] || '';
        const showGroupLabel = !collapsed && group && group !== lastGroup;
        if (group && group !== lastGroup) lastGroup = group;

        return (
          <React.Fragment key={item.id}>
            {showGroupLabel && (
              <div className="mt-6 mb-2 ml-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500/50">
                {group}
              </div>
            )}
            <button
              onClick={() => { setCurrentPage(item.id); setSidebarOpen(false); }}
              className={`group relative flex items-center w-full rounded-[20px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]
                ${collapsed ? 'justify-center p-3 h-12' : 'px-4 py-3.5'}
                ${active ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
              title={item.label}
            >
              {/* Active indicator bar */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-amber-500 rounded-r-full shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
              )}
              
              <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'} ${!collapsed && 'mr-3'}`}>
                {item.icon}
              </div>
              
              {!collapsed && (
                <span className={`flex-1 text-left text-[13px] tracking-wide transition-all duration-300 ${active ? 'font-bold' : 'font-semibold'}`}>
                  {item.label}
                </span>
              )}
              
              {!collapsed && item.badge != null && item.badge > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black shadow-[0_0_10px_rgba(243,24,38,0.4)]">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
              
              {collapsed && item.badge != null && item.badge > 0 && (
                <span className="absolute top-2 right-2 w-3.5 h-3.5 bg-rose-500 rounded-full flex items-center justify-center text-white text-[8px] font-black shadow-[0_0_10px_rgba(243,24,38,0.4)]">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}

      {/* Support Section for Parents */}
      {navItems.some(i => i.id.startsWith('parent_')) && (
        <div className="mt-8 pt-4 border-t border-white/5">
          {!collapsed && <div className="mb-2 ml-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/50">Assistance</div>}
          <button
            onClick={onOpenSupport}
            className={`group flex items-center w-full rounded-[20px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]
              bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500 border border-emerald-500/10 hover:border-emerald-500/20
              ${collapsed ? 'justify-center p-3 h-12' : 'px-4 py-3.5'}`}
          >
            <div className={`transition-transform duration-300 group-hover:scale-110 ${!collapsed && 'mr-3'}`}>
              <MessageSquare className="w-[18px] h-[18px]" />
            </div>
            {!collapsed && <span className="text-[13px] font-bold tracking-wide">Contacter l'école</span>}
          </button>
        </div>
      )}
    </nav>
  );
};

// ── Full Sidebar Content ──
const SidebarContent: React.FC<{
  currentPage: AppPage;
  setCurrentPage: (p: AppPage) => void;
  setSidebarOpen: (v: boolean) => void;
  navItems: NavItem[];
  schoolName: string;
  appName: string;
  schoolLogo: string | null;
  userName: string;
  userRole: string;
  connectedParentsCount: number;
  logout: () => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onOpenSupport: () => void;
  onOpenPrivacy: () => void;
}> = ({ currentPage, setCurrentPage, setSidebarOpen, navItems, schoolName, appName, schoolLogo, userName, userRole, connectedParentsCount, logout, collapsed, onToggleCollapse, onOpenSupport, onOpenPrivacy }) => (
  <div className="flex flex-col h-full bg-slate-950/95 backdrop-blur-3xl overflow-hidden rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
    
    {/* Brand header */}
    <div className={`flex items-center ${collapsed ? 'justify-center' : 'px-6'} py-6 relative border-b border-white/5`}>
      <div className="w-12 h-12 rounded-[20px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.3)] relative overflow-hidden group">
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" />
        {schoolLogo ? (
          <img src={schoolLogo} alt="" className="w-full h-full object-cover rounded-[20px]" />
        ) : (
          <GraduationCap className="w-5 h-5 text-white relative z-10" />
        )}
      </div>

      {!collapsed && (
        <div className="ml-4 flex-1 min-w-0">
          <p className="text-[15px] font-black text-white tracking-tight truncate">
            {appName}
          </p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">
            {schoolName}
          </p>
        </div>
      )}
    </div>

    {/* Navigation */}
    <SidebarNav
      navItems={navItems}
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      setSidebarOpen={setSidebarOpen}
      collapsed={collapsed}
      onOpenSupport={onOpenSupport}
    />

    {/* Live parents count */}
    {isAdminRole(userRole) && !collapsed && (
      <div className="px-4 py-3">
        <button
          onClick={() => { setCurrentPage('parents_list'); setSidebarOpen(false); }}
          className="w-full flex items-center justify-between p-3.5 rounded-[20px] bg-emerald-500/10 hover:bg-emerald-500/20 transition-all duration-300 group active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
            <span className="text-[12px] font-bold text-emerald-500">
              {connectedParentsCount} parent{connectedParentsCount !== 1 ? 's' : ''}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-emerald-500/50 group-hover:text-emerald-500 transition-colors" />
        </button>
      </div>
    )}

    {/* User footer */}
    <div className="p-4 border-t border-white/5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3 py-2'} mb-2`}>
        <div className="w-10 h-10 rounded-[16px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 text-black font-black text-xs shadow-lg">
          {userName.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">{userName}</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">{userRole}</p>
          </div>
        )}
      </div>

      <button
        onClick={onOpenPrivacy}
        className={`group w-full flex items-center ${collapsed ? 'justify-center p-3' : 'px-4 py-3.5'} gap-3 rounded-[20px] text-slate-400 hover:bg-white/5 hover:text-amber-500 transition-all duration-300 active:scale-[0.98] mb-1`}
        title="Confidentialité"
      >
        <Shield className="w-[18px] h-[18px] group-hover:scale-110 transition-transform duration-300 text-amber-500" />
        {!collapsed && <span className="text-[13px] font-bold tracking-wide">Confidentialité</span>}
      </button>

      <button
        onClick={logout}
        className={`group w-full flex items-center ${collapsed ? 'justify-center p-3' : 'px-4 py-3.5'} gap-3 rounded-[20px] text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all duration-300 active:scale-[0.98]`}
        title="Déconnexion"
      >
        <LogOut className="w-[18px] h-[18px] group-hover:scale-110 transition-transform duration-300" />
        {!collapsed && <span className="text-[13px] font-bold tracking-wide">Déconnexion</span>}
      </button>
    </div>
  </div>
);

// ── SIDEBAR WIDTH CONSTANTS ──
const SIDEBAR_EXPANDED = 280;
const SIDEBAR_COLLAPSED = 88;
const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

// ── LAYOUT PRINCIPAL ──────────────────────────────────────────
export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentPage = useStore((s) => s.currentPage);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const schoolName = useStore((s) => s.schoolName);
  const schoolYear = useStore((s) => s.schoolYear);
  const students = useStore((s) => s.students);
  const appName = useStore((s) => s.appName);
  const schoolLogo = useStore((s) => s.schoolLogo);
  const parents = useStore((s) => s.parents);
  const connectedParentsCount = useStore((s) => s.connectedParentsCount);
  const setConnectedParentsCount = useStore((s) => s.setConnectedParentsCount);
  const unreadMessages = useStore((s) => s.unreadMessages);
  const fetchUnreadMessages = useStore((s) => s.fetchUnreadMessages);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const handleStartChat = async (role: 'administration' | 'comptabilite') => {
    try {
      await chatApi.initiateConversation(undefined, role);
      setCurrentPage('chat');
    } catch (err) {} finally { setShowSupportModal(false); }
  };

  useEffect(() => {
    if (user?.role !== 'parent') {
      const fetchCount = async () => {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch('/api/parent/active-count', { signal: ctrl.signal, headers: getAuthHeaders() }).finally(() => clearTimeout(tid));
          if (res.ok) { const d = await parseResponse(res); setConnectedParentsCount(d.count || 0); }
        } catch {}
      };
      fetchCount();
      const iv = setInterval(fetchCount, 30000);
      return () => clearInterval(iv);
    }
  }, [user?.role, setConnectedParentsCount]);

  useEffect(() => {
    if (user?.role === 'parent') {
      fetchUnreadMessages();
      const iv = setInterval(fetchUnreadMessages, 30000);
      return () => clearInterval(iv);
    }
  }, [user?.role, fetchUnreadMessages]);

  const isSyncing = useStore((s) => s.isSyncing);
  const nonSoldes = students.filter((s) => s.status !== 'Soldé').length;
  const isParent = user?.role === 'parent';
  const baseNavItems = isParent ? PARENT_NAV_ITEMS : NAV_ITEMS;
  const filteredItems = getFilteredNavItems(user?.role, baseNavItems) as Omit<NavItem, 'badge'>[];

  const navItems: NavItem[] = filteredItems.map((item) => ({
    ...item,
    badge: item.id === 'eleves' && nonSoldes > 0 ? nonSoldes
         : item.id === 'chat' && unreadMessages > 0 ? unreadMessages
         : undefined,
  }));

  const currentLabel = [...NAV_ITEMS, ...PARENT_NAV_ITEMS].find((n) => n.id === currentPage)?.label ?? '';
  const sidebarW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  const sidebarProps = {
    currentPage, setCurrentPage, setSidebarOpen, navItems,
    schoolName, appName, schoolLogo,
    userName: user?.nom ?? '', userRole: user?.role ?? '',
    connectedParentsCount, logout, collapsed,
    onOpenSupport: () => setShowSupportModal(true),
    onOpenPrivacy: () => setShowPrivacyModal(true),
  };

  const bottomNavItems = (user?.role === 'superviseur' || user?.role === 'surveillant') ? [
    { id: 'scan_presence' as AppPage, label: 'Entrée', icon: <ScanLine className="w-5 h-5" /> },
    { id: 'scan_sortie'   as AppPage, label: 'Sortie', icon: <ScanLine className="w-5 h-5" /> },
    { id: 'scan_information' as AppPage, label: 'Info', icon: <ScanLine className="w-5 h-5" /> },
    { id: 'carte_scolaire'as AppPage, label: 'Cartes', icon: <IdCard className="w-5 h-5" /> },
  ] : [
    { id: (isParent ? 'parent_dashboard' : 'dashboard') as AppPage, label: 'Accueil', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: (isParent ? 'parent_historique' : 'eleves') as AppPage, label: isParent ? 'Paiements' : 'Élèves', icon: isParent ? <CreditCard className="w-5 h-5" /> : <Users className="w-5 h-5" /> },
    { id: 'chat' as AppPage, label: 'Chat', icon: <MessageSquare className="w-5 h-5" />, badge: unreadMessages },
    { id: (isParent ? 'annonces' : 'parametres') as AppPage, label: isParent ? 'Annonces' : 'Config', icon: isParent ? <Megaphone className="w-5 h-5" /> : <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className={`min-h-screen flex ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
      
      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden lg:block fixed top-0 left-0 bottom-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] p-4"
        style={{ width: sidebarW }}
      >
        <SidebarContent {...sidebarProps} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fadeIn" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] p-4 animate-slideRight">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute -right-12 top-6 w-10 h-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white"
            >
              <X size={20} />
            </button>
            <SidebarContent {...sidebarProps} collapsed={false} />
          </aside>
        </div>
      )}

      {/* ── Main Content Container ── */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ paddingLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 ? sidebarW : 0 }}
      >
        <div className="flex-1 flex flex-col min-w-0 p-2 lg:p-4 pb-24 lg:pb-4">
          
          {/* ── Premium Topbar ── */}
          <header className="sticky top-2 lg:top-4 z-40 mb-6 px-4 lg:px-6 h-[72px] flex items-center justify-between gap-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-[40px] border border-white/50 dark:border-slate-800/50 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden w-10 h-10 rounded-[16px] bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.95]"
              >
                <Menu size={18} />
              </button>

              <button
                onClick={toggleCollapse}
                className="hidden lg:flex w-10 h-10 rounded-[16px] bg-white dark:bg-slate-800 items-center justify-center text-slate-500 hover:text-amber-500 hover:shadow-[0_2px_15px_rgba(245,158,11,0.15)] transition-all duration-300 shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.95]"
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>

              <div className="hidden sm:block">
                <h1 className="text-[18px] font-black tracking-tight text-slate-900 dark:text-white">
                  {currentLabel}
                </h1>
                {!isParent && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Session {schoolYear}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <RealTimeClock />

              {!isParent && (
                <button
                  onClick={() => useStore.getState().fetchAllFromBackend(true)}
                  disabled={isSyncing}
                  className="hidden md:flex items-center gap-2 px-5 h-10 bg-white dark:bg-slate-800 rounded-[16px] text-[12px] font-bold text-slate-700 dark:text-slate-300 hover:text-amber-500 shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_15px_rgba(245,158,11,0.15)] transition-all duration-300 active:scale-[0.98]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Synchronisation...' : 'Actualiser'}
                </button>
              )}

              {!isParent && nonSoldes > 0 && (
                <button
                  onClick={() => setCurrentPage('eleves')}
                  className="flex items-center gap-2 px-3 h-10 bg-rose-500/10 rounded-[16px] text-rose-600 hover:bg-rose-500/20 transition-all duration-300 active:scale-[0.98]"
                >
                  <Bell className="w-4 h-4 animate-bounce" />
                  <span className="text-[13px] font-black">{nonSoldes}</span>
                </button>
              )}

              <button
                onClick={toggleTheme}
                className="w-10 h-10 rounded-[16px] bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-amber-500 transition-all duration-300 shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.95]"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </header>

          {/* ── Main Canvas ── */}
          <main className="flex-1 w-full max-w-[1600px] mx-auto animate-slideUp px-2 lg:px-4">
            {children}
          </main>

        </div>
      </div>

      {/* ── Bottom Nav Mobile ── */}
      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${sidebarOpen ? 'translate-y-full' : 'translate-y-0'}`}>
        <div className="flex items-center justify-around h-[72px] px-2">
          {bottomNavItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className="relative flex flex-col items-center justify-center w-full h-full gap-1"
              >
                {active && (
                  <div className="absolute top-0 w-8 h-1 bg-amber-500 rounded-b-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                )}
                <div className={`p-2 rounded-xl transition-all duration-300 ${active ? 'bg-amber-500/10 text-amber-500 scale-110' : 'text-slate-400'}`}>
                  {item.icon}
                  {(item as any).badge != null && (item as any).badge > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-white text-[9px] font-black">
                      {(item as any).badge > 9 ? '9+' : (item as any).badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] tracking-wide ${active ? 'font-black text-amber-500' : 'font-semibold text-slate-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <SupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} onSelect={handleStartChat} />
      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
    </div>
  );
};
