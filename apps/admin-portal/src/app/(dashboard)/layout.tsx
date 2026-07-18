"use client";

import { useAuth, Button } from "@oziow/ui";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  LayoutDashboard, 
  Users, 
  ShieldAlert, 
  Key, 
  Bot, 
  LogOut 
} from "lucide-react";
import { useState } from "react";
import { AiAssistant } from "@/components/AiAssistant";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading, signOut, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAiOpen, setIsAiOpen] = useState(false);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>;
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  let isImpersonating = false;
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      isImpersonating = !!payload.app_metadata?.impersonation_session_id;
    } catch(e) {}
  }

  const navItems = [
    { name: "Vue d'ensemble", href: "/dashboard", icon: LayoutDashboard },
    { name: "Utilisateurs", href: "/users", icon: Users },
    { name: "Audit Logs", href: "/security", icon: ShieldAlert },
    { name: "Clés API", href: "/api-keys", icon: Key },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background relative overflow-hidden">
      <ImpersonationBanner />
      
      {/* Premium background effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-white/5 glass-panel sm:flex ${isImpersonating ? 'mt-10' : ''}`}>
        <div className="flex h-16 items-center border-b border-white/5 px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="text-xl gradient-text">Oziow Admin</span>
            <span className="text-[10px] uppercase tracking-widest bg-primary/20 text-primary px-2 py-0.5 rounded-full">Pro</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <nav className="grid items-start px-4 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 font-medium ${
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm border border-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'opacity-70'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-white/5">
          <Button variant="outline" className="w-full flex gap-2 justify-start border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex flex-col flex-1 sm:pl-64 z-10 ${user?.app_metadata?.impersonation_session_id ? 'mt-10' : ''}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/5 glass-panel px-4 sm:px-8">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground/90">
              {navItems.find((n) => pathname.includes(n.href))?.name || "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 hidden md:flex px-4 py-1.5 rounded-full bg-white/5 border border-white/5 shadow-inner">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
              <span className="text-sm font-medium text-muted-foreground">
                {user?.email}
              </span>
            </div>
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover-lift rounded-full px-5" onClick={() => setIsAiOpen(true)}>
              <Bot className="h-4 w-4" />
              Assistant IA
            </Button>
          </div>
        </header>
        <main className="flex-1 items-start p-6 sm:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
      
      <AiAssistant isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
    </div>
  );
}
