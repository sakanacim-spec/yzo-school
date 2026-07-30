import React, { useEffect, useState } from 'react';
import { Briefcase, LogOut, Copy, Check, Link, TrendingUp, Users, Wallet, CreditCard, Clock, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface DashboardData {
  affiliate: {
    nom: string;
    telephone: string;
    referral_code: string;
    commission_rate: number;
    wallet_balance: number;
    total_earned: number;
  };
  schools: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
  transactions: Array<{
    id: string;
    type: 'commission' | 'payout';
    amount: number;
    description: string;
    created_at: string;
  }>;
}

export const AffiliateDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('affiliate_token');
    if (!token) {
      window.location.href = '/ambassadeur';
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/affiliate/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) window.location.href = '/ambassadeur';
          throw new Error('Erreur réseau');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('affiliate_token');
    window.location.href = '/ambassadeur';
  };

  const copyToClipboard = () => {
    if (!data) return;
    const link = `${window.location.origin}/?ref=${data.affiliate.referral_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Chargement...</div>;
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Yziow <span className="text-blue-400">Partners</span></h1>
            <p className="text-xs text-slate-400">Espace Ambassadeur</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{data.affiliate.nom}</p>
            <p className="text-xs text-slate-400">{data.affiliate.telephone}</p>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {/* En-tête et Lien */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
          <div className="space-y-4">
            <h2 className="text-3xl font-black">
              Bienvenue, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">{data.affiliate.nom.split(' ')[0]}</span> ! 👋
            </h2>
            <p className="text-slate-400 max-w-xl">
              Votre taux de commission actuel est de <strong className="text-white">{data.affiliate.commission_rate}%</strong> à vie sur tous les abonnements SaaS des écoles que vous apportez.
            </p>
          </div>
          
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-700 w-full md:w-auto">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Link className="w-4 h-4" /> Votre lien unique d'inscription
            </p>
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl p-1 pl-4 border border-slate-800">
              <span className="text-slate-300 font-mono text-sm truncate">
                {`${window.location.origin}/?ref=${data.affiliate.referral_code}`}
              </span>
              <button 
                onClick={copyToClipboard}
                className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-lg flex items-center gap-2 transition-colors ml-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="text-sm font-medium hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">Partagez ce lien aux directeurs d'écoles.</p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Wallet className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-medium mb-1">Solde Disponible</p>
              <h3 className="text-4xl font-black text-emerald-400">{Number(data.affiliate.wallet_balance).toLocaleString('fr-FR')} <span className="text-xl">FCFA</span></h3>
              <p className="text-xs text-slate-500 mt-4">Contactez l'administration pour retirer vos fonds par Mobile Money.</p>
            </div>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Users className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-medium mb-1">Écoles Parrainées</p>
              <h3 className="text-4xl font-black text-blue-400">{data.schools.length} <span className="text-xl font-normal text-slate-500">écoles</span></h3>
              <p className="text-xs text-slate-500 mt-4">Qui génèrent des commissions récurrentes.</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10"><TrendingUp className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-medium mb-1">Total Gagné (Historique)</p>
              <h3 className="text-4xl font-black text-indigo-400">{Number(data.affiliate.total_earned).toLocaleString('fr-FR')} <span className="text-xl">FCFA</span></h3>
              <p className="text-xs text-slate-500 mt-4">Depuis votre inscription au programme.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Liste des écoles */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Vos Écoles
            </h3>
            
            {data.schools.length === 0 ? (
              <div className="text-center py-12 px-4 bg-slate-950 rounded-2xl border border-slate-800 border-dashed">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-slate-500" />
                </div>
                <h4 className="text-slate-300 font-medium mb-2">Aucune école parrainée</h4>
                <p className="text-slate-500 text-sm">Partagez votre lien de parrainage pour recruter votre première école !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.schools.map(school => (
                  <div key={school.id} className="flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700/50">
                    <div>
                      <p className="font-bold text-white">{school.name}</p>
                      <p className="text-xs text-slate-400">Inscrite le {new Date(school.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        school.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        school.status === 'trial' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {school.status === 'active' ? 'Abonnée' : school.status === 'trial' ? 'En Essai' : 'Suspendue'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transactions */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400" /> Historique & Gains
            </h3>

            {data.transactions.length === 0 ? (
              <div className="text-center py-12 px-4 bg-slate-950 rounded-2xl border border-slate-800 border-dashed">
                <p className="text-slate-500 text-sm">Aucune transaction pour le moment.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.transactions.map(tx => (
                  <div key={tx.id} className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className={`mt-1 shrink-0 p-2 rounded-full ${tx.type === 'commission' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {tx.type === 'commission' ? <CheckCircle className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-slate-200 text-sm">{tx.description || (tx.type === 'commission' ? 'Commission reçue' : 'Retrait effectué')}</p>
                        <p className={`font-bold shrink-0 ml-4 ${tx.type === 'commission' ? 'text-emerald-400' : 'text-white'}`}>
                          {tx.type === 'commission' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(tx.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
