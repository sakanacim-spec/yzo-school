import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Student, Payment, User } from '../types';
import { CreditCard, Plus, X, Check, Search, Clock, ChevronDown, ChevronUp, Loader2, Wallet, ArrowUpRight, TrendingDown, AlertCircle } from 'lucide-react';
import { CLASS_CONFIG } from '../data/classConfig';
import { API_BASE_URL } from '../config';
import { parseResponse, getAuthHeaders } from '../services/apiHelpers';
import { getCycle } from '../data/classConfig';

const computeStatus = (restant: number, ecolage: number): 'Soldé' | 'Partiel' | 'Non soldé' => {
  if (restant <= 0) return 'Soldé';
  const paye = ecolage - restant;
  const taux = ecolage > 0 ? paye / ecolage : 0;
  if (taux >= 0.7) return 'Partiel';
  return 'Non soldé';
};

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Modale ajout paiement ────────────────────────────────────
const PaymentModal: React.FC<{ student: Student; onClose: () => void }> = ({ student, onClose }) => {
  const addPayment = useStore((s) => s.addPayment);
  const [form, setForm] = useState({ montant: '', recu: '', note: '', date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');

  const maxPay = student.restant;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montant = Number(form.montant);
    if (!montant || montant <= 0) { setError('Montant invalide.'); return; }
    if (montant > maxPay) { setError(`Le montant dépasse le restant (${fmtMoney(maxPay)}).`); return; }
    addPayment(student.id, { montant, recu: form.recu, note: form.note, date: form.date });
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
            Enregistrer un paiement
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Écolage</p>
                <p className="font-bold text-slate-700 dark:text-slate-300">{fmtMoney(student.ecolage)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Déjà payé</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(student.dejaPaye)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Restant</p>
                <p className="font-black text-rose-600 dark:text-rose-400">{fmtMoney(student.restant)}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Montant perçu (FCFA) *</label>
            <input
              type="number" min={1} max={maxPay} required autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-lg font-black focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
              placeholder={`Maximum : ${fmtMoney(maxPay)}`}
              value={form.montant}
              onChange={(e) => { setForm({ ...form, montant: e.target.value }); setError(''); }}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Date</label>
              <input 
                type="date" 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white" 
                value={form.date} 
                onChange={(e) => setForm({ ...form, date: e.target.value })} 
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">N° Reçu</label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white uppercase placeholder:normal-case" 
                value={form.recu} 
                onChange={(e) => setForm({ ...form, recu: e.target.value })} 
                placeholder="Ex: R-1024"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Note (optionnel)</label>
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
              Annuler
            </button>
            <button type="submit" className="flex-1 py-4 bg-amber-500 text-white rounded-2xl text-[13px] font-black hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]">
              <Check className="w-5 h-5" /> Valider l'encaissement
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
  const taux = Math.round((student.dejaPaye / student.ecolage) * 100);

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
            }`}>{student.status}</span>
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
            <span className="text-[11px] font-bold text-slate-500">{student.historiquesPaiements.length} transaction(s)</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-auto">
          <div className="text-left sm:text-right">
            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{new Intl.NumberFormat('fr-FR').format(student.dejaPaye)} F</p>
            <p className={`text-[11px] font-bold ${student.restant > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              {student.restant > 0 ? `Reste : ${new Intl.NumberFormat('fr-FR').format(student.restant)} F` : 'INTÉGRALEMENT SOLDÉ'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {student.restant > 0 && (user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'comptable') && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay(student); }}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]"
              >
                <Plus className="w-4 h-4" /> Payer
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
              <Clock className="w-4 h-4" /> Aucun historique de transaction manuelle.
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
                    +{new Intl.NumberFormat('fr-FR').format(p.montant)} FCFA
                  </div>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.recu && <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md uppercase tracking-widest shrink-0">Reçu {p.recu}</span>}
                    {p.note && <span className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{p.note}</span>}
                  </div>
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
  const setStudents = useStore((s) => s.setStudents);
  const user = useStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [payModal, setPayModal] = useState<Student | null>(null);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-amber-500 mb-6" />
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest animate-pulse">Chargement de la session...</p>
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

  const classes = [...new Set(CLASS_CONFIG.map((c) => c.name))];

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
                <CreditCard className="w-3.5 h-3.5" /> Finance Étudiante
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Paiements & <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-emerald-600">Recouvrement</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Gérez les encaissements, consultez l'historique et relancez les paiements en attente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full xl:w-auto">
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <ArrowUpRight className="w-3 h-3 text-emerald-500" /> Total Perçu
              </p>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{new Intl.NumberFormat('fr-FR').format(totalPaye)} <span className="text-sm font-bold text-slate-400">F</span></p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <TrendingDown className="w-3 h-3 text-rose-500" /> Reste à recouvrer
              </p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{new Intl.NumberFormat('fr-FR').format(totalRestant)} <span className="text-sm font-bold text-rose-300">F</span></p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Clock className="w-3 h-3 text-amber-500" /> Transactions
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{totalPayements} <span className="text-sm font-bold text-amber-300">entrées</span></p>
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
            placeholder="Rechercher par nom, prénom ou classe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
          value={filterClasse} 
          onChange={(e) => setFilterClasse(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select 
          className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
          value={filterStatus} 
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option>Soldé</option><option>Partiel</option><option>Non soldé</option>
        </select>
        {(search || filterClasse || filterStatus) && (
          <button 
            onClick={() => { setSearch(''); setFilterClasse(''); setFilterStatus(''); }} 
            className="flex items-center gap-2 px-6 py-4 text-[12px] font-black uppercase tracking-widest text-rose-500 hover:text-white hover:bg-rose-500 rounded-2xl transition-all shadow-sm"
          >
            <X className="w-4 h-4" /> Réinitialiser
          </button>
        )}
      </div>

      {/* ── LISTE ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest animate-pulse">Chargement des dossiers...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fadeIn">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6">
            <CreditCard className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Aucun dossier étudiant</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm font-medium">Veuillez d'abord importer des élèves depuis l'onglet gestion.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{filtered.length} élève(s) trouvé(s)</p>
            <p className="text-[10px] font-bold text-slate-400">Cliquez sur une ligne pour le détail</p>
          </div>
          <div className="space-y-3">
            {filtered.map((s) => (
              <StudentPaymentRow key={s.id} student={s} onPay={setPayModal} user={user} />
            ))}
            {filtered.length === 0 && (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem]">
                <p className="text-sm font-bold text-slate-500">Aucun résultat pour cette recherche.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {payModal && <PaymentModal student={payModal} onClose={() => setPayModal(null)} />}
    </div>
  );
};
