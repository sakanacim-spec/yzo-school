import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Student } from '../types';
import { generateRecuPDF, generateClassePDF, generateNonSoldesPDF } from '../utils/pdfGenerator';
import { exportToExcel } from '../utils/excelExport';
import {
  FileText, Download, Users, AlertTriangle,
  CheckCircle, MessageCircle, BookOpen, Printer, FileDown,
  Layers, X
} from 'lucide-react';

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' F';

// Badge dynamique
const DynamicBadge: React.FC<{ student: Student }> = ({ student }) => {
  const taux = student.ecolage > 0 ? student.dejaPaye / student.ecolage : 0;
  if (student.restant <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100/50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-200/50 dark:border-emerald-500/20">
        <CheckCircle className="w-3.5 h-3.5" /> Parent Responsable
      </span>
    );
  }
  if (taux >= 0.7) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200/50 dark:border-amber-500/20">
        <span className="font-bold text-amber-500">≥70%</span> Tranche Validée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-100/50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-200/50 dark:border-rose-500/20">
      <AlertTriangle className="w-3.5 h-3.5" /> En Attente
    </span>
  );
};

// Carte élève
const StudentCard: React.FC<{ student: Student; schoolName: string; schoolYear: string; msgRem: string; msgRap: string; schoolLogo?: string; schoolStamp?: string }> = ({
  student, schoolName, schoolYear, msgRem, msgRap, schoolLogo, schoolStamp
}) => {
  const taux = Math.round((student.dejaPaye / student.ecolage) * 100);
  const phone = (student.telephone || '').replace(/\D/g, '');
  const waMsg = student.restant <= 0
    ? `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). ${msgRem} — ${schoolName}`
    : `Bonjour, parent de ${student.prenom} ${student.nom} (${student.classe}). Restant : ${fmtMoney(student.restant)}. ${msgRap} — ${schoolName}`;

  return (
    <div className="group relative bg-white/50 dark:bg-slate-800/30 backdrop-blur-md rounded-[2rem] border border-slate-100 dark:border-slate-800/60 p-6 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/20 dark:hover:shadow-black/20 hover:border-slate-200 dark:hover:border-slate-700 flex flex-col h-full overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-slate-100 dark:from-slate-800 to-transparent opacity-50 rounded-bl-full pointer-events-none -z-10"></div>
      
      <div className="flex-1">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="font-black text-lg text-slate-900 dark:text-white tracking-tight leading-tight">{student.prenom} {student.nom}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{student.classe} · {student.cycle}</p>
          </div>
          <DynamicBadge student={student} />
        </div>

        <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50 mb-5">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Écolage</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{new Intl.NumberFormat('fr-FR').format(student.ecolage)} F</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700/50 pl-3">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Payé</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{new Intl.NumberFormat('fr-FR').format(student.dejaPaye)} F</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700/50 pl-3">
              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Restant</span>
              <span className={`font-black text-sm ${student.restant <= 0 ? 'text-emerald-500' : 'text-rose-600 dark:text-rose-400'}`}>
                {student.restant <= 0 ? 'OK' : `${new Intl.NumberFormat('fr-FR').format(student.restant)} F`}
              </span>
            </div>
        </div>

        <div className="mb-2">
            <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progression</span>
                <span className="text-xs font-black text-slate-600 dark:text-slate-300">{taux}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ${taux >= 100 ? 'bg-emerald-500' : taux >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${taux}%` }} 
                />
            </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/60">
        <button
          onClick={() => generateRecuPDF(student, schoolName, schoolYear, msgRem, msgRap, schoolLogo, schoolStamp)}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500 dark:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
        >
          <Printer className="w-4 h-4" /> Imprimer
        </button>
        <a
          href={`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white dark:bg-emerald-500/10 dark:hover:bg-emerald-500 dark:text-emerald-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp
        </a>
      </div>
    </div>
  );
};

export const Documents: React.FC = () => {
  const students            = useStore((s) => s.students);
  const schoolName          = useStore((s) => s.schoolName);
  const schoolYear          = useStore((s) => s.schoolYear);
  const messageRemerciement = useStore((s) => s.messageRemerciement);
  const messageRappel       = useStore((s) => s.messageRappel);
  const schoolLogo          = useStore((s) => s.schoolLogo);
  const schoolStamp         = useStore((s) => s.schoolStamp);

  const [filterClasse, setFilterClasse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [generating, setGenerating]     = useState(false);

  const cycleOrder = { 'Primaire': 1, 'Collège': 2, 'Lycée': 3 };
  const classes = [...new Set(students.map((s) => s.classe))]
    .sort((a, b) => {
      const sA = students.find((s) => s.classe === a);
      const sB = students.find((s) => s.classe === b);
      const cA = cycleOrder[sA?.cycle as keyof typeof cycleOrder] || 0;
      const cB = cycleOrder[sB?.cycle as keyof typeof cycleOrder] || 0;
      return cA - cB || a.localeCompare(b);
    });

  const filtered = students
    .filter((s) => !filterClasse || s.classe === filterClasse)
    .filter((s) => !filterStatus || s.status === filterStatus);

  const nonSoldes = students.filter((s) => s.status !== 'Soldé');

  const handleGenereClasse = async (classe: string) => {
    setGenerating(true);
    const cls = students.filter((s) => s.classe === classe);
    await generateClassePDF(cls, classe, schoolName, schoolYear, messageRemerciement, messageRappel, schoolLogo ?? undefined, schoolStamp ?? undefined);
    setGenerating(false);
  };

  const handleGenereNonSoldes = async () => {
    setGenerating(true);
    await generateNonSoldesPDF(nonSoldes, schoolName, schoolYear, messageRappel, schoolLogo ?? undefined, schoolStamp ?? undefined);
    setGenerating(false);
  };

  const handleExportExcel = () => {
    exportToExcel(students, `export_${schoolYear}`);
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
        <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6">
            <FileText className="w-10 h-10 text-slate-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Centre de Documents</h2>
        <p className="text-sm font-medium text-slate-500">Importez des élèves depuis le registre pour générer des documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-slideUp">
      
      {/* ── HEADER ── */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-indigo-100 dark:border-indigo-900/30">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <FileText className="w-64 h-64 text-indigo-500" />
        </div>
        
        <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                <Layers className="w-3.5 h-3.5" /> Édition & Exports
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Centre de <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-indigo-600">Documents</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Générez des rapports par classe, éditez des listes de recouvrement et exportez vos données en Excel.
            </p>
        </div>
      </div>

      {/* ── ACTIONS DE MASSE ── */}
      <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">Générations de masse</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {classes.filter((c) => students.some((s) => s.classe === c)).map((classe) => (
            <button
              key={classe}
              onClick={() => handleGenereClasse(classe)}
              disabled={generating}
              className="group flex flex-col items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:hover:border-slate-200"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="text-center">
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200">{classe}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{students.filter((s) => s.classe === classe).length} inscrits</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleGenereNonSoldes}
            disabled={generating || nonSoldes.length === 0}
            className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-4 bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white dark:bg-rose-500/10 dark:hover:bg-rose-500 dark:text-rose-400 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:hover:bg-rose-50"
          >
            <AlertTriangle className="w-4 h-4" />
            Rapports Impayés ({nonSoldes.length})
          </button>
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-4 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white dark:bg-emerald-500/10 dark:hover:bg-emerald-500 dark:text-emerald-400 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all"
          >
            <FileDown className="w-4 h-4" />
            Exporter Base de Données
          </button>
        </div>
        
        {generating && (
          <div className="mt-6 flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 animate-pulse">
            <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Génération PDF en cours...</span>
          </div>
        )}
      </div>

      {/* ── DOCUMENTS INDIVIDUELS ── */}
      <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                    <Printer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">Reçus Individuels</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <select 
                  className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-[12px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white cursor-pointer" 
                  value={filterClasse} 
                  onChange={(e) => setFilterClasse(e.target.value)}
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select 
                  className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-[12px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white cursor-pointer" 
                  value={filterStatus} 
                  onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                <option>Soldé</option>
                <option>Partiel</option>
                <option>Non soldé</option>
              </select>
              {(filterClasse || filterStatus) && (
                <button 
                  onClick={() => { setFilterClasse(''); setFilterStatus(''); }} 
                  className="p-3 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-colors"
                  title="Réinitialiser"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
        </div>

        <div className="mb-4 px-2 flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filtered.length} fiches disponibles</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
          {filtered.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              schoolName={schoolName}
              schoolYear={schoolYear}
              msgRem={messageRemerciement}
              msgRap={messageRappel}
              schoolLogo={schoolLogo ?? undefined}
              schoolStamp={schoolStamp ?? undefined}
            />
          ))}
          {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                  <p className="text-sm font-bold text-slate-500">Aucune fiche ne correspond à ces critères.</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
