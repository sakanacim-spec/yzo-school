import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Student, Payment, User } from '../types';
import { CreditCard, Plus, X, Check, Search, Clock, ChevronDown, ChevronUp, Loader2, Wallet, ArrowUpRight, TrendingDown, AlertCircle, Download } from 'lucide-react';

import { API_BASE_URL } from '../config';
import { parseResponse, getAuthHeaders } from '../services/apiHelpers';
import { getCycle } from '../data/classConfig';
import { formatMontant } from '../utils/helpers';
import { generatePaymentReceipt } from '../utils/pdfUtils';
import { notificationService } from '../services/notificationService';
import { t, Language } from '../i18n';

const computeStatus = (restant: number, ecolage: number): 'Soldé' | 'Partiel' | 'Non soldé' => {
  if (restant <= 0) return 'Soldé';
  const paye = ecolage - restant;
  const taux = ecolage > 0 ? paye / ecolage : 0;
  if (taux >= 0.7) return 'Partiel';
  return 'Non soldé';
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Modale ajout paiement ────────────────────────────────────
const PaymentModal: React.FC<{ student: Student; onClose: () => void }> = ({ student, onClose }) => {
  const addPayment = useStore((s) => s.addPayment);
  const currency = useStore((s) => s.currency);
  const language = useStore((s) => s.language);
  const messageRemerciement = useStore((s) => s.messageRemerciement);
  const messageRappel = useStore((s) => s.messageRappel);
  const [form, setForm] = useState({ montant: '', recu: '', note: '', date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');

  const maxPay = student.restant;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montant = Number(form.montant);
    if (!montant || montant <= 0) { setError(t(language as Language, 'payments.invalidAmount') || 'Montant invalide.'); return; }
    if (montant > maxPay) { setError(`${t(language as Language, 'payments.amountExceedsRemaining') || 'Le montant dépasse le restant'} (${formatMontant(maxPay, currency)}).`); return; }
    addPayment(student.id, { montant, recu: form.recu, note: form.note, date: form.date });

    if (student.parentId) {
      const isSolde = student.restant - montant <= 0;
      const template = isSolde ? messageRemerciement : messageRappel;
      
      let customMsg = null;
      if (template) {
        customMsg = template
          .replace(/{nom_eleve}/g, `${student.prenom} ${student.nom}`)
          .replace(/{reste_a_payer}/g, formatMontant(student.restant - montant, currency))
          .replace(/{classe}/g, student.classe)
          .replace(/{montant_paye}/g, formatMontant(montant, currency));
      }

      const defaultMsg = (t(language as Language, 'payments.paymentReceivedMsg') || 'Nous avons bien reçu votre paiement de {amount} pour {firstName} {lastName}.')
          .replace('{amount}', formatMontant(montant, currency))
          .replace('{firstName}', student.prenom)
          .replace('{lastName}', student.nom);
      const msg = customMsg || defaultMsg;
      await notificationService.notifyParents(student.id, msg, 'payment', t(language as Language, 'payments.paymentRecorded') || 'Paiement enregistré');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 animate-slideUp overflow-hidden">
        
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
              <CreditCard className="w-5 h-5" />
            </div>
            {t(language as Language, 'payments.recordPayment') || 'Enregistrer un paiement'}
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 pb-2">
          <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-[1.5rem] border border-amber-100 dark:border-amber-800/30">
            <p className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{student.prenom} {student.nom}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">{student.classe}</p>
            
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t(language as Language, 'payments.tuition') || 'Écolage'}</p>
                <p className="font-bold text-slate-700 dark:text-slate-300">{formatMontant(student.ecolage, currency)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{t(language as Language, 'payments.alreadyPaid') || 'Déjà payé'}</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatMontant(student.dejaPaye, currency)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{t(language as Language, 'payments.remaining') || 'Restant'}</p>
                <p className="font-black text-rose-600 dark:text-rose-400">{formatMontant(student.restant, currency)}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">{t(language as Language, 'payments.amountReceived') || 'Montant perçu'} ({currency}) *</label>
            <input
              type="number" min={1} max={maxPay} required autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-lg font-black focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
              placeholder={`${t(language as Language, 'payments.maximum') || 'Maximum'} : ${formatMontant(maxPay, currency)}`}
              value={form.montant}
              onChange={(e) => { setForm({ ...form, montant: e.target.value }); setError(''); }}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">{t(language as Language, 'common.date') || 'Date'}</label>
              <input 
                type="date" 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white" 
                value={form.date} 
                onChange={(e) => setForm({ ...form, date: e.target.value })} 
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">{t(language as Language, 'payments.receiptNo') || 'N° Reçu'}</label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white uppercase placeholder:normal-case" 
                value={form.recu} 
                onChange={(e) => setForm({ ...form, recu: e.target.value })} 
                placeholder="Ex: R-1024"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">{t(language as Language, 'payments.noteOptional') || 'Note (optionnel)'}</label>
            <input 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white" 
              value={form.note} 
              onChange={(e) => setForm({ ...form, note: e.target.value })} 
              placeholder="Ex : 1ère tranche espèce" 
            />
          </div>
          
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl flex items-center gap-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}
          
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-4 border border-slate-200 dark:border-slate-700 rounded-2xl text-[13px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors uppercase tracking-widest">
              {t(language as Language, 'common.cancel') || 'Annuler'}
            </button>
            <button type="submit" className="flex-1 py-4 bg-amber-500 text-white rounded-2xl text-[13px] font-black hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]">
              <Check className="w-5 h-5" /> {t(language as Language, 'payments.validatePayment') || 'Valider l\'encaissement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Ligne d'historique d'un élève ─────────────────────────────
const StudentPaymentRow: React.FC<{ student: Student; onPay: (s: Student) => void; user: User | null }> = ({ student, onPay, user }) => {
  if (!user) return null;

  const [open, setOpen] = useState(false);
  const language = useStore((s) => s.language);
  const currency = useStore((s) => s.currency);
  const taux = student.ecolage > 0 ? Math.round(((student.ecolage - student.restant) / student.ecolage) * 100) : 0;
  const settings = useStore((s) => s.settings);

  return (
    <div className="group border border-slate-100 dark:border-slate-800/60 rounded-[1.5rem] overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:border-slate-200 dark:hover:border-slate-700">
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <span className="font-black text-slate-900 dark:text-white text-base tracking-tight">{student.prenom} {student.nom}</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">{student.classe}</span>
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest ${
              student.status === 'Soldé' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
              student.status === 'Partiel' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
            }`}>{student.status === 'Soldé' ? (t(language as Language, 'payments.statusSettled') || 'Soldé') : student.status === 'Partiel' ? (t(language as Language, 'payments.statusPartial') || 'Partiel') : (t(language as Language, 'payments.statusUnsettled') || 'Non soldé')}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[200px]">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${student.status === 'Soldé' ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                style={{ width: `${taux}%` }} 
              />
            </div>
            <span className="text-[11px] font-black text-slate-500">{taux}%</span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-bold text-slate-500">{student.historiquesPaiements.length} {t(language as Language, 'payments.transactions') || 'transaction(s)'}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-auto">
          <div className="text-left sm:text-right">
            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{formatMontant(student.dejaPaye, currency)}</p>
            <p className={`text-[11px] font-bold ${student.restant > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              {student.restant > 0 ? `${t(language as Language, 'payments.remainingLabel') || 'Reste :'} ${formatMontant(student.restant, currency)}` : (t(language as Language, 'payments.fullyPaid') || 'INTÉGRALEMENT SOLDÉ')}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {student.restant > 0 && (user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'comptable') && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay(student); }}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]"
              >
                <Plus className="w-4 h-4" /> {t(language as Language, 'payments.pay') || 'Payer'}
              </button>
            )}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : ''}`}>
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800/60 px-5 py-4 bg-slate-50/50 dark:bg-slate-900/30">
          {student.historiquesPaiements.length === 0 ? (
            <div className="flex items-center gap-2 text-sm font-bold text-slate-400 p-2">
              <Clock className="w-4 h-4" /> {t(language as Language, 'payments.noTransactionHistory') || 'Aucun historique de transaction manuelle.'}
            </div>
          ) : (
            <div className="space-y-3">
              {student.historiquesPaiements.map((p: Payment) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2 w-32 shrink-0 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" />
                    {fmtDate(p.date)}
                  </div>
                  <div className="font-black text-emerald-600 dark:text-emerald-400 text-sm shrink-0 w-32">
                    +{formatMontant(p.montant, currency)}
                  </div>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.recu && <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md uppercase tracking-widest shrink-0">{t(language as Language, 'payments.receipt') || 'Reçu'} {p.recu}</span>}
                    {p.note && <span className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{p.note}</span>}
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await generatePaymentReceipt(p, student, settings, language);
                      } catch (err) {
                        console.error('Erreur génération reçu:', err);
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors ml-auto"
                    title={t(language as Language, 'payments.downloadReceipt') || 'Télécharger le reçu'}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── PAGE PRINCIPALE ──────────────────────────────────────────
export const Paiements: React.FC = () => {
  const students = useStore((s) => s.students);
  const classesList = useStore((s) => s.classes) || [];
  const setStudents = useStore((s) => s.setStudents);
  const user = useStore((s) => s.user);
  const language = useStore((s) => s.language);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [payModal, setPayModal] = useState<Student | null>(null);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-amber-500 mb-6" />
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest animate-pulse">{t(language as Language, 'common.loadingSession') || 'Chargement de la session...'}</p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => `${s.nom} ${s.prenom} ${s.classe}`.toLowerCase().includes(q));
    }
    if (filterClasse) list = list.filter((s) => s.classe === filterClasse);
    if (filterStatus) list = list.filter((s) => s.status === filterStatus);
    return list.sort((a, b) => a.nom.localeCompare(b.nom));
  }, [students, search, filterClasse, filterStatus]);

  const totalPaye = filtered.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant = filtered.reduce((a, s) => a + s.restant, 0);
  const totalPayements = filtered.reduce((a, s) => a + s.historiquesPaiements.length, 0);

  useEffect(() => {
    if (students.length === 0) {
      setLoading(true);
      fetch(`${API_BASE_URL}/students`, { headers: getAuthHeaders() })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return parseResponse(res);
        })
        .then((data) => {
          if (data && Array.isArray(data.students)) {
            const normalized: Student[] = data.students
              .filter((s: any) => s && typeof s === 'object' && s.id)
              .map((s: any) => {
                try {
                  const ecolage = s.ecolage || 0;
                  const dejaPaye = s.deja_paye ?? 0;
                  const restantVal = typeof s.restant === 'number' ? s.restant : ecolage - dejaPaye;
                  return {
                    id: s.id, nom: s.nom, prenom: s.prenom || '', classe: s.classe || 'Inconnue',
                    telephone: s.telephone || s.telephone_parent || '', parentId: s.parent_id || undefined,
                    sexe: s.sexe || 'M', redoublant: s.redoublant || false, ecoleProvenance: s.ecole_provenance || '',
                    ecolage, dejaPaye, restant: restantVal, recu: s.recu || '', cycle: getCycle(s.classe),
                    status: computeStatus(restantVal, ecolage), historiquesPaiements: s.historiques_paiements || [],
                    createdAt: s.created_at || new Date().toISOString(), updatedAt: s.updated_at || new Date().toISOString(),
                  };
                } catch (err) { return null; }
              })
              .filter(Boolean);
            setStudents(normalized);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [students.length, setStudents]);

  const classes = [...new Set(classesList.map((c) => c.name))];

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-slideUp">
      
      {/* ── HEADER & KPIs ── */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <Wallet className="w-64 h-64 text-emerald-500" />
        </div>
        
        <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                <CreditCard className="w-3.5 h-3.5" /> {t(language as Language, 'payments.studentFinance') || 'Finance Étudiante'}
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              {t(language as Language, 'payments.paymentsAnd') || 'Paiements &'} <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-emerald-600">{t(language as Language, 'payments.recovery') || 'Recouvrement'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              {t(language as Language, 'payments.paymentsDesc') || 'Gérez les encaissements, consultez l\'historique et relancez les paiements en attente.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full xl:w-auto">
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <ArrowUpRight className="w-3 h-3 text-emerald-500" /> {t(language as Language, 'finance.totalReceived') || 'Total Perçu'}
              </p>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{new Intl.NumberFormat('fr-FR').format(totalPaye)} <span className="text-sm font-bold text-slate-400">F</span></p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <TrendingDown className="w-3 h-3 text-rose-500" /> {t(language as Language, 'finance.remaining') || 'Reste à recouvrer'}
              </p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{new Intl.NumberFormat('fr-FR').format(totalRestant)} <span className="text-sm font-bold text-rose-300">F</span></p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Clock className="w-3 h-3 text-amber-500" /> {t(language as Language, 'payments.transactionsLabel') || 'Transactions'}
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{totalPayements} <span className="text-sm font-bold text-amber-300">{t(language as Language, 'payments.entries') || 'entrées'}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* ── FILTRES ── */}
      <div className="flex flex-wrap gap-4 items-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl p-4 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white"
            placeholder={t(language as Language, 'payments.searchPlaceholder') || 'Rechercher par nom, prénom ou classe...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
          value={filterClasse} 
          onChange={(e) => setFilterClasse(e.target.value)}
        >
          <option value="">{t(language as Language, 'payments.allClasses') || 'Toutes les classes'}</option>
          {[...new Set(students.map(s => s.classe))].filter(Boolean).sort().map(className => <option key={className} value={className}>{className}</option>)}
        </select>
        <select 
          className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
          value={filterStatus} 
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">{t(language as Language, 'payments.allStatuses') || 'Tous les statuts'}</option>
          <option value="Soldé">{t(language as Language, 'payments.statusSettled') || 'Soldé'}</option><option value="Partiel">{t(language as Language, 'payments.statusPartial') || 'Partiel'}</option><option value="Non soldé">{t(language as Language, 'payments.statusUnsettled') || 'Non soldé'}</option>
        </select>
        {(search || filterClasse || filterStatus) && (
          <button 
            onClick={() => { setSearch(''); setFilterClasse(''); setFilterStatus(''); }} 
            className="flex items-center gap-2 px-6 py-4 text-[12px] font-black uppercase tracking-widest text-rose-500 hover:text-white hover:bg-rose-500 rounded-2xl transition-all shadow-sm"
          >
            <X className="w-4 h-4" /> {t(language as Language, 'common.reset') || 'Réinitialiser'}
          </button>
        )}
      </div>

      {/* ── LISTE ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest animate-pulse">{t(language as Language, 'payments.loadingRecords') || 'Chargement des dossiers...'}</p>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fadeIn">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6">
            <CreditCard className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{t(language as Language, 'payments.noStudentRecords') || 'Aucun dossier étudiant'}</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm font-medium">{t(language as Language, 'payments.importStudentsFirst') || 'Veuillez d\'abord importer des élèves depuis l\'onglet gestion.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{filtered.length} {t(language as Language, 'payments.studentsFound') || 'élève(s) trouvé(s)'}</p>
            <p className="text-[10px] font-bold text-slate-400">{t(language as Language, 'payments.clickRowForDetails') || 'Cliquez sur une ligne pour le détail'}</p>
          </div>
          <div className="space-y-3">
            {filtered.map((s) => (
              <StudentPaymentRow key={s.id} student={s} onPay={setPayModal} user={user} />
            ))}
            {filtered.length === 0 && (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem]">
                <p className="text-sm font-bold text-slate-500">{t(language as Language, 'payments.noResultsForSearch') || 'Aucun résultat pour cette recherche.'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {payModal && <PaymentModal student={payModal} onClose={() => setPayModal(null)} />}
    </div>
  );
};
