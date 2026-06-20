import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Student } from '../types';

import { generateRecuPDF } from '../utils/pdfGenerator';
import { uploadStudentPhoto, deleteStudentPhoto } from '../services/photoService';
import { COUNTRIES } from '../data/countries';
import {
  Search, Plus, Trash2, Edit2, FileText,
  MessageCircle, ChevronUp, ChevronDown, ChevronRight, X, Check,
  Download, Filter, Camera, User, Users, GraduationCap, Building2, Smartphone, Phone, School, Wallet
} from 'lucide-react';
import { StudentDetail } from '../components/StudentDetail';
import { formatMontant } from '../utils/helpers';

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
  const currency = useStore((s) => s.currency);
  const addPayment = useStore((s) => s.addPayment);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

  const classes = useStore((s) => s.classes) || [];
  const [form, setForm] = useState({
    nom: student?.nom ?? '',
    prenom: student?.prenom ?? '',
    classe: student?.classe ?? (classes.length > 0 ? classes[0].name : ''),
    ecolage: student?.ecolage ?? (classes.length > 0 ? classes[0].ecolage : 0),
    telephone: student?.telephone ?? '',
    sexe: (student?.sexe ?? 'M') as 'M' | 'F',
    estRedoublant: student?.redoublant ?? false,
    ecoleProvenance: student?.ecoleProvenance ?? '',
    montantPaye: 0,
    recuAssociatif: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalStep === 1) {
      setModalStep(2);
      return;
    }
    
    const baseStudent = {
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      classe: form.classe,
      ecolage: form.ecolage,
      sexe: form.sexe as 'M' | 'F',
      telephone: form.telephone || '',
      ecoleProvenance: form.ecoleProvenance || '',
      redoublant: form.estRedoublant,
      dejaPaye: student ? student.dejaPaye : form.montantPaye,
      recu: student ? student.recu : form.recuAssociatif
    };
    
    if (student) {
      updateStudent(student.id, baseStudent);
      if (form.montantPaye > 0) {
        addPayment(student.id, { montant: form.montantPaye, date: new Date().toISOString(), recu: form.recuAssociatif, mode: 'ESPECES', commentaire: 'Scolarité' });
      }
    } else {
      const studentId = addStudent(baseStudent);
      if (form.montantPaye > 0 && studentId) {
        addPayment(studentId, { montant: form.montantPaye, date: new Date().toISOString(), recu: form.recuAssociatif, mode: 'ESPECES', commentaire: 'Scolarité' });
      }
    }
    
    onClose();
  };

  return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
            
            <div className="px-8 py-6 border-b border-slate-100 bg-white relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-500 ${modalStep === 1 ? 'bg-amber-500 shadow-amber-500/30' : 'bg-blue-600 shadow-blue-600/30'}`}>
                  {modalStep === 1 ? <User className="w-6 h-6 text-white" /> : <GraduationCap className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                    {student ? 'Modifier l\'élève' : 'Nouvelle Inscription'}
                  </h3>
                  <p className="text-sm font-bold text-slate-400 mt-1">
                    Étape {modalStep} sur 2 : {modalStep === 1 ? 'Identité' : 'Scolarité & Finance'}
                  </p>
                </div>
              </div>
              <button onClick={() => onClose()} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full bg-slate-100 h-1">
              <div className={`h-full transition-all duration-500 ease-out ${modalStep === 1 ? 'w-1/2 bg-amber-500' : 'w-full bg-blue-600'}`}></div>
            </div>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
              <form id="student-form" onSubmit={handleSubmit} className="space-y-6">
                
                <div className={`space-y-6 transition-all duration-500 ${modalStep === 1 ? 'opacity-100 translate-x-0 block' : 'opacity-0 -translate-x-10 hidden'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <User className="w-3 h-3" /> Nom de l'élève *
                      </label>
                      <input required type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium" placeholder="Ex: DOSSOU" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <User className="w-3 h-3" /> Prénoms *
                      </label>
                      <input required type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium" placeholder="Ex: Jean Paul" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <User className="w-3 h-3" /> Sexe
                      </label>
                      <div className="relative">
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all appearance-none cursor-pointer" value={form.sexe} onChange={(e) => setForm({ ...form, sexe: e.target.value as 'M' | 'F' })}>
                          <option value="M">Masculin</option>
                          <option value="F">Féminin</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Phone className="w-3 h-3" /> Téléphone Parent
                      </label>
                      <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium" placeholder="Ex: +33 6 00 00 00 00" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className={`space-y-6 transition-all duration-500 ${modalStep === 2 ? 'opacity-100 translate-x-0 block' : 'opacity-0 translate-x-10 hidden'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                        Classe *
                      </label>
                      <div className="relative">
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer" 
                          value={form.classe} 
                          onChange={(e) => {
                            const newClasse = e.target.value;
                            const classDef = classes.find(c => c.name === newClasse);
                            setForm({ ...form, classe: newClasse, ecolage: classDef ? classDef.ecolage : form.ecolage });
                          }}>
                          {classes.map((c) => <option key={c.name} value={c.name}>{c.name} - {c.cycle} ({formatMontant(c.ecolage, currency)})</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                        Frais de scolarité à payer *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          required
                          value={form.ecolage}
                          onChange={(e) => setForm({ ...form, ecolage: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-12 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                          {currency}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <School className="w-3 h-3" /> École de provenance
                      </label>
                      <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] font-bold text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium" placeholder="Ex: EPL Les Génies" value={form.ecoleProvenance} onChange={(e) => setForm({ ...form, ecoleProvenance: e.target.value })} />
                    </div>
                  </div>

                  {!student && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-6 rounded-2xl relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-200/50 rounded-full blur-2xl pointer-events-none"></div>
                      <h4 className="text-[12px] font-black text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                        <Wallet className="w-4 h-4" /> Informations Financières (1er Versement)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-emerald-700/70 uppercase tracking-widest">Montant payé ({currency})</label>
                          <input type="number" min="0" className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-[15px] font-bold text-emerald-900 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" value={form.montantPaye} onChange={(e) => setForm({ ...form, montantPaye: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-emerald-700/70 uppercase tracking-widest">N° Reçu associé</label>
                          <input type="text" className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-[15px] font-bold text-emerald-900 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-emerald-300" placeholder="EX: R-001" value={form.recuAssociatif} onChange={(e) => setForm({ ...form, recuAssociatif: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" className="sr-only" checked={form.estRedoublant} onChange={(e) => setForm({ ...form, estRedoublant: e.target.checked })} />
                      <div className={`w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${form.estRedoublant ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-300 group-hover:border-amber-400'}`}>
                        {form.estRedoublant && <Check className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                    <span className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Élève redoublant</span>
                  </label>
                </div>
              </form>
            </div>

            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {modalStep === 2 ? (
                <button type="button" onClick={() => setModalStep(1)} className="px-6 py-3 text-[13px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors">
                  Retour
                </button>
              ) : <div></div>}
              
              <button type="submit" form="student-form" className={`px-8 py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 ${modalStep === 1 ? 'bg-slate-800 shadow-slate-800/20 hover:bg-slate-900' : 'bg-blue-600 shadow-blue-600/30 hover:bg-blue-700'}`}>
                {modalStep === 1 ? (
                  <>Continuer <ChevronRight className="w-4 h-4" /></>
                ) : (
                  <>{student ? 'Mettre à jour' : 'Inscrire l\'élève'} <Check className="w-4 h-4" /></>
                )}
              </button>
            </div>

          </div>
        </div>
  );
};

// ── Bouton WhatsApp ──────────────────────────────────────────
const WhatsAppBtn: React.FC<{ student: Student; schoolName: string }> = ({ student, schoolName }) => {
  const currency = useStore(s => s.currency);
  const taux = Math.round((student.dejaPaye / student.ecolage) * 100);
  const msg = student.restant <= 0
    ? `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). Nous vous felicitons d'avoir solde la scolarite (${formatMontant(student.ecolage, currency)}). Merci ! — ${schoolName}`
    : `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). Solde restant : ${formatMontant(student.restant, currency)} (paye : ${taux}%). Merci de regulariser. — ${schoolName}`;

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
  const classesList = useStore((s) => s.classes) || [];
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
  const currency = useStore((s) => s.currency);

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

  const classes = [...new Set(classesList.map(c => c.name))];

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
              <option value="Toutes">Toutes les classes</option>
              {classesList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
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
            Perçu : <strong className="text-emerald-500">{formatMontant(filtered.reduce((a, s) => a + s.dejaPaye, 0), currency)}</strong>
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
                    <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatMontant(s.dejaPaye, currency)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {s.restant <= 0 ? <span className="text-[10px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-md uppercase tracking-widest">OK</span> : <span className="font-black text-rose-600 dark:text-rose-400">{formatMontant(s.restant, currency)}</span>}
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
              <span className="font-black text-slate-700 dark:text-slate-300">{formatMontant(filtered.reduce((a, s) => a + s.ecolage, 0), currency)}</span>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total Perçu</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">{formatMontant(filtered.reduce((a, s) => a + s.dejaPaye, 0), currency)}</span>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Reste à recouvrer</span>
              <span className="font-black text-rose-600 dark:text-rose-400">{formatMontant(filtered.reduce((a, s) => a + s.restant, 0), currency)}</span>
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
