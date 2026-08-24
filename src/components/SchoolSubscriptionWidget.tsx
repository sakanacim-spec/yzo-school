import React, { useState } from 'react';
import { 
  Building2, Users, CreditCard, Sparkles, CheckCircle2, ShieldCheck, 
  Download, ArrowRight, Wallet, Percent, ChevronRight, Award, FileText,
  AlertCircle, Copy, Check
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getCountryCurrencyInfo, formatSubscriptionCurrencyAmount } from '../data/countries';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { API_BASE_URL } from '../config';
import { initI18nPdfDoc } from '../utils/pdfEngine';
import { getFinancialTranslations } from '../utils/pdfFinancialTranslations';

interface LevelBreakdown {
  maternelle_primaire: number;
  college_secondaire: number;
  superieur_formation: number;
}

interface SubscriptionQuote {
  quote_id?: string;
  calculated_at?: string;
  expires_at?: string;
  totalStudents: number;
  breakdown: LevelBreakdown;
  monthlyAmount: number;
  totalAnnualAmount: number;
  annualBonusAmount: number;
  finalAnnualAmount: number;
  tranches: number[];
  currency: string;
  currency_code?: string;
  currency_symbol?: string;
  currency_minor_unit?: number;
  locale?: string;
  payment_status?: string;
  ratesMonthly?: Record<string, number>;
}

export function formatQuoteCurrencyAmount(
  rawAmount: number,
  quote?: { currency?: string; currency_code?: string; currency_symbol?: string; currency_minor_unit?: number; locale?: string } | null,
  countryCode?: string
): string {
  if (!quote) return formatSubscriptionCurrencyAmount(rawAmount, countryCode);
  const minorUnit = typeof quote.currency_minor_unit === 'number' ? quote.currency_minor_unit : 0;
  const symbol = quote.currency_symbol || 'FCFA';
  const currency = quote.currency_code || quote.currency || 'XOF';
  const locale = quote.locale || 'fr-FR';

  const realAmount = minorUnit > 0 ? rawAmount / Math.pow(10, minorUnit) : rawAmount;

  if (minorUnit === 0) {
    return `${Math.round(realAmount).toLocaleString(locale)} ${symbol}`;
  }

  if (currency === 'EUR' || symbol === '€') {
    return `${realAmount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  }
  if (currency === 'GHS' || symbol === 'GH₵') {
    return `${symbol}${realAmount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${symbol} ${realAmount.toLocaleString(locale, { minimumFractionDigits: minorUnit, maximumFractionDigits: minorUnit })}`;
}

interface PaymentErrorInfo {
  message: string;
  code?: string;
  diagnostic_id?: string;
}

const ALLOWED_FEDAPAY_HOSTS = new Set([
  'sandbox-checkout.fedapay.com',
  'checkout.fedapay.com'
]);

export const SchoolSubscriptionWidget: React.FC = () => {
  const { user, students, classes, schoolName, settings } = useStore();
  const lockedPlan = settings?.subscriptionPlan;
  const dbPaidTranchesCount = settings?.paidTranchesCount || 0;

  const [paymentMode, setPaymentMode] = useState<'annual' | 'tranche'>(lockedPlan || 'annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidTranches, setPaidTranches] = useState<number[]>(
    dbPaidTranchesCount > 0 ? Array.from({length: dbPaidTranchesCount}, (_, i) => i + 1) : []
  );
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastPayment, setLastPayment] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<PaymentErrorInfo | null>(null);
  const [serverQuote, setServerQuote] = useState<SubscriptionQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(true);
  const [quoteError, setQuoteError] = useState<PaymentErrorInfo | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);

  // Mettre à jour si les settings arrivent après le montage
  React.useEffect(() => {
    if (lockedPlan) {
      setPaymentMode(lockedPlan);
    }
    if (dbPaidTranchesCount > 0) {
      setPaidTranches(Array.from({length: dbPaidTranchesCount}, (_, i) => i + 1));
    }
  }, [lockedPlan, dbPaidTranchesCount]);

  const schoolSlug = (user as any)?.schoolSlug || (user as any)?.school_slug || user?.schoolName;

  // Charger le devis autoritaire backend
  const fetchQuote = React.useCallback(() => {
    if (!schoolSlug) {
      setIsLoadingQuote(false);
      return;
    }
    setIsLoadingQuote(true);
    setQuoteError(null);
    setServerQuote(null);
    const token = localStorage.getItem('parent_token');
    fetch(`${API_BASE_URL}/payment/saas/schools/${schoolSlug}/quote`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.quote) {
          setServerQuote(data.quote);
          setQuoteError(null);
        } else {
          setServerQuote(null);
          setQuoteError({
            message: data.error || 'Impossible de calculer le devis d\'abonnement officiel.',
            code: data.code || 'QUOTE_LOAD_FAILED',
            diagnostic_id: data.diagnostic_id
          });
        }
      })
      .catch(() => {
        setServerQuote(null);
        setQuoteError({
          message: 'Impossible de joindre le serveur pour calculer le devis d\'abonnement.',
          code: 'NETWORK_ERROR'
        });
      })
      .finally(() => {
        setIsLoadingQuote(false);
      });
  }, [schoolSlug]);

  React.useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Seul le directeur / admin d'école ou superadmin peut voir cette section
  if (!user || (user.role !== 'directeur' && user.role !== 'admin' && user.role !== 'superadmin')) {
    return null;
  }

  const countryCode = (user as any).country || 'TG';
  const currencyInfo = getCountryCurrencyInfo(countryCode);

  const effectiveBreakdown: LevelBreakdown = {
    maternelle_primaire: Number(serverQuote?.breakdown?.maternelle_primaire) || 0,
    college_secondaire: Number(serverQuote?.breakdown?.college_secondaire) || 0,
    superieur_formation: Number(serverQuote?.breakdown?.superieur_formation) || 0
  };

  const totalStudents = typeof serverQuote?.totalStudents === 'number' ? serverQuote.totalStudents : 0;
  const totalAnnualFcfa = typeof serverQuote?.totalAnnualAmount === 'number' ? serverQuote.totalAnnualAmount : 0;
  const annualBonusFcfa = typeof serverQuote?.annualBonusAmount === 'number' ? serverQuote.annualBonusAmount : 0;
  const finalAnnualFcfa = typeof serverQuote?.finalAnnualAmount === 'number' ? serverQuote.finalAnnualAmount : 0;
  const tranchesFcfa = Array.isArray(serverQuote?.tranches) && serverQuote.tranches.length === 3 ? serverQuote.tranches : [0, 0, 0];

  const ratePrimaire = serverQuote?.ratesMonthly?.maternelle_primaire ?? 100;
  const rateSecondaire = serverQuote?.ratesMonthly?.college_secondaire ?? 150;
  const rateSuperieur = serverQuote?.ratesMonthly?.superieur_formation ?? 200;

  const monthlyPrimaire = effectiveBreakdown.maternelle_primaire * ratePrimaire;
  const monthlySecondaire = effectiveBreakdown.college_secondaire * rateSecondaire;
  const monthlySuperieur = effectiveBreakdown.superieur_formation * rateSuperieur;

  const isPaymentPending = serverQuote?.payment_status === 'configuration_pending';

  const handleSimulatePayment = async (type: 'annual' | 'tranche', trancheNum?: number) => {
    if (isProcessing || isLoadingQuote || !serverQuote || !serverQuote.quote_id || quoteError || isPaymentPending) return;
    if (type === 'annual' && (!finalAnnualFcfa || finalAnnualFcfa <= 0)) return;
    if (type === 'tranche' && (typeof trancheNum !== 'number' || !tranchesFcfa[trancheNum - 1] || tranchesFcfa[trancheNum - 1] <= 0)) return;

    setIsProcessing(true);
    setErrorInfo(null);
    
    try {
      const token = localStorage.getItem('parent_token');
      const targetSlug = (user as any).schoolSlug || (user as any).school_slug || user.schoolName;

      // 1. Initialiser le paiement avec FedaPay via la route de paiement sécurisée (montant serveur autoritaire)
      const res = await fetch(`${API_BASE_URL}/payment/saas/schools/${targetSlug}/pay-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          quote_id: serverQuote?.quote_id,
          planType: type,
          ...(typeof trancheNum === 'number' ? { trancheNumber: trancheNum } : {})
        })
      });

      const data = await res.json();

      if (!res.ok) {
        let msg = data.error || 'Erreur lors de l\'initialisation du paiement.';
        if (data.code === 'QUOTE_STALE') {
          msg = 'Les effectifs ou classes ont été modifiés. Le devis a été actualisé, veuillez réessayer.';
          fetchQuote();
        } else if (data.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED_FOR_COUNTRY') {
          msg = data.error || 'Le paiement électronique sera prochainement disponible dans votre pays.';
        } else if (data.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
          msg = 'La passerelle de paiement en ligne est en cours de maintenance ou non configurée.';
        } else if (data.code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
          msg = 'Le service FedaPay est momentanément indisponible. Veuillez réessayer dans quelques instants.';
        } else if (data.code === 'SUBSCRIPTION_PERIOD_REQUIRED') {
          msg = 'L\'année scolaire de votre établissement doit être renseignée dans les Paramètres avant d\'effectuer un règlement.';
        } else if (data.code === 'SUBSCRIPTION_AMOUNT_INVALID') {
          msg = 'Montant d\'abonnement nul. Veuillez d\'abord enregistrer les élèves de votre établissement.';
        } else if (data.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE') {
          msg = 'Certaines classes d\'élèves ne sont rattachées à aucune catégorie tarifaire valide dans les paramètres de l\'établissement.';
        } else if (data.code === 'PAYMENT_ALREADY_PENDING') {
          msg = 'Une session de paiement est déjà en cours pour votre établissement.';
        } else if (data.code === 'ANNUAL_ALREADY_PAID') {
          msg = data.error || 'L\'abonnement annuel pour cette période est déjà réglé.';
        } else if (data.code === 'TRANCHE_ALREADY_STARTED') {
          msg = data.error || 'Impossible de souscrire un plan annuel après le démarrage d\'un paiement par tranches.';
        } else if (data.code === 'PERIOD_ALREADY_SETTLED') {
          msg = data.error || 'L\'abonnement pour cette période a déjà été intégralement réglé.';
        } else if (data.code === 'TRANCHE_ALREADY_PAID') {
          msg = 'Cette tranche a déjà été réglée.';
        } else if (data.code === 'INVALID_TRANCHE_ORDER') {
          msg = data.error || 'Veuillez régler les tranches dans l\'ordre séquentiel.';
        } else if (data.code === 'RECONCILIATION_REQUIRED') {
          msg = 'Paiement initié mais en attente de synchronisation. Veuillez contacter le support si le problème persiste.';
        }

        setErrorInfo({
          message: msg,
          code: data.code,
          diagnostic_id: data.diagnostic_id
        });
        setIsProcessing(false);
        return;
      }

      // 2. Vérification et redirection stricte HTTPS vers FedaPay (exact Set lookup + credentials check)
      if (data.url && typeof data.url === 'string') {
        try {
          const parsed = new URL(data.url);
          const isHttps = parsed.protocol === 'https:';
          const isAllowedHost = ALLOWED_FEDAPAY_HOSTS.has(parsed.hostname);
          const hasNoCredentials = parsed.username === '' && parsed.password === '';
          if (isHttps && isAllowedHost && hasNoCredentials) {
            window.location.href = data.url;
            return;
          }
        } catch (_urlErr) {}
      }

      setErrorInfo({
        message: 'L\'URL de paiement fournie par le serveur est invalide ou non sécurisée.',
        code: 'PAYMENT_INITIALIZATION_FAILED',
        diagnostic_id: data.diagnostic_id
      });
      setIsProcessing(false);
    } catch (err: any) {
      setErrorInfo({
        message: err.message || 'Impossible de joindre le serveur de paiement.',
        code: 'NETWORK_ERROR'
      });
      setIsProcessing(false);
    }
  };

  const generateYziowReceiptPDF = async (payment: any) => {
    const lang = useStore.getState().language;
    const tFin = getFinancialTranslations(lang);
    const pdfInst = await initI18nPdfDoc({
      language: lang,
      format: 'a4',
      orientation: 'portrait',
      currency: 'XOF',
    });
    const { doc, prepareText, effectiveFont } = pdfInst;
    
    // Header
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont(effectiveFont, 'bold');
    doc.text('YZIOW PLATFORM', 14, 22);
    
    doc.setFontSize(10);
    doc.setFont(effectiveFont, 'normal');
    doc.text(prepareText(tFin.receiptTitle), 14, 30);
    
    doc.text(prepareText(`${tFin.ref}: ${payment.reference}`), 150, 22);
    doc.text(prepareText(`${tFin.date}: ${payment.date}`), 150, 30);

    // Infos Établissement
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont(effectiveFont, 'bold');
    doc.text(prepareText(`${tFin.institution} :`), 14, 52);
    
    doc.setFontSize(10);
    doc.setFont(effectiveFont, 'normal');
    doc.text(prepareText(`École : ${payment.school}`), 14, 60);
    doc.text(prepareText(`Responsable : ${payment.director}`), 14, 66);
    doc.text(prepareText(`Pays : ${payment.country}`), 14, 72);
    doc.text(prepareText(`Effectif sous licence : ${payment.totalStudents} élèves`), 14, 78);

    // Table de détail
    autoTable(doc, {
      startY: 88,
      head: [[prepareText(tFin.description), prepareText('Période'), prepareText(tFin.paymentMethod), prepareText(tFin.amountPaid)]],
      body: [
        [
          prepareText(`Abonnement SaaS Yziow Platform\n(${payment.type})`),
          prepareText('Année Scolaire 2025-2026'),
          prepareText('Règlement d\'Abonnement Établissement'),
          payment.formattedAmount
        ]
      ],
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 6, font: effectiveFont as any }
    });

    // Signature et Cachet
    const finalY = (doc as any).lastAutoTable.finalY + 25;
    doc.setFontSize(10);
    doc.setFont(effectiveFont, 'bold');
    doc.text(prepareText('Pour l\'Administration Yziow Platform'), 14, finalY);
    doc.text(prepareText('Tampon & Certification Digital'), 140, finalY);

    doc.setFontSize(8);
    doc.setFont(effectiveFont, 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(prepareText(`${tFin.generatedOn} certifié par Yziow SaaS Platform — yziow.com`), 14, 280);

    doc.save(`Recu_Abonnement_Yziow_${payment.reference}.pdf`);
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-[32px] p-6 sm:p-8 border border-indigo-500/30 shadow-2xl relative overflow-hidden my-8">
      {/* Motif d'arrière-plan */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Widget */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-400/30 backdrop-blur-md flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-black tracking-wider uppercase border border-blue-500/30">
                Tarification Établissement Privé
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Devise : {serverQuote?.currency_code || serverQuote?.currency || currencyInfo.currency} ({serverQuote?.currency_symbol || currencyInfo.symbol})
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-1 text-white">
              Abonnement & Licence Établissement Yziow
            </h3>
          </div>
        </div>

        {serverQuote && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <div className="text-xs">
              <p className="text-slate-400 font-medium">Effectif total sous licence</p>
              <p className="font-extrabold text-white text-sm">{totalStudents} Élèves enregistrés</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 1. État de Chargement du Devis ── */}
      {isLoadingQuote && (
        <div className="my-8 p-8 rounded-2xl bg-white/5 border border-white/10 text-center flex flex-col items-center justify-center gap-3 relative z-10">
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-300">Calcul du devis officiel en cours…</p>
        </div>
      )}

      {/* ── 2. État d'Erreur du Devis (Aucune carte à zéro) ── */}
      {!isLoadingQuote && (quoteError || !serverQuote) && (
        <div className="my-6 p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 relative z-10 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-base font-bold text-white">{quoteError?.message || 'Impossible de calculer le devis tarifaire.'}</p>
              {quoteError?.diagnostic_id && (
                <p className="text-xs text-rose-400 font-mono">ID Diagnostic : {quoteError.diagnostic_id}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={fetchQuote}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              Réessayer
            </button>
            {(quoteError?.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE' || quoteError?.code === 'SUBSCRIPTION_PERIOD_REQUIRED') && (
              <button
                type="button"
                onClick={() => {
                  const paramsTab = document.querySelector('[data-tab="parametres"]') as HTMLElement;
                  if (paramsTab) paramsTab.click();
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                Ouvrir les Paramètres
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Devis Réussi : Affichage Dynamique (uniquement count > 0) et Paiement ── */}
      {!isLoadingQuote && serverQuote && !quoteError && (
        <>
          {/* Ventilation des Tarifs par Cycle (Seulement les catégories avec count > 0) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6 relative z-10">
            {effectiveBreakdown.maternelle_primaire > 0 && (
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-blue-500/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Maternelle & Primaire</span>
                  <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-black">
                    {formatQuoteCurrencyAmount(ratePrimaire, serverQuote, countryCode)}/mois
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-black text-white">{effectiveBreakdown.maternelle_primaire} <span className="text-xs text-slate-400 font-normal">élèves</span></p>
                    <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
                  </div>
                  <p className="font-extrabold text-blue-400 text-sm">{formatQuoteCurrencyAmount(monthlyPrimaire, serverQuote, countryCode)}/mois</p>
                </div>
              </div>
            )}

            {effectiveBreakdown.college_secondaire > 0 && (
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-purple-500/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Collège & Secondaire</span>
                  <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-xs font-black">
                    {formatQuoteCurrencyAmount(rateSecondaire, serverQuote, countryCode)}/mois
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-black text-white">{effectiveBreakdown.college_secondaire} <span className="text-xs text-slate-400 font-normal">élèves</span></p>
                    <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
                  </div>
                  <p className="font-extrabold text-purple-400 text-sm">{formatQuoteCurrencyAmount(monthlySecondaire, serverQuote, countryCode)}/mois</p>
                </div>
              </div>
            )}

            {effectiveBreakdown.superieur_formation > 0 && (
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-emerald-500/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Université & Supérieur</span>
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-black">
                    {formatQuoteCurrencyAmount(rateSuperieur, serverQuote, countryCode)}/mois
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-black text-white">{effectiveBreakdown.superieur_formation} <span className="text-xs text-slate-400 font-normal">étudiants</span></p>
                    <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
                  </div>
                  <p className="font-extrabold text-emerald-400 text-sm">{formatQuoteCurrencyAmount(monthlySuperieur, serverQuote, countryCode)}/mois</p>
                </div>
              </div>
            )}
          </div>

          {/* Selecteur de Mode de Règlement (Comptant vs Tranches) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative z-10 space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h4 className="font-extrabold text-lg text-white">Choisissez votre mode de règlement</h4>
                <p className="text-xs text-slate-400">Réglez comptant avec remise ou étalez le paiement par tranches</p>
              </div>

              <div className="flex items-center gap-2 p-1.5 bg-black/30 rounded-xl border border-white/10">
                {!lockedPlan ? (
                  <>
                    <button
                      onClick={() => setPaymentMode('annual')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        paymentMode === 'annual'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Comptant Annuel (-10%)
                    </button>
                    <button
                      onClick={() => setPaymentMode('tranche')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        paymentMode === 'tranche'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Par Tranches (3x)
                    </button>
                  </>
                ) : (
                  <span className="px-4 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    Mode de paiement verrouillé : {lockedPlan === 'annual' ? 'Comptant Annuel' : 'Par Tranches'}
                  </span>
                )}
              </div>
            </div>

            {/* Information lorsque le paiement électronique est en cours de configuration */}
            {isPaymentPending && (
              <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-sm font-medium leading-relaxed">
                  Le paiement électronique sera prochainement disponible dans votre pays. Contactez YZIOW pour connaître les modalités bancaires disponibles.
                </p>
              </div>
            )}

            {/* Bannière d'erreur paiement */}
            {errorInfo && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-2 animate-fadeIn">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>{errorInfo.message}</span>
                  </div>
                  {errorInfo.code && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] uppercase shrink-0 border border-rose-500/30">
                      {errorInfo.code}
                    </span>
                  )}
                </div>
                {errorInfo.diagnostic_id && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-rose-500/20 text-[11px] text-slate-300">
                    <span>Réf. diagnostic support : <strong className="font-mono text-white select-all">{errorInfo.diagnostic_id}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        if (errorInfo.diagnostic_id) {
                          navigator.clipboard.writeText(errorInfo.diagnostic_id);
                          setCopiedDiag(true);
                          setTimeout(() => setCopiedDiag(false), 2500);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold text-white transition-colors self-start sm:self-auto"
                    >
                      {copiedDiag ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ID Copié !
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copier Réf. Diagnostic
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

        {/* Option A : Paiement Annuel avec Bonus */}
        {paymentMode === 'annual' ? (
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 p-5 rounded-2xl border border-blue-500/30">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-amber-400/20 text-amber-300 rounded-md text-[11px] font-black uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  Bonus Remise -10% Appliqué
                </span>
                <span className="text-xs text-slate-400 line-through">{formatQuoteCurrencyAmount(totalAnnualFcfa, serverQuote, countryCode)}</span>
              </div>
              <h5 className="text-3xl font-black text-white">{formatQuoteCurrencyAmount(finalAnnualFcfa, serverQuote, countryCode)} <span className="text-xs text-slate-300 font-normal">/ an (10 mois)</span></h5>
              <p className="text-xs text-blue-200 opacity-90">Économie immédiate de {formatQuoteCurrencyAmount(annualBonusFcfa, serverQuote, countryCode)} pour règlement comptant.</p>
            </div>

            {!isPaymentPending && (
              <button
                onClick={() => handleSimulatePayment('annual')}
                disabled={isProcessing || paidTranches.length === 3}
                className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 shrink-0"
              >
                {isProcessing ? (
                  'Initialisation sécurisée du paiement...'
                ) : paidTranches.length === 3 ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-white" />
                    Abonnement Réglé (Comptant)
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Régler l'Abonnement (Comptant)
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          /* Option B : Paiement par Tranches */
          <div className="space-y-4">
            <p className="text-xs text-slate-300 font-medium">3 Tranches réparties sur l'année :</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((tNum) => {
                const isPaid = paidTranches.includes(tNum);
                const currentTrancheAmount = tranchesFcfa[tNum - 1] || 0;
                return (
                  <div
                    key={tNum}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                      isPaid
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase">Tranche N°{tNum}</span>
                        {isPaid && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-md text-[10px] font-black">RÉGLÉ ✅</span>}
                      </div>
                      <p className="text-lg font-black">{formatQuoteCurrencyAmount(currentTrancheAmount, serverQuote, countryCode)}</p>
                    </div>

                    {!isPaymentPending && (
                      <button
                        onClick={() => handleSimulatePayment('tranche', tNum)}
                        disabled={isPaid || isProcessing}
                        className={`mt-4 py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          isPaid
                            ? 'bg-emerald-600/30 text-emerald-300 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                        }`}
                      >
                        {isPaid ? (
                          <>
                            <Download className="w-4 h-4" />
                            Télécharger Reçu
                          </>
                        ) : isProcessing ? (
                          'Initialisation...'
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            Régler Tranche {tNum}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {/* Modal Reçu de Confirmation */}
      {showReceiptModal && lastPayment && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white space-y-5 animate-scaleUp">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-xl font-black">Règlement Confirmé !</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reçu d'abonnement généré et certifié</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl space-y-2 text-xs border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Référence :</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{lastPayment.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Établissement :</span>
                <span className="font-bold">{lastPayment.school}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mode :</span>
                <span className="font-bold">{lastPayment.type}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-black">
                <span>Montant Réglé :</span>
                <span className="text-emerald-600 dark:text-emerald-400">{lastPayment.formattedAmount}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    await generateYziowReceiptPDF(lastPayment);
                  } catch (err) {
                    console.error('Erreur génération reçu abonnement:', err);
                  }
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md"
              >
                <Download className="w-4 h-4" />
                Télécharger Reçu PDF
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="py-3 px-5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
