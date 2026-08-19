import React, { useState } from 'react';
import { 
  Building2, Users, CreditCard, Sparkles, CheckCircle2, ShieldCheck, 
  Download, ArrowRight, Wallet, Percent, ChevronRight, Award, FileText
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getCountryCurrencyInfo, formatSubscriptionCurrencyAmount } from '../data/countries';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { API_BASE_URL } from '../config';

interface LevelBreakdown {
  maternelle_primaire: number;
  college_secondaire: number;
  superieur_formation: number;
}

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

  // Mettre à jour si les settings arrivent après le montage
  React.useEffect(() => {
    if (lockedPlan) {
      setPaymentMode(lockedPlan);
    }
    if (dbPaidTranchesCount > 0) {
      setPaidTranches(Array.from({length: dbPaidTranchesCount}, (_, i) => i + 1));
    }
  }, [lockedPlan, dbPaidTranchesCount]);

  // Seul le directeur / admin d'école ou superadmin peut voir cette section
  if (!user || (user.role !== 'directeur' && user.role !== 'admin' && user.role !== 'superadmin')) {
    return null;
  }

  const countryCode = (user as any).country || 'TG';
  const currencyInfo = getCountryCurrencyInfo(countryCode);

  // Ventilation dynamique des élèves selon leurs classes/niveaux
  const breakdown: LevelBreakdown = {
    maternelle_primaire: 0,
    college_secondaire: 0,
    superieur_formation: 0
  };

  students.forEach((st) => {
    const className = (st.classe || '').toLowerCase();
    if (className.includes('maternelle') || className.includes('ci') || className.includes('cp') || className.includes('ce1') || className.includes('ce2') || className.includes('cm1') || className.includes('cm2') || className.includes('primaire') || className.includes('sil')) {
      breakdown.maternelle_primaire += 1;
    } else if (className.includes('licence') || className.includes('master') || className.includes('doctorat') || className.includes('univ') || className.includes('fac') || className.includes('bts') || className.includes('centre') || className.includes('institut')) {
      breakdown.superieur_formation += 1;
    } else {
      // Par défaut (6è, 5è, 4è, 3è, 2nde, 1ère, Tle, Collège, Lycée)
      breakdown.college_secondaire += 1;
    }
  });

  // Total élèves (si pas encore d'élèves saisis, simulation avec 50 élèves par défaut)
  const isSimulation = students.length === 0;
  const totalStudents = isSimulation ? 50 : students.length;
  
  const effectiveBreakdown = !isSimulation ? breakdown : {
    maternelle_primaire: Math.round(totalStudents * 0.4),
    college_secondaire: Math.round(totalStudents * 0.4),
    superieur_formation: Math.round(totalStudents * 0.2)
  };

  // Calcul des coûts mensuels (10 mois par an)
  const monthlyPrimaire = effectiveBreakdown.maternelle_primaire * 100;
  const monthlySecondaire = effectiveBreakdown.college_secondaire * 150;
  const monthlySuperieur = effectiveBreakdown.superieur_formation * 200;

  const totalMonthlyFcfa = monthlyPrimaire + monthlySecondaire + monthlySuperieur;
  const totalAnnualFcfa = totalMonthlyFcfa * 10; // 10 mois d'année scolaire

  // Bonus 10% si paiement comptant annuel
  const annualBonusFcfa = Math.round(totalAnnualFcfa * 0.10);
  const finalAnnualFcfa = totalAnnualFcfa - annualBonusFcfa;

  // Montant d'une tranche trimestrielle (3 tranches par an)
  const trancheAmountFcfa = Math.round(totalAnnualFcfa / 3);

  const handleSimulatePayment = async (type: 'annual' | 'tranche', trancheNum?: number) => {
    setIsProcessing(true);
    
    try {
      const amountFcfa = type === 'annual' ? finalAnnualFcfa : trancheAmountFcfa;
      
      const token = localStorage.getItem('parent_token');
      const schoolSlug = (user as any).schoolSlug || (user as any).school_slug || user.schoolName;

      // 1. Initialiser le paiement avec FedaPay via la route de paiement sécurisée
      const res = await fetch(`${API_BASE_URL}/payment/saas/schools/${schoolSlug}/pay-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          planType: type
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'initialisation du paiement');
      }

      // 2. Rediriger l'utilisateur vers la page de paiement FedaPay
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de paiement non reçue.');
      }
    } catch (err: any) {
      alert("Une erreur est survenue : " + err.message);
      setIsProcessing(false);
    }
  };

  const generateYziowReceiptPDF = (payment: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('YZIOW PLATFORM', 14, 22);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('REÇU OFFICIEL DE RÈGLEMENT ABONNEMENT', 14, 30);
    
    doc.text(`Réf: ${payment.reference}`, 150, 22);
    doc.text(`Date: ${payment.date}`, 150, 30);

    // Infos Établissement
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Établissement Bénéficiaire :', 14, 52);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`École : ${payment.school}`, 14, 60);
    doc.text(`Responsable : ${payment.director}`, 14, 66);
    doc.text(`Pays : ${payment.country}`, 14, 72);
    doc.text(`Effectif sous licence : ${payment.totalStudents} élèves`, 14, 78);

    // Table de détail
    autoTable(doc, {
      startY: 88,
      head: [['Désignation du service', 'Période', 'Mode de Règlement', 'Montant Payé']],
      body: [
        [
          `Abonnement SaaS Yziow Platform\n(${payment.type})`,
          'Année Scolaire 2025-2026',
          'Règlement d\'Abonnement Établissement',
          payment.formattedAmount
        ]
      ],
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 6 }
    });

    // Signature et Cachet
    const finalY = (doc as any).lastAutoTable.finalY + 25;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Pour l\'Administration Yziow Platform', 14, finalY);
    doc.text('Tampon & Certification Digital', 140, finalY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Document généré automatiquement et certifié par Yziow SaaS Platform — yziow.com', 14, 280);

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
              <span className="text-xs text-slate-400 font-medium">Devise : {currencyInfo.currency} ({currencyInfo.symbol})</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-1 text-white">
              Abonnement & Licence Établissement Yziow
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl">
          <Building2 className="w-5 h-5 text-indigo-400" />
          <div className="text-xs">
            <p className="text-slate-400 font-medium">Effectif total sous licence</p>
            <p className="font-extrabold text-white text-sm">{totalStudents} Élèves enregistrés</p>
          </div>
        </div>
      </div>

      {/* Ventilation des Tarifs par Cycle */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6 relative z-10">
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Maternelle & Primaire</span>
            <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-black">100 FCFA/mois</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-black text-white">{effectiveBreakdown.maternelle_primaire} <span className="text-xs text-slate-400 font-normal">élèves</span></p>
              <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
            </div>
            <p className="font-extrabold text-blue-400 text-sm">{formatSubscriptionCurrencyAmount(monthlyPrimaire, countryCode)}/mois</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Collège & Secondaire</span>
            <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-xs font-black">150 FCFA/mois</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-black text-white">{effectiveBreakdown.college_secondaire} <span className="text-xs text-slate-400 font-normal">élèves</span></p>
              <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
            </div>
            <p className="font-extrabold text-purple-400 text-sm">{formatSubscriptionCurrencyAmount(monthlySecondaire, countryCode)}/mois</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Université & Supérieur</span>
            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-black">200 FCFA/mois</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-black text-white">{effectiveBreakdown.superieur_formation} <span className="text-xs text-slate-400 font-normal">étudiants</span></p>
              <p className="text-xs text-slate-400 mt-1">Sous-total mensuel</p>
            </div>
            <p className="font-extrabold text-emerald-400 text-sm">{formatSubscriptionCurrencyAmount(monthlySuperieur, countryCode)}/mois</p>
          </div>
        </div>
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

        {/* Option A : Paiement Annuel avec Bonus */}
        {paymentMode === 'annual' ? (
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 p-5 rounded-2xl border border-blue-500/30">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-amber-400/20 text-amber-300 rounded-md text-[11px] font-black uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  Bonus Remise -10% Appliqué
                </span>
                <span className="text-xs text-slate-400 line-through">{formatSubscriptionCurrencyAmount(totalAnnualFcfa, countryCode)}</span>
              </div>
              <h5 className="text-3xl font-black text-white">{formatSubscriptionCurrencyAmount(finalAnnualFcfa, countryCode)} <span className="text-xs text-slate-300 font-normal">/ an (10 mois)</span></h5>
              <p className="text-xs text-blue-200 opacity-90">Économie immédiate de {formatSubscriptionCurrencyAmount(annualBonusFcfa, countryCode)} pour règlement comptant.</p>
            </div>

            <button
              onClick={() => handleSimulatePayment('annual')}
              disabled={isProcessing || paidTranches.length === 3}
              className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 shrink-0"
            >
              {isProcessing ? (
                'Génération du reçu...'
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
          </div>
        ) : (
          /* Option B : Paiement par Tranches */
          <div className="space-y-4">
            <p className="text-xs text-slate-300 font-medium">3 Tranches d'un montant de <span className="font-bold text-blue-300">{formatSubscriptionCurrencyAmount(trancheAmountFcfa, countryCode)}</span> chacune :</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((tNum) => {
                const isPaid = paidTranches.includes(tNum);
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
                      <p className="text-lg font-black">{formatSubscriptionCurrencyAmount(trancheAmountFcfa, countryCode)}</p>
                    </div>

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
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Régler Tranche {tNum}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
                onClick={() => generateYziowReceiptPDF(lastPayment)}
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
