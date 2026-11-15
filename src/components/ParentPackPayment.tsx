import React, { useState, useEffect } from 'react';
import { parentApi } from '../services/parentApi';
import { t } from '../i18n';
import type { Language } from '../i18n';
import { Zap, Loader2, X } from 'lucide-react';
import { useStore } from '../store/useStore';

interface PricingPlan {
  amount: number;
  currency: string;
  description: string;
  durationMonths?: number;
}

interface ParentPackPricing {
  monthly: PricingPlan;
  annual?: PricingPlan;
}

interface ParentPackPaymentProps {
  studentId: string;
  onClose: () => void;
}

export const ParentPackPayment: React.FC<ParentPackPaymentProps> = ({ studentId, onClose }) => {
  const { language, user } = useStore();
  const schoolSlug = user?.schoolSlug || '';
  const [pricing, setPricing] = useState<ParentPackPricing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual' | null>(null);
  const [initialising, setInitialising] = useState<boolean>(false);

  useEffect(() => {
    const fetchPricing = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await parentApi.getParentPackPricing(schoolSlug, studentId);
        // Normalisation stricte : extraction du tarif mensuel officiel sans valeur par défaut arbitraire
        let normalizedPricing: ParentPackPricing | null = null;
        if ((data as any)?.plans && Array.isArray((data as any).plans)) {
          const monthlyPlan = (data as any).plans.find((p: any) => p.periodicity === 'monthly');
          const annualPlan = (data as any).plans.find((p: any) => p.periodicity === 'annual');
          if (
            monthlyPlan &&
            typeof monthlyPlan.amountMinor === 'number' &&
            monthlyPlan.amountMinor > 0 &&
            typeof monthlyPlan.currency === 'string' &&
            monthlyPlan.currency.trim() !== ''
          ) {
            normalizedPricing = {
              monthly: {
                amount: monthlyPlan.amountMinor,
                currency: monthlyPlan.currency,
                description: 'Accès mensuel officiel (1 mois)'
              },
              annual: (annualPlan && typeof annualPlan.amountMinor === 'number' && annualPlan.amountMinor > 0) ? {
                amount: annualPlan.amountMinor,
                currency: annualPlan.currency || 'XOF',
                description: 'Formule annuelle (10 mois)',
                durationMonths: annualPlan.durationMonths || 10
              } : undefined
            };
          }
        } else if (
          data &&
          typeof data === 'object' &&
          'monthly' in data &&
          typeof (data as any).monthly?.amount === 'number' &&
          (data as any).monthly.amount > 0
        ) {
          normalizedPricing = {
            monthly: {
              amount: (data as any).monthly.amount,
              currency: (data as any).monthly.currency || 'XOF',
              description: (data as any).monthly.description || 'Accès mensuel officiel (1 mois)'
            },
            annual: ((data as any).annual && typeof (data as any).annual.amount === 'number' && (data as any).annual.amount > 0) ? {
              amount: (data as any).annual.amount,
              currency: (data as any).annual.currency || 'XOF',
              description: (data as any).annual.description || 'Formule annuelle (10 mois)',
              durationMonths: (data as any).annual.durationMonths || 10
            } : undefined
          };
        }

        if (!normalizedPricing) {
          setError(
            t(language as Language, 'parentPack.pricingUnavailable') ||
            'Tarif officiel indisponible pour cet élève. Veuillez contacter l\'établissement scolaire.'
          );
          setPricing(null);
        } else {
          setPricing(normalizedPricing);
        }
      } catch (err: any) {
        console.error('Error fetching pricing', err);
        setError(err.error || t(language as Language, 'parentPack.pricingError') || 'Erreur lors de la récupération des tarifs');
        setPricing(null);
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, schoolSlug, language]);

  const handlePay = async (plan: 'monthly' | 'annual') => {
    if (!pricing || !pricing.monthly || typeof pricing.monthly.amount !== 'number' || pricing.monthly.amount <= 0) {
      alert(t(language as Language, 'parentPack.pricingUnavailable') || 'Tarif non disponible pour cet élève.');
      return;
    }
    if (plan === 'annual') {
      alert('Le paiement annuel est temporairement indisponible pour le lancement pilote. Veuillez choisir la formule mensuelle.');
      return;
    }
    setSelectedPlan(plan);
    setInitialising(true);
    try {
      const result = await parentApi.initParentPackPayment(schoolSlug, studentId, plan);
      if (result?.url && typeof result.url === 'string' && result.url.trim() !== '') {
        try {
          const parsedUrl = new URL(result.url);
          if (parsedUrl.protocol === 'https:') {
            sessionStorage.setItem('yziow_parent_pack_pending_student', studentId);
            window.location.assign(parsedUrl.toString());
            return;
          } else {
            alert(t(language as Language, 'parentPack.securityError') || 'Erreur de sécurité (HTTPS requis)');
          }
        } catch (err) {
          alert(t(language as Language, 'parentPack.invalidUrl') || 'Lien de paiement invalide');
        }
      } else {
        alert(t(language as Language, 'parentPack.paymentInitError') || "Impossible d'initialiser le paiement.");
      }
    } catch (err: any) {
      console.error('Payment init error', err);
      alert(err.error || t(language as Language, 'parentPack.paymentError') || 'Erreur lors du paiement');
    }
    setInitialising(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">
            {t(language as Language, 'parentPack.choosePlan') || 'Choisissez votre formule'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-2" />
              <span>{t(language as Language, 'common.loading') || 'Chargement...'}</span>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
          {pricing && (
            <div className="grid gap-4">
              {/* Monthly */}
              <button
                onClick={() => handlePay('monthly')}
                disabled={initialising && selectedPlan === 'monthly'}
                className="w-full flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 transition-colors"
              >
                <div>
                  <h4 className="font-black text-slate-900 dark:text-white">
                    {t(language as Language, 'parentPack.monthly') || 'Mensuel'}
                  </h4>
                  <p className="text-slate-600 dark:text-slate-300 text-sm">{pricing.monthly.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-slate-900 dark:text-white">
                    {pricing.monthly.amount.toLocaleString()} {pricing.monthly.currency}
                  </span>
                  {initialising && selectedPlan === 'monthly' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <Zap className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </button>
              {/* Option Annuelle — Désactivée pendant le lancement pilote */}
              <div
                className="w-full flex items-center justify-between p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/60 dark:bg-slate-800/30 opacity-60 cursor-not-allowed select-none"
                title="Le paiement annuel est temporairement indisponible pour le lancement pilote."
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-500 dark:text-slate-400">
                      {t(language as Language, 'parentPack.annual') || 'Annuel'}
                    </h4>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                      Bientôt disponible
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Indisponible pendant le lancement pilote (formule mensuelle uniquement)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-400 text-sm">
                    {pricing.annual ? `${pricing.annual.amount.toLocaleString()} ${pricing.annual.currency}` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl transition-colors">
            {t(language as Language, 'common.cancel') || 'Annuler'}
          </button>
        </div>
      </div>
    </div>
  );
};
