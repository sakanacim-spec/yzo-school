// ============================================================
// SUPER ADMIN DASHBOARD — Tableau de bord propriétaire SaaS
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users, AlertTriangle,
  Plus, Check, X, Clock, RefreshCw, ToggleLeft, ToggleRight,
  Globe, Phone, Mail, MapPin, Wallet, Star, Trash2, ExternalLink, Search, Key
} from 'lucide-react';
import { School } from '../../types';
import { API_BASE_URL } from '../../config';
import { useStore } from '../../store/useStore';
import { COUNTRIES, getCountryName } from '../../data/countries';
import { t } from '../../i18n';
import type { Language } from '../../i18n';

// ── Helpers ──────────────────────────────────────────────────

function getAuthHeaders() {
  const token = localStorage.getItem('parent_token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function formatFCFA(n: number) {
  return new Intl.NumberFormat('fr-TG').format(n) + ' FCFA';
}

function getStatusBadge(status: School['status'], language: Language) {
  const map = {
    active: { label: t(language, 'superadmin.active') || 'Actif', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
    trial: { label: t(language, 'superadmin.trial') || 'Essai', color: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
    suspended: { label: t(language, 'superadmin.suspended') || 'Suspendu', color: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${s.color}`}>
      {status === 'active' && <Check className="w-3 h-3" />}
      {status === 'trial' && <Clock className="w-3 h-3" />}
      {status === 'suspended' && <X className="w-3 h-3" />}
      {s.label}
    </span>
  );
}

// ── Types internes ────────────────────────────────────────────
interface SchoolWithStats extends School {
  student_count: number;
  user_count: number;
  revenue: number;
  total_revenue_paid: number;
  platform_collected_amount: number;
  platform_disbursed_amount: number;
  platform_commission_rate: number;
  trial_days_left: number;
  payout_momo_number?: string | null;
  payout_method?: 'momo' | 'rib' | null;
}

interface GlobalStats {
  total_schools: number;
  active_schools: number;
  trial_schools: number;
  suspended_schools: number;
  expired_trials: number;
  total_students: number;
  total_users: number;
  total_revenue: number;
  total_revenue_paid: number;
  platform_collected_amount: number;
  platform_disbursed_amount: number;
  price_per_student: number;
}

// ── Composant Modal Créer École ───────────────────────────────
interface CreateSchoolModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateSchoolModal: React.FC<CreateSchoolModalProps> = ({ onClose, onCreated }) => {
  const { language } = useStore();
  const [form, setForm] = useState({
    name: '', slug: '', country: '', city: '', address: '', phone: '', email: '',
    admin_nom: '', admin_telephone: '', admin_password: '',
    accepted_terms: false,
    accepted_privacy_policy: false,
    marketing_consent: false,
    referral_code: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (t(language as Language, 'superadmin.createError') || 'Erreur création'));
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-générer le slug depuis le nom
  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retirer accents
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    setForm(f => ({ ...f, name, slug }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-black text-white">{t(language as Language, 'superadmin.createSchool') || "Créer un nouvel établissement"}</h2>
            <p className="text-slate-400 text-sm">{t(language as Language, 'superadmin.createSchoolDesc') || "L'école bénéficiera de 2 mois d'essai gratuit"}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Infos école */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">{t(language as Language, 'superadmin.schoolInfo') || "Informations de l'école"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.schoolName') || "Nom de l'établissement"} *</label>
                <input type="text" value={form.name} onChange={e => handleNameChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t(language as Language, 'superadmin.schoolNamePlaceholder') || "ex: Lycée Excellence Lomé"} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.slug') || "Slug URL"} *</label>
                <div className="flex items-center bg-slate-800 border border-slate-600 rounded-xl overflow-hidden">
                  <span className="px-3 text-slate-500 text-sm">/</span>
                  <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    className="flex-1 bg-transparent px-2 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                    placeholder="lycee-excellence-lome" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.country') || "Pays"} *</label>
                <select 
                  value={form.country} 
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="" disabled>{t(language as Language, 'superadmin.selectCountry') || "Sélectionner un pays"}</option>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name_fr}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.city') || "Ville"}</label>
                <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Lomé" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.address') || "Adresse"}</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Adressez à Lomé" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.phone') || "Téléphone"}</label>
                <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+228 XX XX XX XX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.email') || "Email"}</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contact@ecole.tg" />
              </div>
            </div>
          </div>

          {/* Compte Directeur */}
          <div className="border-t border-slate-700 pt-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">{t(language as Language, 'superadmin.directorAccount') || "Compte Directeur (SchoolAdmin)"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.fullName') || "Nom complet"} *</label>
                <input type="text" value={form.admin_nom} onChange={e => setForm(f => ({ ...f, admin_nom: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="M. Jean Dupont" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.phoneLogin') || "Téléphone (login)"} *</label>
                <input type="text" value={form.admin_telephone} onChange={e => setForm(f => ({ ...f, admin_telephone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="90000001" required />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t(language as Language, 'superadmin.tempPassword') || "Mot de passe provisoire"} *</label>
                <input type="password" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t(language as Language, 'superadmin.min8chars') || "Minimum 8 caractères"} required minLength={6} />
              </div>
            </div>
          </div>

          {/* Affiliation / Parrainage */}
          <div className="border-t border-slate-700 pt-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Affiliation / Parrainage (Optionnel)</h3>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Code de l'ambassadeur</label>
              <input type="text" value={form.referral_code} onChange={e => setForm(f => ({ ...f, referral_code: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: AMB-JEAN5432" />
              <p className="text-xs text-slate-500 mt-1">Laissez vide si l'école n'a pas été parrainée.</p>
            </div>
          </div>

          {/* Section Confidentialité et Consentement */}
          <div className="border-t border-slate-700 pt-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">{t(language as Language, 'superadmin.privacyTitle') || "Confidentialité & Protection des données"}</h3>
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.accepted_terms || false}
                  onChange={e => setForm(f => ({ ...f, accepted_terms: e.target.checked }))}
                  className="mt-1 accent-blue-600 rounded"
                  required
                />
                <span className="text-sm text-slate-300 leading-tight">
                  {t(language as Language, 'superadmin.acceptTerms1') || "J'accepte les "} <span className="text-blue-400 font-bold hover:underline">{t(language as Language, 'superadmin.acceptTerms2') || "Conditions Générales d'Utilisation"}</span> {t(language as Language, 'superadmin.acceptTerms3') || "de la plateforme."} <span className="text-red-500">*</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.accepted_privacy_policy || false}
                  onChange={e => setForm(f => ({ ...f, accepted_privacy_policy: e.target.checked }))}
                  className="mt-1 accent-blue-600 rounded"
                  required
                />
                <span className="text-sm text-slate-300 leading-tight">
                  {t(language as Language, 'superadmin.acceptPrivacy1') || "J'autorise le traitement des données de l'établissement conformément à la "} <span className="text-blue-400 font-bold hover:underline">{t(language as Language, 'superadmin.acceptPrivacy2') || "Politique de Confidentialité"}</span>. <span className="text-red-500">*</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.marketing_consent || false}
                  onChange={e => setForm(f => ({ ...f, marketing_consent: e.target.checked }))}
                  className="mt-1 accent-blue-600 rounded"
                />
                <span className="text-sm text-slate-300 leading-tight">
                  {t(language as Language, 'superadmin.marketingConsent') || "J'accepte de recevoir des actualités et conseils d'optimisation de la part de la plateforme."} <span className="text-slate-400">({t(language as Language, 'superadmin.optional') || "Optionnel"})</span>
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 font-semibold transition-all">
              {t(language as Language, 'superadmin.cancel') || "Annuler"}
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? (t(language as Language, 'superadmin.creating') || 'Création...') : (t(language as Language, 'superadmin.createSchoolBtn') || "Créer l'école")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── DASHBOARD PRINCIPAL ───────────────────────────────────────
export const SuperAdminDashboard: React.FC = () => {
  const { language, user } = useStore();
  const [schools, setSchools] = useState<SchoolWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  
  // Support Client & Demandes Écoles
  const [inbox, setInbox] = useState<any[]>([]);
  const [schoolLeads, setSchoolLeads] = useState<any[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newSupportMessage, setNewSupportMessage] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ecoles' | 'reversements' | 'ambassadeurs' | 'historique' | 'annonces' | 'parametres' | 'support' | 'retraits_dons' | 'demandes_ecoles'>('ecoles');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    setPwdLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la modification du mot de passe.');
      setPwdSuccess('Mot de passe SuperAdmin mis à jour avec succès !');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwdSuccess('');
      }, 2000);
    } catch (err: any) {
      setPwdError(err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleUpdateCommission = async (school: SchoolWithStats, newRate: number) => {
    setActionLoading(`comm_${school.id}`);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools/${school.id}/commission`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rate: newRate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisburse = async (school: SchoolWithStats) => {
    const netTotal = (school.platform_collected_amount || 0) * (1 - (school.platform_commission_rate !== undefined ? school.platform_commission_rate : 5) / 100);
    const amountToDisburse = netTotal - (school.platform_disbursed_amount || 0);
    
    if (amountToDisburse <= 0) {
      alert("Aucun montant à reverser.");
      return;
    }
    const confirm = window.confirm(`Voulez-vous marquer ${formatFCFA(amountToDisburse)} comme reversés à ${school.name} ? (Veuillez faire le transfert d'abord)`);
    if (!confirm) return;

    setActionLoading(`disb_${school.id}`);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools/${school.id}/disburse`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: amountToDisburse })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.message);
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdrawalStatus = async (id: string, status: string, notes: string = '') => {
    setActionLoading(`withd_${id}`);
    try {
      const res = await fetch(`${API_BASE_URL}/withdrawals/${id}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.message);
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolsRes, statsRes, affiliatesRes, settingsRes, transRes, annRes, inboxRes, withdrawalsRes, leadsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/superadmin/schools`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/stats`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/affiliates`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/settings`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/transactions`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/announcements`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/support/inbox`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/withdrawals/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/superadmin/leads`, { headers: getAuthHeaders() })
      ]);
      if (schoolsRes.ok) {
        const d = await schoolsRes.json();
        setSchools(d.schools || []);
      }
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d);
      }
      if (affiliatesRes.ok) {
        const d = await affiliatesRes.json();
        setAffiliates(d.affiliates || []);
      }
      if (settingsRes.ok) {
        setSettings(await settingsRes.json());
      }
      if (transRes.ok) {
        const d = await transRes.json();
        setTransactions(d.transactions || []);
      }
      if (withdrawalsRes.ok) {
        const d = await withdrawalsRes.json();
        setWithdrawals(d.withdrawals || []);
      }
      if (annRes.ok) {
        const d = await annRes.json();
        setAnnouncements(d.announcements || []);
      }
      if (inboxRes.ok) {
        const d = await inboxRes.json();
        setInbox(d.inbox || []);
      }
      if (leadsRes.ok) {
        const d = await leadsRes.json();
        setSchoolLeads(d.leads || []);
      }
    } catch (err) {
      console.error('SuperAdmin load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusToggle = async (school: SchoolWithStats) => {
    const newStatus = school.status === 'active' ? 'suspended' : 'active';
    const label = newStatus === 'active' ? (t(language as Language, 'superadmin.activate') || 'activer') : (t(language as Language, 'superadmin.suspend') || 'suspendre');
    const confirmMsg = t(language as Language, 'superadmin.confirmStatusToggle')?.replace('{label}', label).replace('{name}', school.name) || `Voulez-vous ${label} "${school.name}" ?`;
    if (!confirm(confirmMsg)) return;

    setActionLoading(school.id);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools/${school.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) await load();
    } catch (err) {
      alert(t(language as Language, 'superadmin.statusUpdateError') || 'Erreur lors de la mise à jour du statut');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSchool = async (school: SchoolWithStats) => {
    // Double confirmation pour la suppression définitive
    const warnMsg = t(language as Language, 'superadmin.confirmDeleteWarn')?.replace('{name}', school.name) || `⚠️ ATTENTION ⚠️\nSupprimer DÉFINITIVEMENT "${school.name}" ?\n\nCette action va détruire toutes les bases de données (élèves, paiements, profils) associées. Cette action est IRREVERSIBLE.`;
    if (!confirm(warnMsg)) return;
    const promptMsg = t(language as Language, 'superadmin.confirmDeletePrompt')?.replace('{name}', school.name) || `Pour confirmer, tapez exactement le nom de l'école : "${school.name}"`;
    if (prompt(promptMsg) !== school.name) {
      alert(t(language as Language, 'superadmin.deleteCancelled') || "La saisie ne correspond pas, suppression annulée.");
      return;
    }

    setActionLoading(school.id);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools/${school.id}`, {
         method: 'DELETE',
         headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.message);
      await load();
    } catch (err: any) {
      alert(err.message || (t(language as Language, 'superadmin.deleteError') || 'Erreur lors de la suppression'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSettings = async (key: string, value: string) => {
    setActionLoading('settings');
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ [key]: value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.message);
      await load();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la mise à jour des paramètres');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const type = formData.get('type') as string;

    if (!title || !content) return;

    setActionLoading('announcement');
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/announcements`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title, content, type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(data.message);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la publication');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendSupportReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId || !newSupportMessage.trim()) return;

    setActionLoading('support_send');
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/support/send/${selectedSchoolId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: newSupportMessage })
      });
      if (res.ok) {
        setNewSupportMessage('');
        await load(); // Recharge la boite de réception
      }
    } catch (err) {
      console.error('Support send error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectSchoolForSupport = async (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    try {
      // Marquer comme lu
      await fetch(`${API_BASE_URL}/superadmin/support/read/${schoolId}`, {
        method: 'POST', headers: getAuthHeaders()
      });
      await load(); // Rafraîchit les compteurs non lus
    } catch (err) {
      console.error('Support read error:', err);
    }
  };

  const handleImpersonate = async (school: SchoolWithStats) => {
    setActionLoading(school.id);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/schools/${school.id}/impersonate`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (t(language as Language, 'superadmin.loginError') || 'Erreur lors de la connexion'));
      
      // Stocker le token
      localStorage.setItem('parent_token', data.token);
      
      // Vider le cache de l'école précédente et appliquer les nouvelles infos de l'école
      useStore.setState({
        students: [], parents: [], presences: [], activityLogs: [], links: [],
        announcements: [], announcementReads: [], matieres: [], classeMatieres: [],
        notes: [],
        schoolLogo: data.user.school_logo || null,
        schoolName: data.user.school_name || 'Établissement',
        user: data.user,
        isAuthenticated: true,
        currentPage: 'dashboard'
      });

      // Force a full reload to completely wipe the React tree and avoid state/suspense crashes
      setTimeout(() => {
        window.location.reload();
      }, 50);
    } catch (err: any) {
      alert(err.message);
      setActionLoading(null);
    }
  };

  const handlePayoutAffiliate = async (affiliateId: string, amount: number) => {
    if (!confirm(`Confirmer le retrait de ${amount} FCFA pour cet ambassadeur ?`)) return;
    setActionLoading(affiliateId);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/affiliates/${affiliateId}/payout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Paiement enregistré avec succès.');
      await load();
    } catch (err: any) {
      alert(err.message || 'Erreur lors du paiement');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateAffiliateStatus = async (affiliateId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    if (!confirm(`Confirmer le changement de statut de cet ambassadeur vers "${newStatus}" ?`)) return;
    setActionLoading(affiliateId);
    try {
      const res = await fetch(`${API_BASE_URL}/superadmin/affiliates/${affiliateId}/status`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const filteredSchools = schools.filter(s => {
    const q = searchQuery.toLowerCase();
    const countryName = getCountryName(s.country).toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.country || '').toLowerCase().includes(q) ||
      countryName.includes(q) ||
      (s.city || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl relative overflow-hidden">
        {/* Motif décoratif léger en fond */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(124,58,237,0.3)]">
            <Star className="w-8 h-8 text-white fill-white/20" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">{t(language as Language, 'superadmin.dashboardTitle') || "SuperAdmin Global"}</h1>
            <p className="text-slate-400 text-sm sm:text-base font-medium mt-1">{t(language as Language, 'superadmin.dashboardDesc') || "Plateforme SaaS — Contrôle & Gestion centralisée"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 relative z-10">
          <button onClick={() => setShowPasswordModal(true)}
            className="p-3.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 hover:text-white transition-all border border-purple-700/50 hover:shadow-lg flex items-center gap-2 font-bold text-xs"
            title="Changer mon mot de passe SuperAdmin">
            <Key className="w-5 h-5 text-purple-300" />
            <span className="hidden sm:inline">Mot de passe</span>
          </button>
          <button onClick={load}
            className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/50 hover:shadow-lg"
            title={t(language as Language, 'superadmin.refresh') || 'Actualiser'}>
            <RefreshCw className="w-5 h-5" />
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex flex-1 md:flex-none items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition-all shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] border border-blue-500/30 hover:scale-[1.02] active:scale-[0.98]">
            <Plus className="w-5 h-5 shrink-0" />
            <span className="whitespace-nowrap">{t(language as Language, 'superadmin.newSchool') || "Nouvelle école"}</span>
          </button>
        </div>
      </div>

      {/* Stats globales */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              label: t(language as Language, 'superadmin.totalSchools') || 'Total Écoles', value: stats.total_schools, icon: <Building2 className="w-5 h-5" />,
              color: 'from-blue-500 to-cyan-500', sub: `${stats.active_schools} ${t(language as Language, 'superadmin.activeSchoolsSub') || 'actives'}`
            },
            {
              label: t(language as Language, 'superadmin.totalStudents') || 'Total Élèves', value: stats.total_students.toLocaleString(), icon: <Users className="w-5 h-5" />,
              color: 'from-emerald-500 to-teal-500', sub: `${stats.total_users} ${t(language as Language, 'superadmin.usersSub') || 'utilisateurs'}`
            },
            {
              label: "Revenus Attendus (Brut)", value: formatFCFA(stats.total_revenue), icon: <Wallet className="w-5 h-5" />,
              color: 'from-purple-500 to-violet-500', sub: `Avec remise -10%: ${formatFCFA(stats.total_revenue * 0.9)}`
            },
            {
              label: "Revenus Encaissés", value: formatFCFA(stats.total_revenue_paid), icon: <Wallet className="w-5 h-5" />,
              color: 'from-amber-500 to-orange-500', sub: `Abonnements réels`
            },
            {
              label: t(language as Language, 'superadmin.alerts') || 'Alertes', value: stats.expired_trials + stats.suspended_schools, icon: <AlertTriangle className="w-5 h-5" />,
              color: 'from-red-500 to-rose-500', sub: `${stats.expired_trials} ${t(language as Language, 'superadmin.alertsSub') || 'essais expirés'}`
            },
          ].map((card) => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white`}>
                  {card.icon}
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-black text-white">{card.value}</p>
              <p className="text-slate-400 text-xs sm:text-sm font-medium">{card.label}</p>
              <p className="text-slate-500 text-[10px] sm:text-xs mt-1">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Analytics visuels */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
           <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-white font-bold mb-6">Répartition des Écoles</h3>
              <div className="flex h-4 rounded-full overflow-hidden mb-3 bg-slate-800">
                 <div style={{ width: `${(stats.active_schools / Math.max(1, stats.total_schools)) * 100}%` }} className="bg-emerald-500"></div>
                 <div style={{ width: `${(stats.suspended_schools / Math.max(1, stats.total_schools)) * 100}%` }} className="bg-red-500"></div>
                 <div style={{ width: `${(stats.expired_trials / Math.max(1, stats.total_schools)) * 100}%` }} className="bg-amber-500"></div>
              </div>
              <div className="flex flex-wrap justify-between text-xs text-slate-400">
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Actives ({stats.active_schools})</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Suspendues ({stats.suspended_schools})</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Essais expirés ({stats.expired_trials})</div>
              </div>
           </div>
           
           <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-white font-bold mb-6">Taux de recouvrement global</h3>
              <div className="flex items-center justify-between mb-2">
                 <span className="text-2xl font-black text-white">{Math.round((stats.total_revenue_paid / Math.max(1, stats.total_revenue)) * 100)}%</span>
                 <span className="text-sm text-slate-400">des revenus attendus</span>
              </div>
              <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden mb-2">
                 <div 
                    style={{ width: `${Math.min(100, (stats.total_revenue_paid / Math.max(1, stats.total_revenue)) * 100)}%` }} 
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                 ></div>
              </div>
              <p className="text-xs text-slate-500">Objectif: 100% de recouvrement des abonnements</p>
           </div>
        </div>
      )}

      {/* Alertes */}
      {stats && stats.expired_trials > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">{stats.expired_trials} {t(language as Language, 'superadmin.expiredTrialsAlertTitle') || "école(s) en essai expiré"}</p>
            <p className="text-sm text-amber-500/80">{t(language as Language, 'superadmin.expiredTrialsAlertDesc') || "Ces écoles n'ont pas encore réglé leur abonnement. Contactez les directeurs."}</p>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={() => setActiveTab('ecoles')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'ecoles'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          {t(language as Language, 'superadmin.registeredSchools') || "Établissements"}
        </button>
        <button
          onClick={() => setActiveTab('reversements')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'reversements'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Gestion des Reversements
        </button>
        <button
          onClick={() => setActiveTab('ambassadeurs')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'ambassadeurs'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Ambassadeurs
        </button>
        <button
          onClick={() => setActiveTab('historique')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'historique'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Historique
        </button>
        <button
          onClick={() => setActiveTab('annonces')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'annonces'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Annonces
        </button>
        <button
          onClick={() => setActiveTab('parametres')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'parametres'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Paramètres
        </button>
        <button
          onClick={() => setActiveTab('support')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'support'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Support Client
          {inbox.reduce((acc, curr) => acc + curr.unreadCount, 0) > 0 && (
            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
              {inbox.reduce((acc, curr) => acc + curr.unreadCount, 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('retraits_dons')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'retraits_dons'
              ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Retraits (Dons)
          {withdrawals.filter(w => w.status === 'pending').length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">
              {withdrawals.filter(w => w.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'ecoles' ? (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Liste des écoles */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{t(language as Language, 'superadmin.registeredSchools') || "Établissements enregistrés"}</h2>
            <span className="text-sm text-slate-500">{filteredSchools.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(language as Language, 'superadmin.searchPlaceholder') || "Rechercher (nom, pays...)"}
              className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
          </div>
        </div>

        {filteredSchools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-500 font-medium">{searchQuery ? (t(language as Language, 'superadmin.noSchoolFound') || 'Aucun établissement trouvé pour cette recherche') : (t(language as Language, 'superadmin.noSchoolRegistered') || 'Aucun établissement enregistré')}</p>
            {!searchQuery && <p className="text-slate-600 text-sm mt-1">{t(language as Language, 'superadmin.clickNewSchool') || "Cliquez sur 'Nouvelle école' pour commencer"}</p>}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredSchools.map((school) => {
              const isExpired = school.status === 'trial' && school.trial_days_left === 0;
              return (
                <div key={school.id} className={`p-5 hover:bg-slate-800/30 transition-colors ${isExpired ? 'border-l-4 border-amber-500' : ''}`}>
                  <div className="flex items-start gap-4">
                    {/* Logo / Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {school.logo_url ? (
                        <img src={school.logo_url} alt={school.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <h3 className="text-white font-bold text-base">{school.name}</h3>
                        {getStatusBadge(school.status, language)}
                        {isExpired && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            <AlertTriangle className="w-3 h-3" /> {t(language as Language, 'superadmin.expiredTrialBadge') || "Essai expiré"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400 mb-3">
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />
                          <code className="text-slate-300 text-xs">/{school.slug}</code>
                        </span>
                        {school.address && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />{school.address}
                          </span>
                        )}
                        {school.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" />{school.phone}
                          </span>
                        )}
                        {school.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />{school.email}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <div className="text-center">
                          <p className="text-white font-bold text-lg">{school.student_count}</p>
                          <p className="text-slate-500 text-xs">{t(language as Language, 'superadmin.currentStudents') || "Élèves actuels"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-emerald-400 font-bold text-lg">{formatFCFA(school.revenue)}</p>
                          <p className="text-slate-500 text-xs">{t(language as Language, 'superadmin.revenueExpected') || "Attendu/an"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-amber-400 font-bold text-lg">{formatFCFA(school.total_revenue_paid)}</p>
                          <p className="text-slate-500 text-xs">{t(language as Language, 'superadmin.revenuePaid') || "Encaissé"}</p>
                        </div>
                        {school.status === 'trial' && (
                          <div className="text-center">
                            <p className={`font-bold text-lg ${school.trial_days_left > 7 ? 'text-amber-400' : 'text-red-400'}`}>
                              {school.trial_days_left}j
                            </p>
                            <p className="text-slate-500 text-xs">{t(language as Language, 'superadmin.trialLeft') || "Restant essai"}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-700/50 pt-3 sm:pt-0 sm:pl-4 mt-3 sm:mt-0">
                      <button
                        onClick={() => handleImpersonate(school)}
                        disabled={actionLoading === school.id}
                        title={t(language as Language, 'superadmin.manageSchool') || "Gérer cet établissement"}
                        className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600/20 to-blue-500/10 text-blue-400 hover:from-blue-600/30 hover:to-blue-500/20 border border-blue-600/40 shadow-md transition-all disabled:opacity-50"
                      >
                        {actionLoading === school.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                        {t(language as Language, 'superadmin.manageBtn') || "GÉRER"}
                      </button>

                      <button
                        onClick={() => handleStatusToggle(school)}
                        disabled={actionLoading === school.id}
                        title={school.status === 'suspended' ? (t(language as Language, 'superadmin.activate') || 'Activer') : (t(language as Language, 'superadmin.suspend') || 'Suspendre')}
                        className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md ${
                          school.status === 'suspended'
                            ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-400/10 text-emerald-400 hover:from-emerald-500/30 hover:to-emerald-400/20 border border-emerald-500/40'
                            : 'bg-gradient-to-r from-amber-500/20 to-amber-400/10 text-amber-400 hover:from-amber-500/30 hover:to-amber-400/20 border border-amber-500/40'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === school.id
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : school.status === 'suspended'
                            ? <ToggleLeft className="w-5 h-5" />
                            : <ToggleRight className="w-5 h-5" />
                        }
                        {school.status === 'suspended' ? (t(language as Language, 'superadmin.reactivateBtn') || 'RÉACTIVER') : (t(language as Language, 'superadmin.suspendBtn') || 'SUSPENDRE')}
                      </button>

                      <button
                        onClick={() => handleDeleteSchool(school)}
                        disabled={actionLoading === school.id}
                        title={t(language as Language, 'superadmin.deleteSchool') || "Détruire cette école"}
                        className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600/20 to-red-500/10 text-red-500 hover:from-red-600/30 hover:to-red-500/20 border border-red-600/40 shadow-md transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t(language as Language, 'superadmin.deleteBtn') || "SUPPRIMER"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      ) : activeTab === 'reversements' ? (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-6">
        {/* Onglet Reversements */}
        <h2 className="text-xl font-bold text-white mb-6">Fonds collectés et Reversements</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-sm uppercase">
                <th className="pb-3 px-4 font-semibold">École</th>
                <th className="pb-3 px-4 font-semibold">Total Collecté</th>
                <th className="pb-3 px-4 font-semibold w-40">Commission (%)</th>
                <th className="pb-3 px-4 font-semibold">Net École</th>
                <th className="pb-3 px-4 font-semibold">Numéro Retrait (Yziow Pay)</th>
                <th className="pb-3 px-4 font-semibold">Déjà Reversé</th>
                <th className="pb-3 px-4 font-semibold text-amber-400">Reste à payer</th>
                <th className="pb-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm">
              {filteredSchools.map(school => {
                const collected = school.platform_collected_amount || 0;
                const rate = school.platform_commission_rate !== undefined ? school.platform_commission_rate : 5;
                const net = collected * (1 - rate / 100);
                const disbursed = school.platform_disbursed_amount || 0;
                const due = Math.max(0, net - disbursed);
                const isDue = due > 0;

                return (
                  <tr key={school.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-bold text-white">{school.name}</p>
                      <p className="text-xs text-slate-500">/{school.slug}</p>
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-300">
                      {formatFCFA(collected)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0" max="100" step="0.5"
                          defaultValue={rate}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== rate) {
                              handleUpdateCommission(school, val);
                            }
                          }}
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-medium text-emerald-400">
                      {formatFCFA(net)}
                    </td>
                    <td className="py-4 px-4">
                      {school.payout_momo_number ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{school.payout_method === 'rib' ? 'RIB/IBAN' : 'Mobile Money'}</span>
                          <span className="inline-block bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 rounded text-xs font-mono">
                            {school.payout_momo_number}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">Non configuré</span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-400">
                      {formatFCFA(disbursed)}
                    </td>
                    <td className="py-4 px-4 font-bold text-amber-400">
                      {formatFCFA(due)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button 
                        onClick={() => handleDisburse(school)}
                        disabled={!isDue || actionLoading === `disb_${school.id}`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isDue 
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md' 
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {actionLoading === `disb_${school.id}` ? 'En cours...' : 'Reverser'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSchools.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Aucune école trouvée.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : activeTab === 'ambassadeurs' ? (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Gestion des Ambassadeurs */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Gestion des Ambassadeurs</h2>
          <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg text-sm font-bold">{affiliates.length} affilié(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-800/50 text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">Ambassadeur</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Code / Lien</th>
                <th className="py-3 px-4">Taux</th>
                <th className="py-3 px-4">Gains Totaux</th>
                <th className="py-3 px-4 text-emerald-400">Solde Actuel</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {affiliates.map((affiliate: any) => (
                <tr key={affiliate.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      {affiliate.photo_url ? (
                        <img src={affiliate.photo_url} alt="Photo" className="w-8 h-8 rounded-full object-cover border border-slate-600" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                          <Users className="w-4 h-4 text-slate-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-white">{affiliate.nom}</p>
                        {affiliate.country && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <img src={`https://flagcdn.com/w20/${affiliate.country.toLowerCase()}.png`} alt="flag" className="w-3 h-auto rounded-sm" />
                            <span className="text-xs text-slate-500">{affiliate.country}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-slate-300">{affiliate.telephone}</p>
                    {affiliate.email && <p className="text-xs text-slate-500">{affiliate.email}</p>}
                  </td>
                  <td className="py-4 px-4 text-blue-400 font-mono text-xs">{affiliate.referral_code}</td>
                  <td className="py-4 px-4 text-slate-400">{affiliate.commission_rate}%</td>
                  <td className="py-4 px-4 font-medium text-slate-300">{formatFCFA(affiliate.total_earned)}</td>
                  <td className="py-4 px-4 font-bold text-emerald-400">{formatFCFA(affiliate.wallet_balance)}</td>
                  <td className="py-4 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      (!affiliate.status || affiliate.status === 'active') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {(!affiliate.status || affiliate.status === 'active') ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleUpdateAffiliateStatus(affiliate.id, affiliate.status || 'active')}
                        disabled={actionLoading === affiliate.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
                      >
                        {(!affiliate.status || affiliate.status === 'active') ? 'Suspendre' : 'Réactiver'}
                      </button>
                      <button
                        onClick={() => handlePayoutAffiliate(affiliate.id, affiliate.wallet_balance)}
                        disabled={!affiliate.wallet_balance || Number(affiliate.wallet_balance) <= 0 || actionLoading === affiliate.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          Number(affiliate.wallet_balance) > 0
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {actionLoading === affiliate.id ? 'En cours...' : 'Payer Retrait'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {affiliates.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Aucun ambassadeur inscrit.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      ) : activeTab === 'historique' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Historique des Transactions SaaS</h2>
            <p className="text-sm text-slate-400">Suivi des paiements des écoles (Abonnements, Frais).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-800/50 text-slate-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">École</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Méthode</th>
                  <th className="py-3 px-4 text-emerald-400">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {transactions.map((t: any) => (
                  <tr key={t.id} className="hover:bg-slate-800/20">
                    <td className="py-4 px-4 text-slate-300">
                      {new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-4 px-4 font-bold text-white">{t.schools?.name || 'Inconnue'}</td>
                    <td className="py-4 px-4 text-slate-400">
                      {t.type === 'subscription' ? 'Abonnement SaaS' : t.type}
                    </td>
                    <td className="py-4 px-4 text-slate-400">{t.payment_method || 'Non précisé'}</td>
                    <td className="py-4 px-4 font-bold text-emerald-400">+{formatFCFA(t.amount)}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">Aucune transaction enregistrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'annonces' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-6">Publier une Annonce</h2>
            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Titre de l'annonce</label>
                <input type="text" name="title" required
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Maintenance serveur ce soir" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Type</label>
                <select name="type" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="info">Information (Bleu)</option>
                  <option value="warning">Avertissement (Orange)</option>
                  <option value="success">Succès / Nouveauté (Vert)</option>
                  <option value="error">Urgent (Rouge)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Contenu du message</label>
                <textarea name="content" required rows={5}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ce message apparaîtra sur le tableau de bord de tous les directeurs..." />
              </div>
              <button type="submit" disabled={actionLoading === 'announcement'}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50">
                {actionLoading === 'announcement' ? 'Publication...' : 'Publier à toutes les écoles'}
              </button>
            </form>
          </div>
          
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">Annonces Précédentes</h2>
            </div>
            <div className="divide-y divide-slate-800/50">
              {announcements.map((ann: any) => (
                <div key={ann.id} className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      ann.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                      ann.type === 'error' ? 'bg-red-500/20 text-red-400' :
                      ann.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {ann.type.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(ann.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <h3 className="text-white font-bold mb-1">{ann.title}</h3>
                  <p className="text-sm text-slate-400">{ann.content}</p>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="p-8 text-center text-slate-500">Aucune annonce publiée.</div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'parametres' ? (
        <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-2">Configuration de la Plateforme SaaS</h2>
          <p className="text-sm text-slate-400 mb-8">Modifiez ici les paramètres globaux appliqués par défaut aux nouvelles inscriptions.</p>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-800 rounded-xl bg-slate-800/20">
              <div>
                <h4 className="font-bold text-white">Commission Ambassadeur par défaut</h4>
                <p className="text-sm text-slate-400">Le pourcentage reversé aux ambassadeurs (ex: 20%).</p>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={settings.default_commission_rate || ''}
                  onChange={(e) => setSettings({ ...settings, default_commission_rate: e.target.value })}
                  className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={() => handleUpdateSettings('default_commission_rate', settings.default_commission_rate)}
                  disabled={actionLoading === 'settings'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Sauver
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-800 rounded-xl bg-slate-800/20">
              <div>
                <h4 className="font-bold text-white">Prix Abonnement SaaS (FCFA)</h4>
                <p className="text-sm text-slate-400">Prix de base affiché pour l'abonnement annuel.</p>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={settings.subscription_price_fcfa || ''}
                  onChange={(e) => setSettings({ ...settings, subscription_price_fcfa: e.target.value })}
                  className="w-32 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={() => handleUpdateSettings('subscription_price_fcfa', settings.subscription_price_fcfa)}
                  disabled={actionLoading === 'settings'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Sauver
                </button>
              </div>
            </div>
            
          </div>
        </div>
      ) : activeTab === 'support' ? (
        <div className="flex h-[800px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Inbox List (Left) */}
          <div className="w-1/3 border-r border-slate-800 flex flex-col bg-slate-900/50">
            <div className="p-4 border-b border-slate-800">
              <h2 className="font-bold text-white text-lg">Boîte de réception</h2>
              <p className="text-xs text-slate-400">{inbox.length} conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
              {inbox.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">Aucun message de support.</p>
              ) : (
                inbox.map((item) => (
                  <div 
                    key={item.school.id} 
                    onClick={() => handleSelectSchoolForSupport(item.school.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedSchoolId === item.school.id 
                        ? 'bg-blue-600/20 border-l-4 border-blue-500' 
                        : 'hover:bg-slate-800/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-slate-200 text-sm line-clamp-1">{item.school.name}</h3>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {item.lastMessageAt && new Date(item.lastMessageAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-slate-400 line-clamp-1 flex-1 pr-4">
                        {item.messages.length > 0 ? item.messages[0].message : ''}
                      </p>
                      {item.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Chat Window (Right) */}
          <div className="w-2/3 flex flex-col bg-slate-900">
            {selectedSchoolId ? (() => {
              const currentInbox = inbox.find(i => i.school.id === selectedSchoolId);
              if (!currentInbox) return null;
              // Messages are descending from backend, we want ascending for chat
              const chatMessages = [...currentInbox.messages].reverse();

              return (
                <>
                  <div className="p-4 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white">{currentInbox.school.name}</h3>
                      <p className="text-xs text-slate-400">ID: {currentInbox.school.slug}</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {chatMessages.map(msg => {
                      const isMe = msg.sender_type === 'superadmin';
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-5 py-3 ${
                            isMe 
                              ? 'bg-blue-600 text-white rounded-tr-sm' 
                              : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                            <p className={`text-[10px] mt-2 text-right ${isMe ? 'text-blue-200' : 'text-slate-500'}`}>
                              {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="p-4 border-t border-slate-800 bg-slate-800/20">
                    <form onSubmit={handleSendSupportReply} className="flex items-end gap-3">
                      <textarea
                        value={newSupportMessage}
                        onChange={(e) => setNewSupportMessage(e.target.value)}
                        placeholder="Répondre..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none max-h-32 min-h-[44px]"
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendSupportReply(e);
                          }
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!newSupportMessage.trim() || actionLoading === 'support_send'}
                        className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {actionLoading === 'support_send' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Envoyer'}
                      </button>
                    </form>
                  </div>
                </>
              );
            })() : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Sélectionnez une école pour afficher la conversation
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Onglet Écoles Demandées par les Parents */}
      {activeTab === 'demandes_ecoles' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🏫 Écoles Demandées par les Parents & Leads Publics</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Liste des demandes d'ouverture d'écoles soumises par des parents d'élèves et prospects.
              </p>
            </div>
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold border border-amber-500/30">
              {schoolLeads.length} Demande(s)
            </span>
          </div>

          {schoolLeads.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              Aucune demande d'école pour le moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {schoolLeads.map((lead) => {
                const phoneMatch = lead.message?.match(/Parent: .*\((.*?)\)/)?.[1] || lead.email?.split('@')[0] || '';
                return (
                  <div key={lead.id} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 hover:border-amber-500/50 transition space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                          <span>{lead.name}</span>
                          <span className="text-xs font-normal text-slate-400">({lead.country || 'Afrique'})</span>
                        </h4>
                        <p className="text-xs text-amber-400 mt-0.5 font-mono">{lead.email}</p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                        {new Date(lead.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="bg-slate-950/80 rounded-xl p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-800 font-mono">
                      {lead.message}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      {phoneMatch && (
                        <a
                          href={`tel:${phoneMatch}`}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                        >
                          📞 Appeler le Parent / Directeur ({phoneMatch})
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal création */}
      {showCreateModal && (
        <CreateSchoolModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); load(); }}
        />
      )}

      {/* Modal modification mot de passe SuperAdmin */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-white relative">
            <button 
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg">Changer mon mot de passe</h3>
                <p className="text-xs text-slate-400">Compte SuperAdmin Global</p>
              </div>
            </div>

            {pwdError && <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-bold mb-4">{pwdError}</div>}
            {pwdSuccess && <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-bold mb-4">{pwdSuccess}</div>}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Mot de passe actuel (optionnel)</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-medium text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Nouveau mot de passe</label>
                <input 
                  type="password" 
                  placeholder="Minimum 6 caractères" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-medium text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-purple-600/30 active:scale-95 transition-all"
                >
                  {pwdLoading ? 'Mise à jour...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
