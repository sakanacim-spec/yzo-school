import React, { useState, useEffect } from 'react';
import { Gift, Plus, TrendingUp, Users, Heart, Share2, Copy, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useLanguage } from '../i18n';
import backendSync from '../services/backendSync';
import { DonationCampaign, Donation } from '../types';

export default function Dons() {
  const { schoolSlug, currentUser, currency } = useStore();
  const { t, language } = useLanguage();
  const [campaigns, setCampaigns] = useState<DonationCampaign[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [copiedLink, setCopiedLink] = useState('');

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
      const resCamp = await backendSync.fetch('/api/donations/campaigns');
      const resDonations = await backendSync.fetch('/api/donations/donations');
      setCampaigns(resCamp || []);
      setDonations(resDonations || []);
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
      const newCampaign = await backendSync.fetch('/api/donations/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          goal_amount: Number(goalAmount),
          image_url: imageUrl
        })
      });
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
    </div>
  );
}
