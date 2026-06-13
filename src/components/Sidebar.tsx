import { 
  LayoutDashboard, 
  Users, 
  FileSpreadsheet, 
  BarChart3, 
  Settings, 
  LogOut,
  School,
  FileText
} from 'lucide-react';
import { useStore } from '../store/useStore';

type Page = 'dashboard' | 'students' | 'import' | 'reports' | 'analytics' | 'settings';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export const Sidebar = ({ currentPage, onNavigate }: SidebarProps) => {
  const { user, logout } = useStore();

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'students', label: 'Gestion Élèves', icon: Users },
    { id: 'import', label: 'Import/Export', icon: FileSpreadsheet },
    { id: 'reports', label: 'Rapports PDF', icon: FileText },
    { id: 'analytics', label: 'Analyses', icon: BarChart3 },
    { id: 'settings', label: 'Paramètres', icon: Settings, adminOnly: true },
  ];

  return (
    <aside className="w-64 bg-white text-slate-900 flex flex-col min-h-screen border-r border-gray-100">
      {/* Logo */}
      <div className="p-6 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
            <School className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-slate-800">SchoolFinance</h1>
            <p className="text-amber-600 font-bold text-[10px] uppercase tracking-widest">Gestion Scolaire</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            if (item.adminOnly && user?.role !== 'admin') return null;
            
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id as Page)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-amber-500 text-white font-semibold shadow-lg shadow-amber-500/20'
                      : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-gray-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold">
            {user?.nom.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm text-slate-800">{user?.nom}</p>
            <p className="text-slate-400 text-xs capitalize font-medium">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-xl transition-colors text-sm font-semibold"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
};
