import React, { useState, useEffect } from 'react';
import { Gift, Plus, TrendingUp, Users, Heart, Share2, Copy, CheckCircle2, Wallet, Smartphone, Building2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { t, Language } from '../i18n';
import { getAuthHeaders, parseResponse } from '../services/apiHelpers';
import { API_BASE_URL } from '../config';
import { DonationCampaign, Donation } from '../types';

export default function Dons() {
  const { user, currency, language } = useStore();
  const schoolSlug = user?.schoolSlug || '';
  const [campaigns, setCampaigns] = useState<DonationCampaign[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [copiedLink, setCopiedLink] = useState('');

  // Withdrawal Form State
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('mobile_money');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [schoolSlug]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resCamp = await fetch(`${API_BASE_URL}/donations/campaigns`, { headers: getAuthHeaders() }).then(parseResponse);
      const resDonations = await fetch(`${API_BASE_URL}/donations/donations`, { headers: getAuthHeaders() }).then(parseResponse);
      const resWithdrawals = await fetch(`${API_BASE_URL}/withdrawals`, { headers: getAuthHeaders() }).then(parseResponse);
      setCampaigns(resCamp || []);
      setDonations(resDonations || []);
      setWithdrawals(resWithdrawals?.withdrawals || []);
    } catch (err) {
      console.error('Error fetching donations data:', err);
    }
    setLoading(false);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !goalAmount) return;
    setIsSubmitting(true);
    try {
      const newCampaign = await fetch(`${API_BASE_URL}/donations/campaigns`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title,
          description,
          goal_amount: Number(goalAmount),
          image_url: imageUrl
        })
      }).then(parseResponse);
      setCampaigns([newCampaign, ...campaigns]);
      setShowForm(false);
      setTitle('');
      setDescription('');
      setGoalAmount('');
      setImageUrl('');
    } catch (err) {
      console.error('Error creating campaign:', err);
      alert('Erreur lors de la création de la campagne');
    }
    setIsSubmitting(false);
  };

  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawAmount || !withdrawMethod || !withdrawDetails) return;
    setIsWithdrawing(true);
    try {
      const newWithdrawal = await fetch(`${API_BASE_URL}/withdrawals`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          paymentMethod: withdrawMethod,
          paymentDetails: withdrawDetails
        })
      }).then(parseResponse);
      
      setWithdrawals([newWithdrawal.withdrawal, ...withdrawals]);
      setShowWithdrawForm(false);
      setWithdrawAmount('');
      setWithdrawDetails('');
      alert('Demande de retrait envoyée avec succès !');
    } catch (err: any) {
      console.error('Error requesting withdrawal:', err);
      alert(err.error || 'Erreur lors de la demande de retrait');
    }
    setIsWithdrawing(false);
  };

  const formatAmount = (amount: number) => {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  };

  const getPublicLink = (campaignId: string) => {
    return `${window.location.origin}/d/${schoolSlug}/${campaignId}`;
  };

  const handleCopyLink = (campaignId: string) => {
    navigator.clipboard.writeText(getPublicLink(campaignId));
    setCopiedLink(campaignId);
    setTimeout(() => setCopiedLink(''), 2000);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Chargement...</div>;
  }

  const totalCollected = campaigns.reduce((sum, c) => sum + (c.current_amount || 0), 0);
  const totalDonors = new Set(donations.filter(d => d.status === 'completed').map(d => d.donor_email || d.donor_name)).size;
  const netCollected = totalCollected * 0.95; // 5% Yziow commission
  const totalWithdrawn = withdrawals.filter(w => w.status === 'pending' || w.status === 'paid').reduce((sum, w) => sum + Number(w.amount), 0);
  const availableBalance = Math.max(0, netCollected - totalWithdrawn);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Gift className="w-6 h-6 text-indigo-500" />
            Levée de Fonds & Dons
          </h2>
          <p className="text-slate-500 text-sm mt-1">Collectez des fonds pour les projets de l'école.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Campagne
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-2xl border border-indigo-500 shadow-lg text-white flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-indigo-100 font-medium text-sm">Solde Disponible</p>
              <p className="text-3xl font-black">{formatAmount(availableBalance)}</p>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-indigo-200 text-xs mb-4">Après déduction des 5% de frais Yziow</p>
          <button 
            onClick={() => setShowWithdrawForm(true)}
            className="w-full py-2 bg-white text-indigo-700 font-bold rounded-xl text-sm hover:bg-indigo-50 transition-colors"
          >
            Demander un retrait
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Récolté</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{formatAmount(totalCollected)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Donateurs Uniques</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{totalDonors}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Campagnes Actives</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{campaigns.filter(c => c.status === 'active').length}</p>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Créer une campagne de dons</h3>
          <form onSubmit={handleCreateCampaign} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Titre du projet (ex: Achat de tables-bancs)</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Objectif Financier ({currency})</label>
              <input type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" required min="1000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description et impact attendu</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" rows={3}></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image du projet (Lien URL optionnel)</label>
              <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://exemple.com/image.jpg" className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700">
                {isSubmitting ? 'Création...' : 'Lancer la campagne'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {showWithdrawForm && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Demander un retrait des fonds</h3>
          <form onSubmit={handleWithdrawalRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Montant à retirer ({currency}) - Max: {formatAmount(availableBalance)}</label>
              <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" required max={availableBalance} min="1000" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div 
                className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col items-center gap-2 ${withdrawMethod === 'mobile_money' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                onClick={() => setWithdrawMethod('mobile_money')}
              >
                <Smartphone className="w-6 h-6" />
                <span className="font-medium text-sm">Mobile Money</span>
              </div>
              <div 
                className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col items-center gap-2 ${withdrawMethod === 'bank' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                onClick={() => setWithdrawMethod('bank')}
              >
                <Building2 className="w-6 h-6" />
                <span className="font-medium text-sm">Virement Bancaire</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {withdrawMethod === 'mobile_money' ? 'Numéro de téléphone (avec indicatif pays)' : 'RIB / IBAN'}
              </label>
              <input type="text" value={withdrawDetails} onChange={e => setWithdrawDetails(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent" required placeholder={withdrawMethod === 'mobile_money' ? 'ex: +229 97000000' : 'ex: BJ061 01001...'} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isWithdrawing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700">
                {isWithdrawing ? 'Envoi en cours...' : 'Envoyer la demande'}
              </button>
              <button type="button" onClick={() => setShowWithdrawForm(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaigns List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {campaigns.map(campaign => {
          const progress = Math.min(100, Math.round((campaign.current_amount / campaign.goal_amount) * 100));
          return (
            <div key={campaign.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">{campaign.title}</h3>
                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${campaign.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                  {campaign.status}
                </span>
              </div>
              <p className="text-slate-500 text-sm mb-6 line-clamp-2">{campaign.description}</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-slate-800 dark:text-white">{formatAmount(campaign.current_amount)}</span>
                  <span className="text-slate-500">Objectif : {formatAmount(campaign.goal_amount)}</span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 text-right">{progress}% atteint</p>
              </div>

              <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <Share2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <input 
                  type="text" 
                  readOnly 
                  value={getPublicLink(campaign.id)}
                  className="bg-transparent text-sm text-indigo-900 dark:text-indigo-300 w-full outline-none"
                />
                <button 
                  onClick={() => handleCopyLink(campaign.id)}
                  className="p-1.5 bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 transition-colors shrink-0"
                  title="Copier le lien"
                >
                  {copiedLink === campaign.id ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && !loading && (
          <div className="col-span-2 text-center p-12 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <Gift className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Aucune campagne de dons pour le moment.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Donations */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-800 dark:text-white">Derniers Dons Reçus</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Donateur</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Montant</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Campagne</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Statut</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {donations.filter(d => d.status === 'completed').map(donation => (
                <tr key={donation.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-4 text-sm font-medium text-slate-800 dark:text-white">
                    {donation.is_anonymous ? 'Donateur Anonyme' : donation.donor_name}
                  </td>
                  <td className="p-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {formatAmount(donation.amount)}
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {campaigns.find(c => c.id === donation.campaign_id)?.title || 'Campagne inconnue'}
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-600">
                      Validé
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(donation.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {donations.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 text-sm">
                    Aucun don validé pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdrawal History */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-800 dark:text-white">Historique des Retraits</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Montant</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Méthode</th>
                <th className="text-left p-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {withdrawals.map(w => (
                <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(w.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm font-bold text-slate-800 dark:text-white">
                    {formatAmount(w.amount)}
                  </td>
                  <td className="p-4 text-sm text-slate-500 capitalize">
                    {w.payment_method.replace('_', ' ')}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${
                      w.status === 'paid' ? 'bg-emerald-100 text-emerald-600' :
                      w.status === 'rejected' ? 'bg-rose-100 text-rose-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {w.status === 'pending' ? 'En attente' : w.status === 'paid' ? 'Payé' : 'Rejeté'}
                    </span>
                  </td>
                </tr>
              ))}
              {withdrawals.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                    Aucune demande de retrait effectuée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
