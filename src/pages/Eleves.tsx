import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Student } from '../types';
import { CLASS_CONFIG } from '../data/classConfig';
import { generateRecuPDF } from '../utils/pdfGenerator';
import { uploadStudentPhoto, deleteStudentPhoto } from '../services/photoService';
import {
  Search, Plus, Trash2, Edit2, FileText,
  MessageCircle, ChevronUp, ChevronDown, X, Check,
  Download, Filter, Camera, User, Users, GraduationCap, Building2, Smartphone
} from 'lucide-react';
import { StudentDetail } from '../components/StudentDetail';

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' F';

// ── Badge statut ─────────────────────────────────────────────
const StatusBadge: React.FC<{ status: Student['status'] }> = ({ status }) => {
  const map: Record<string, string> = {
    'Soldé': 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
    'Partiel': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
    'Non soldé': 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${map[status] ?? ''}`}>
      {status === 'Soldé' && <Check className="w-3 h-3 mr-1" />}
      {status === 'Partiel' && <span className="mr-1">≥70%</span>}
      {status}
    </span>
  );
};

// ── Modale Ajout/Édition ─────────────────────────────────────
interface ModalProps { student?: Student | null; onClose: () => void }

const StudentModal: React.FC<ModalProps> = ({ student, onClose }) => {
  const addStudent = useStore((s) => s.addStudent);
  const updateStudent = useStore((s) => s.updateStudent);

  const [form, setForm] = useState({
    nom: student?.nom ?? '',
    prenom: student?.prenom ?? '',
    classe: student?.classe ?? CLASS_CONFIG[0].name,
    telephone: student?.telephone ?? '+228',
    sexe: (student?.sexe ?? 'M') as 'M' | 'F',
    redoublant: student?.redoublant ?? false,
    ecoleProvenance: student?.ecoleProvenance ?? '',
    dejaPaye: student?.dejaPaye ?? 0,
    recu: student?.recu ?? '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (student) {
      updateStudent(student.id, form);
    } else {
      addStudent(form);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 animate-slideUp custom-scrollbar">
        
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 sticky top-0 z-10 backdrop-blur-xl">
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            {student ? "Modifier le dossier" : 'Nouvelle inscription'}
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Nom de l'élève *</label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white uppercase placeholder:normal-case" 
                required 
                placeholder="Ex: DOSSOU"
                value={form.nom} 
                onChange={(e) => setForm({ ...form, nom: e.target.value })} 
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Prénoms *</label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white capitalize placeholder:normal-case" 
                required 
                placeholder="Ex: Jean Paul"
                value={form.prenom} 
                onChange={(e) => setForm({ ...form, prenom: e.target.value })} 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <GraduationCap className="w-3 h-3" /> Classe *
              </label>
              <select 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
                value={form.classe} 
                onChange={(e) => setForm({ ...form, classe: e.target.value })}
              >
                {CLASS_CONFIG.map((c) => <option key={c.name} value={c.name}>{c.name} — {c.cycle} ({new Intl.NumberFormat('fr-FR').format(c.ecolage)} F)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <User className="w-3 h-3" /> Sexe
              </label>
              <select 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white cursor-pointer" 
                value={form.sexe} 
                onChange={(e) => setForm({ ...form, sexe: e.target.value as 'M' | 'F' })}
              >
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Smartphone className="w-3 h-3" /> Téléphone parent
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white" 
                value={form.telephone} 
                onChange={(e) => setForm({ ...form, telephone: e.target.value })} 
                placeholder="+228" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Building2 className="w-3 h-3" /> École de provenance
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white" 
                value={form.ecoleProvenance} 
                onChange={(e) => setForm({ ...form, ecoleProvenance: e.target.value })} 
                placeholder="Ex: EPL Les Génies"
              />
            </div>
          </div>

          <div className="p-5 bg-gradient-to-br from-slate-50 to-emerald-50 dark:from-slate-800/50 dark:to-emerald-900/10 rounded-2xl border border-slate-200 dark:border-emerald-500/20">
            <h3 className="text-xs font-black text-slate-800 dark:text-emerald-400 uppercase tracking-widest mb-4">Informations financières (1er versement)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Montant payé (FCFA)</label>
                <input 
                  type="number" min={0} 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white" 
                  value={form.dejaPaye} 
                  onChange={(e) => setForm({ ...form, dejaPaye: Number(e.target.value) })} 
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">N° Reçu associé</label>
                <input 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white uppercase" 
                  value={form.recu} 
                  onChange={(e) => setForm({ ...form, recu: e.target.value })} 
                  placeholder="Ex: R-001"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <input 
              type="checkbox" 
              checked={form.redoublant} 
              onChange={(e) => setForm({ ...form, redoublant: e.target.checked })} 
              className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 dark:bg-slate-800 dark:border-slate-600" 
            />
            <span className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Élève Redoublant</span>
          </label>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 border border-slate-200 dark:border-slate-700 rounded-2xl text-[13px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors uppercase tracking-widest">
              Annuler
            </button>
            <button type="submit" className="flex-1 py-4 bg-amber-500 text-white rounded-2xl text-[13px] font-black hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]">
              {student ? 'Enregistrer les modifications' : 'Valider l\'inscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Bouton WhatsApp ──────────────────────────────────────────
const WhatsAppBtn: React.FC<{ student: Student; schoolName: string }> = ({ student, schoolName }) => {
  const taux = Math.round((student.dejaPaye / student.ecolage) * 100);
  const msg = student.restant <= 0
    ? `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). Nous vous felicitons d'avoir solde la scolarite (${new Intl.NumberFormat('fr-FR').format(student.ecolage)} FCFA). Merci ! — ${schoolName}`
    : `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). Solde restant : ${new Intl.NumberFormat('fr-FR').format(student.restant)} FCFA (paye : ${taux}%). Merci de regulariser. — ${schoolName}`;

  const phone = (student.telephone || '').replace(/\D/g, '');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow-emerald-500/30"
      title="Envoyer sur WhatsApp"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      <span className="hidden xl:inline">WhatsApp</span>
    </a>
  );
};

// ── Photo Modal ──────────────────────────────────────────────
const PhotoModal: React.FC<{ student: Student; onClose: () => void; onSave: (b64: string) => Promise<void>; onDelete: () => Promise<void>; }> = ({ student, onClose, onSave, onDelete }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(student.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!preview || !preview.startsWith('data:image')) return;
    setSaving(true);
    try { await onSave(preview); } finally { setSaving(false); onClose(); }
  };

  const handleDelete = async () => {
    if (confirm('Voulez-vous vraiment supprimer cette photo ?')) {
        setDeleting(true);
        try { await onDelete(); } finally { setDeleting(false); onClose(); }
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-slideUp">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Photo de profil</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-8 flex flex-col items-center">
          <div 
            onClick={() => inputRef.current?.click()}
            className="w-40 h-40 border-4 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden mb-6 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 dark:hover:border-amber-500/50 dark:hover:bg-amber-900/20 transition-all flex items-center justify-center relative group"
          >
            {preview ? (
              <img src={preview} alt="Aperçu" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-slate-400 dark:text-slate-500">
                <Camera className="w-10 h-10 mb-2 opacity-50 group-hover:text-amber-500 group-hover:opacity-100 transition-all group-hover:scale-110" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center px-2 group-hover:text-amber-600">Prendre / Choisir</span>
              </div>
            )}
            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
              <Camera className="w-8 h-8 text-white mb-2" />
              <span className="text-white text-[10px] font-black uppercase tracking-widest">Modifier</span>
            </div>
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          
          {(student.photoUrl || preview) && (
             <button onClick={handleDelete} disabled={deleting} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 mb-4 transition-colors">
                 <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Suppression...' : 'Supprimer'}
             </button>
          )}

          <div className="flex gap-3 w-full mt-2">
            <button onClick={onClose} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Annuler</button>
            <button onClick={handleSave} disabled={saving || !preview || preview === student.photoUrl} className="flex-1 py-3 bg-amber-500 disabled:opacity-50 disabled:hover:scale-100 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30">
              {saving ? '...' : 'Valider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PAGE PRINCIPALE ──────────────────────────────────────────
type SortKey = 'nom' | 'classe' | 'dejaPaye' | 'restant' | 'status';

export const Eleves: React.FC = () => {
  const students = useStore((s) => s.students);
  const deleteStudent = useStore((s) => s.deleteStudent);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const filterClasse = useStore((s) => s.filterClasse);
  const setFilterClasse = useStore((s) => s.setFilterClasse);
  const filterCycle = useStore((s) => s.filterCycle);
  const setFilterCycle = useStore((s) => s.setFilterCycle);
  const filterStatus = useStore((s) => s.filterStatus);
  const setFilterStatus = useStore((s) => s.setFilterStatus);
  const selectedStudent = useStore((s) => s.selectedStudent);
  const setSelectedStudent = useStore((s) => s.setSelectedStudent);
  const schoolName = useStore((s) => s.schoolName);
  const schoolLogo = useStore((s) => s.schoolLogo);
  const schoolStamp = useStore((s) => s.schoolStamp);
  const schoolYear = useStore((s) => s.schoolYear);
  const messageRemerciement = useStore((s) => s.messageRemerciement);
  const messageRappel = useStore((s) => s.messageRappel);
  const user = useStore((s) => s.user);

  const [modal, setModal] = useState<{ open: boolean; student?: Student | null }>({ open: false });
  const [photoModal, setPhotoModal] = useState<{ open: boolean; student: Student | null }>({ open: false, student: null });
  const updateStudent = useStore((s) => s.updateStudent);
  const [sortKey, setSortKey] = useState<SortKey>('nom');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let list = [...students];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        (s.nom || '').toLowerCase().includes(q) ||
        (s.prenom || '').toLowerCase().includes(q) ||
        (s.classe || '').toLowerCase().includes(q) ||
        (s.telephone || '').includes(q)
      );
    }
    if (filterClasse) list = list.filter((s) => s.classe === filterClasse);
    if (filterCycle) list = list.filter((s) => s.cycle === filterCycle);
    if (filterStatus) list = list.filter((s) => s.status === filterStatus);

    list.sort((a, b) => {
      const va = String(a[sortKey] ?? '').toLowerCase();
      const vb = String(b[sortKey] ?? '').toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [students, searchQuery, filterClasse, filterCycle, filterStatus, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-amber-500" /> : <ChevronDown className="w-3 h-3 text-amber-500" />) : <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />;

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) { deleteStudent(id); setDeleteConfirm(null); }
    else setDeleteConfirm(id);
  };

  const classes = [...new Set(CLASS_CONFIG.map((c) => c.name))];

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-slideUp">
      
      {/* HEADER */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <Users className="w-64 h-64 text-amber-500" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                <GraduationCap className="w-3.5 h-3.5" /> Effectif
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Registre des <span className="text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-amber-600">Élèves</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Gérez les inscriptions, consultez les fiches individuelles et suivez les statuts financiers.
            </p>
          </div>
          
          {(user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'comptable') && (
            <button 
              onClick={() => setModal({ open: true })} 
              className="group relative inline-flex items-center gap-2 px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[13px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,0,0,0.2)] dark:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <Plus className="w-4 h-4 text-amber-500" /> Nouvelle Inscription
            </button>
          )}
        </div>
      </div>

      {/* BARRE D'OUTILS */}
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl p-4 rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white"
              placeholder="Rechercher par nom, prénom, classe ou téléphone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors" onClick={() => setSearchQuery('')}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowFilters((f) => !f)} 
            className={`flex items-center justify-center gap-2 px-6 py-4 border rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all ${
              showFilters 
                ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-amber-500/50'
            }`}
          >
            <Filter className="w-4 h-4" /> Filtres Avancés
          </button>
        </div>

        {/* FILTRES ÉTENDUS */}
        <div className={`grid transition-all duration-300 ease-in-out overflow-hidden ${showFilters ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="min-h-0 flex flex-wrap gap-4 pt-1">
            <select className="flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all cursor-pointer" value={filterCycle} onChange={(e) => setFilterCycle(e.target.value)}>
              <option value="">Tous les cycles</option>
              <option>Primaire</option><option>Collège</option><option>Lycée</option>
            </select>
            <select className="flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all cursor-pointer" value={filterClasse} onChange={(e) => setFilterClasse(e.target.value)}>
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-[13px] font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all cursor-pointer" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Tous les statuts financiers</option>
              <option>Soldé</option><option>Partiel</option><option>Non soldé</option>
            </select>
            {(filterClasse || filterCycle || filterStatus) && (
              <button onClick={() => { setFilterClasse(''); setFilterCycle(''); setFilterStatus(''); }} className="flex items-center gap-2 px-6 py-4 text-[12px] font-black uppercase tracking-widest text-rose-500 hover:text-white hover:bg-rose-500 rounded-2xl transition-all border border-rose-200 dark:border-rose-500/30">
                <X className="w-4 h-4" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{filtered.length} dossier{filtered.length > 1 ? 's' : ''} sur {students.length}</p>
        {filtered.length > 0 && (
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
            Perçu : <strong className="text-emerald-500">{new Intl.NumberFormat('fr-FR').format(filtered.reduce((a, s) => a + s.dejaPaye, 0))} FCFA</strong>
          </p>
        )}
      </div>

      {/* TABLEAU */}
      <div className="pro-card overflow-hidden bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                {[
                  { key: 'nom' as SortKey, label: 'Identité Élève' },
                  { key: 'classe' as SortKey, label: 'Classe & Cycle' },
                  { key: null, label: 'Contact Parent' },
                  { key: 'dejaPaye' as SortKey, label: 'Paiements' },
                  { key: 'restant' as SortKey, label: 'Reste' },
                  { key: 'status' as SortKey, label: 'Statut' },
                  { key: null, label: 'Actions' },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`group px-6 py-4 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-slate-900 dark:hover:text-white select-none transition-colors' : ''}`}
                    onClick={() => col.key && toggleSort(col.key)}
                  >
                    <span className="flex items-center gap-2">
                      {col.label}
                      {col.key && <SortIcon k={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                       <User className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                       <p className="text-sm font-black text-slate-500 tracking-tight">Aucun dossier correspondant</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="group/row hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setPhotoModal({ open: true, student: s })}
                          className="relative group shrink-0"
                          title={s.photoUrl ? 'Modifier la photo' : 'Ajouter une photo'}
                        >
                          {s.photoUrl ? (
                            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm transition-transform group-hover:scale-105">
                               <img src={s.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all group-hover:border-amber-400 group-hover:bg-amber-50 dark:group-hover:bg-amber-900/30 text-slate-400">
                              <User className="w-5 h-5 opacity-50 group-hover:hidden" />
                              <Camera className="w-5 h-5 text-amber-500 hidden group-hover:block" />
                            </div>
                          )}
                          {s.photoUrl && (
                            <div className="absolute inset-0 bg-slate-900/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                              <Camera className="w-5 h-5 text-white" />
                            </div>
                          )}
                          {s.photoUrl && (
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
                          )}
                        </button>
                        <div>
                          <p className="font-black text-base text-slate-900 dark:text-white tracking-tight">{s.prenom} {s.nom}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">{s.sexe === 'M' ? 'Garçon' : 'Fille'}</span>
                            {s.redoublant && <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded">Redoublant</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2.5 py-1 rounded-lg bg-amber-100/50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-black text-xs tracking-wide">{s.classe}</span>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">{s.cycle}</p>
                    </td>
                    <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">{s.telephone}</span>
                    </td>
                    <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{fmtMoney(s.dejaPaye)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {s.restant <= 0 ? <span className="text-[10px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-md uppercase tracking-widest">OK</span> : <span className="font-black text-rose-600 dark:text-rose-400">{fmtMoney(s.restant)}</span>}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 opacity-50 group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => setSelectedStudent(s)} className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400 transition-all hover:scale-110" title="Dossier complet">
                          <FileText className="w-4 h-4" />
                        </button>
                        <button onClick={() => generateRecuPDF(s, schoolName, schoolYear, messageRemerciement, messageRappel, schoolLogo || undefined, schoolStamp || undefined)} className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 transition-all hover:scale-110" title="Générer le reçu">
                          <Download className="w-4 h-4" />
                        </button>
                        <WhatsAppBtn student={s} schoolName={schoolName} />
                        {(user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'comptable') && (
                          <>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                            <button onClick={() => setModal({ open: true, student: s })} className="p-2 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 transition-all hover:scale-110" title="Modifier">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(s.id)} className={`p-2 rounded-xl transition-all hover:scale-110 ${deleteConfirm === s.id ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-500 dark:text-rose-400'}`} title={deleteConfirm === s.id ? 'Cliquer pour confirmer la suppression' : 'Supprimer'}>
                              {deleteConfirm === s.id ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-900/30 flex flex-wrap gap-6 items-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Écolage Total Attendu</span>
              <span className="font-black text-slate-700 dark:text-slate-300">{new Intl.NumberFormat('fr-FR').format(filtered.reduce((a, s) => a + s.ecolage, 0))} F</span>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total Perçu</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">{new Intl.NumberFormat('fr-FR').format(filtered.reduce((a, s) => a + s.dejaPaye, 0))} F</span>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Reste à recouvrer</span>
              <span className="font-black text-rose-600 dark:text-rose-400">{new Intl.NumberFormat('fr-FR').format(filtered.reduce((a, s) => a + s.restant, 0))} F</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100/50 dark:bg-emerald-500/10 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{filtered.filter((s) => s.status === 'Soldé').length} Soldés</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-100/50 dark:bg-rose-500/10 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{filtered.filter((s) => s.status !== 'Soldé').length} En attente</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {modal.open && <StudentModal student={modal.student} onClose={() => setModal({ open: false })} />}
      {photoModal.open && photoModal.student && (
        <PhotoModal 
          student={photoModal.student} 
          onClose={() => setPhotoModal({ open: false, student: null })} 
          onSave={async (b64) => {
            const uploadedUrl = await uploadStudentPhoto(photoModal.student!.id, b64);
            updateStudent(photoModal.student!.id, { photoUrl: uploadedUrl || b64 });
          }}
          onDelete={async () => {
            await deleteStudentPhoto(photoModal.student!.id);
            updateStudent(photoModal.student!.id, { photoUrl: undefined });
          }}
        />
      )}

      {/* Fiche détaillée */}
      {selectedStudent && (
        <StudentDetail
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
};
