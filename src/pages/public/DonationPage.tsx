import React, { useState, useEffect } from 'react';
import { Heart, ArrowLeft, Loader2, ShieldCheck, Gift } from 'lucide-react';
import { parseResponse } from '../../services/apiHelpers';
import { API_BASE_URL } from '../../config';
import { DonationCampaign } from '../../types';

export function DonationPage() {
  // Parse URL: /d/:schoolSlug/:campaignId
  const pathParts = window.location.pathname.split('/');
  const schoolSlug = pathParts[2];
  const campaignId = pathParts[3];
  const isSuccess = pathParts[4] === 'success';
  
  const [campaign, setCampaign] = useState<DonationCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const data = await fetch(`${API_BASE_URL}/donations/public/campaigns/${schoolSlug}/${campaignId}`).then(parseResponse);
        setCampaign(data);
      } catch (err) {
        console.error('Error fetching campaign:', err);
      }
      setLoading(false);
    };
    fetchCampaign();
  }, [schoolSlug, campaignId]);

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) < 500) {
      alert("Le montant minimum est de 500 FCFA.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await fetch(`${API_BASE_URL}/donations/public/campaigns/${schoolSlug}/${campaignId}/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          donor_name: name,
          donor_email: email,
          donor_phone: phone,
          message,
          is_anonymous: isAnonymous
        })
      }).then(parseResponse);

      if (data.token) {
        // Rediriger vers l'interface FedaPay
        window.location.href = data.token;
      } else {
        alert("Erreur: Lien de paiement non généré.");
      }
    } catch (err) {
      console.error('Donation error:', err);
      alert('Une erreur est survenue lors de l\'initialisation du don.');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Gift className="w-16 h-16 text-slate-300 mb-4" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Campagne introuvable</h1>
        <p className="text-slate-500 mb-6">Cette campagne de dons n'existe pas ou est terminée.</p>
        <a href="/" className="text-indigo-600 font-medium hover:underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
        </a>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <ShieldCheck className="w-20 h-20 text-emerald-500 mb-4" />
        <h1 className="text-3xl font-black text-slate-800 mb-2">Merci pour votre don !</h1>
        <p className="text-slate-600 mb-6 text-center max-w-md">Votre contribution à la campagne "{campaign.title}" a été enregistrée avec succès.</p>
        <a href={`/d/${schoolSlug}/${campaignId}`} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          Retour à la campagne
        </a>
      </div>
    );
  }

  const progress = Math.min(100, Math.round((campaign.current_amount / campaign.goal_amount) * 100));

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          {campaign.image_url ? (
            <div className="w-full h-64 sm:h-80 md:h-96 rounded-3xl overflow-hidden shadow-2xl mb-8 relative">
              <img src={campaign.image_url} alt={campaign.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
            </div>
          ) : (
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
              <Heart className="w-8 h-8 fill-current" />
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900">{campaign.title}</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">{campaign.description}</p>
        </div>

        {/* Progress Card */}
        <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-4xl font-black text-slate-900">{campaign.current_amount.toLocaleString('fr-FR')} <span className="text-xl text-slate-500">FCFA</span></p>
                <p className="text-sm font-medium text-slate-500 mt-1">récoltés sur un objectif de {campaign.goal_amount.toLocaleString('fr-FR')} FCFA</p>
              </div>
              <div className="text-right hidden sm:block">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold">
                  {progress}% financé
                </span>
              </div>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <form onSubmit={handleDonate} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">1. Montant du don</h3>
              <div className="grid grid-cols-3 gap-3">
                {[1000, 5000, 10000].map(val => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => setAmount(val.toString())}
                    className={`py-3 rounded-xl border-2 font-bold transition-all ${amount === val.toString() ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                  >
                    {val.toLocaleString('fr-FR')}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Ou saisissez un autre montant"
                  className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 transition-all text-lg font-bold outline-none"
                  min="500"
                  required
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">FCFA</span>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">2. Vos informations</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={isAnonymous} required={!isAnonymous} className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400" placeholder="Ex: Koffi Mensah" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone (Optionnel)</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none" placeholder="+228 90 00 00 00" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none" placeholder="votre@email.com" />
              </div>
              
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600" />
                <span className="text-sm font-medium text-slate-700">Je souhaite que mon don soit anonyme</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !amount}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-lg transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Heart className="w-6 h-6" />}
              {submitting ? 'Sécurisation...' : `Soutenir avec ${amount ? Number(amount).toLocaleString('fr-FR') : '0'} FCFA`}
            </button>

            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Paiement 100% sécurisé via Mobile Money & Cartes Bancaires
            </div>
          </form>
        </div>
        
        <div className="text-center text-sm font-medium text-slate-400">
          Propulsé par <a href="https://yziow.com" className="text-indigo-500 hover:underline">Yziow</a> - La plateforme des écoles
        </div>
      </div>
    </div>
  );
}
