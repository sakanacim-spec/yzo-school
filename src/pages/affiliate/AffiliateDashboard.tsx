import React, { useEffect, useState } from 'react';
import { GraduationCap, LogOut, Copy, Check, Link, TrendingUp, Users, Wallet, CreditCard, Clock, CheckCircle, Search } from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface DashboardData {
  affiliate: {
    nom: string;
    telephone: string;
    referral_code: string;
    commission_rate: number;
    wallet_balance: number;
    total_earned: number;
    country: string;
    photo_url?: string;
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
  const [searchQuery, setSearchQuery] = useState('');

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
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-800">Chargement...</div>;
  }

  if (!data) return null;

  const filteredSchools = data.schools.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-medium">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-black text-2xl leading-tight text-[#0f172a] tracking-tight">yziow</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Partners</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 hidden sm:flex">
            {data.affiliate.photo_url ? (
              <img src={data.affiliate.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-orange-100" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                <Users className="w-5 h-5 text-slate-400" />
              </div>
            )}
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">{data.affiliate.nom}</p>
              <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                <span className="text-[10px]">🌍</span> {data.affiliate.country}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors" title="Déconnexion">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {/* En-tête et Lien */}
        <div className="bg-white border border-orange-200 rounded-3xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl shadow-orange-500/5">
          <div className="space-y-4">
            <h2 className="text-3xl font-black text-slate-900">
              Bienvenue, <span className="text-[#f97316]">{data.affiliate.nom.split(' ')[0]}</span> ! 👋
            </h2>
            <p className="text-slate-600 max-w-xl">
              Votre taux de commission actuel est de <strong className="text-slate-900">{data.affiliate.commission_rate}%</strong> à vie sur tous les abonnements SaaS des écoles que vous apportez.
            </p>
          </div>
          
          <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 w-full md:w-auto">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Link className="w-4 h-4" /> Votre lien unique d'inscription
            </p>
            <div className="flex items-center gap-2 bg-white rounded-xl p-1 pl-4 border border-slate-200 shadow-sm">
              <span className="text-slate-700 font-mono text-sm truncate font-medium">
                {`${window.location.origin}/?ref=${data.affiliate.referral_code}`}
              </span>
              <button 
                onClick={copyToClipboard}
                className="bg-[#f97316] hover:bg-[#ea580c] text-white p-2.5 rounded-lg flex items-center gap-2 transition-colors ml-2 shadow-md shadow-orange-500/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="text-sm font-bold hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">Partagez ce lien aux directeurs d'écoles.</p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-emerald-600"><Wallet className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-500 text-sm font-bold mb-1 uppercase tracking-wider">Solde Disponible</p>
              <h3 className="text-4xl font-black text-emerald-500">{Number(data.affiliate.wallet_balance).toLocaleString('fr-FR')} <span className="text-xl text-slate-400">FCFA</span></h3>
              <div className="mt-4 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  <strong className="text-emerald-700">Règle de paiement :</strong> Le solde est retirable à partir de <strong>20 000 FCFA</strong>. Les paiements s'effectuent le <strong>5 de chaque mois</strong>.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-3xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-blue-600"><Users className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-500 text-sm font-bold mb-1 uppercase tracking-wider">Écoles Parrainées</p>
              <h3 className="text-4xl font-black text-blue-500">{data.schools.length} <span className="text-xl font-medium text-slate-400">écoles</span></h3>
              <p className="text-xs text-slate-500 mt-4">Qui génèrent des commissions récurrentes.</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] text-[#f97316]"><TrendingUp className="w-24 h-24" /></div>
            <div className="relative z-10">
              <p className="text-slate-500 text-sm font-bold mb-1 uppercase tracking-wider">Total Gagné</p>
              <h3 className="text-4xl font-black text-[#f97316]">{Number(data.affiliate.total_earned).toLocaleString('fr-FR')} <span className="text-xl text-slate-400">FCFA</span></h3>
              <p className="text-xs text-slate-500 mt-4">Depuis votre inscription au programme.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Liste des écoles */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> Vos Écoles
              </h3>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Rechercher une école..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-800"
                />
              </div>
            </div>
            
            {filteredSchools.length === 0 ? (
              <div className="text-center py-12 px-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
                {data.schools.length === 0 ? (
                  <>
                    <h4 className="text-slate-700 font-bold mb-2">Aucune école parrainée</h4>
                    <p className="text-slate-500 text-sm font-medium">Partagez votre lien de parrainage pour recruter votre première école !</p>
                  </>
                ) : (
                  <>
                    <h4 className="text-slate-700 font-bold mb-2">Aucun résultat</h4>
                    <p className="text-slate-500 text-sm font-medium">Aucune école ne correspond à "{searchQuery}"</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSchools.map(school => (
                  <div key={school.id} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100">
                    <div>
                      <p className="font-bold text-slate-800">{school.name}</p>
                      <p className="text-xs text-slate-500 font-medium">Inscrite le {new Date(school.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${
                        school.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        school.status === 'trial' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
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
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-500" /> Historique & Gains
            </h3>

            {data.transactions.length === 0 ? (
              <div className="text-center py-12 px-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <p className="text-slate-500 text-sm font-medium">Aucune transaction pour le moment.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.transactions.map(tx => (
                  <div key={tx.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className={`mt-1 shrink-0 p-2 rounded-full ${tx.type === 'commission' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {tx.type === 'commission' ? <CheckCircle className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                         <p className="font-bold text-slate-800 text-sm">{tx.description || (tx.type === 'commission' ? 'Commission reçue' : 'Retrait effectué')}</p>
                        <p className={`font-black shrink-0 ml-4 ${tx.type === 'commission' ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {tx.type === 'commission' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR')} <span className="text-xs text-slate-500">FCFA</span>
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
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
