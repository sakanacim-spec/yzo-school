import React from 'react';
import { KpiDashboard } from '@/components/KpiDashboard';
import { TenantList } from '@/components/TenantList';

export default function Dashboard() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
          Oziow Admin
        </h1>
        <p className="text-muted-foreground text-sm mt-1">SuperAdmin Platform Management</p>
      </header>

      <KpiDashboard />
      
      <div className="my-10 border-t border-white/5"></div>
      
      <TenantList />
    </div>
  );
}
