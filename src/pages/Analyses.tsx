import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { TrendingUp, AlertTriangle, Target, Award, Eye, EyeOff, Activity, ShieldAlert, BarChart2, GraduationCap, Medal, AlertCircle, BookOpen } from 'lucide-react';
import { computeCycleComparison, computeAcademicAnalytics } from '../services/analyticsService';
import { formatMontant } from '../utils/helpers';

const MoneyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) => {
  const privacyMode = useStore(s => s.privacyMode);
  const currency = useStore(s => s.currency);
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-900/90 shadow-2xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
      <p className="font-black text-slate-800 dark:text-slate-100 mb-3">{label}</p>
      <div className="space-y-2">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.name === 'paye' || p.name === 'Payé' ? '#10b981' : '#f43f5e' }} />
              <span className="font-bold text-slate-600 dark:text-slate-300 capitalize">{p.name}</span>
            </div>
            <span className="font-black text-slate-900 dark:text-white">
              {privacyMode ? '•••••••' : formatMontant(p.value, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PieMoneyTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  const privacyMode = useStore(s => s.privacyMode);
  const currency = useStore(s => s.currency);
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-900/90 shadow-2xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
      <p className="font-black text-slate-800 dark:text-slate-100 mb-1">{payload[0].name}</p>
      <p className="text-amber-600 font-bold">{privacyMode ? '•••••••' : formatMontant(payload[0].value, currency)}</p>
    </div>
  );
};

const SingleValueTooltip = ({ active, payload, isScore = false }: { active?: boolean; payload?: any[], isScore?: boolean }) => {
  const privacyMode = useStore(s => s.privacyMode);
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-900/90 shadow-2xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
      <p className="font-black text-slate-800 dark:text-slate-100 mb-1">{payload[0].payload.cycle || payload[0].payload.classe || payload[0].name}</p>
      <p className="text-indigo-600 font-bold">
        {privacyMode && !isScore ? '•••••••' : isScore ? `${payload[0].value}/20` : `${payload[0].value}%`}
      </p>
    </div>
  );
};

const COLORS = ['#1e40af', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export const Analyses: React.FC = () => {
  const students = useStore((s) => s.students);
  const classes = useStore((s) => s.classes) || [];
  const notes = useStore((s) => s.notes) || [];
  const expenses = useStore((s) => s.expenses) || [];
  const privacyMode = useStore((s) => s.privacyMode);
  const setPrivacyMode = useStore((s) => s.setPrivacyMode);
  const currency = useStore((s) => s.currency);

  const [activeTab, setActiveTab] = useState<'finance' | 'academie'>('finance');

  const maskValue = (val: string | number) => privacyMode ? '•••••••' : val;

  // --- DONNEES FINANCIERES ---
  const classData = useMemo(() => {
    return classes.map((c) => {
      const cls = students.filter((s) => s.classe === c.name);
      if (!cls.length) return null;
      const ecolageTotal = cls.reduce((a, s) => a + s.ecolage, 0);
      const paye         = cls.reduce((a, s) => a + s.dejaPaye, 0);
      const restant      = cls.reduce((a, s) => a + s.restant, 0);
      const taux         = ecolageTotal > 0 ? Math.round((paye / ecolageTotal) * 100) : 0;
      const soldes       = cls.filter((s) => s.status === 'Soldé').length;
      return {
        classe: c.name,
        cycle: c.cycle,
        effectif: cls.length,
        ecolageTotal,
        paye,
        restant,
        taux,
        soldes,
        nonSoldes: cls.length - soldes,
      };
    }).filter(Boolean) as {
      classe: string; cycle: string; effectif: number;
      ecolageTotal: number; paye: number; restant: number;
      taux: number; soldes: number; nonSoldes: number;
    }[];
  }, [students, classes]);

  const cycleComparison = useMemo(() => computeCycleComparison(students), [students]);

  const cyclePieData = useMemo(() => {
    return cycleComparison.map(c => ({ name: c.cycle, value: c.totalEncaisse }));
  }, [cycleComparison]);

  const totalEcolage  = students.reduce((a, s) => a + s.ecolage, 0);
  const totalPaye     = students.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant  = students.reduce((a, s) => a + s.restant, 0);
  const tauxGlobal    = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;

  const totalDepenses = expenses.reduce((a, e) => a + e.montant, 0);
  const beneficeNet   = totalPaye - totalDepenses;

  const retards = students.filter((s) => {
    const taux = s.ecolage > 0 ? s.dejaPaye / s.ecolage : 0;
    return s.status !== 'Soldé' && taux < 0.3;
  });

  const radarData = useMemo(() => cycleComparison.map((c) => ({ cycle: c.cycle, taux: c.taux })), [cycleComparison]);

  // --- DONNEES ACADEMIQUES ---
  const academicData = useMemo(() => computeAcademicAnalytics(students, notes), [students, notes]);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fadeIn">
        <div className="w-32 h-32 bg-amber-500/10 dark:bg-amber-500/5 rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.2)]">
          <Activity className="w-16 h-16 text-amber-500 animate-pulse" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">Aucune donnée à analyser</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto px-4 text-base leading-relaxed">
          Importez des élèves depuis la section Élèves pour activer les capacités d'analyse financière et académique.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-slideUp">
      
      {/* 🚀 HEADER & TABS */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <BarChart2 className="w-64 h-64 text-amber-500" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Statistiques & <span className="text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-amber-600">Analyses</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Intelligence artificielle et modélisation des données de l'établissement
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-full sm:w-auto">
                <button
                    onClick={() => setActiveTab('finance')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold rounded-xl transition-all ${
                        activeTab === 'finance' 
                            ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <BarChart2 className="w-4 h-4" /> Finance
                </button>
                <button
                    onClick={() => setActiveTab('academie')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold rounded-xl transition-all ${
                        activeTab === 'academie' 
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <GraduationCap className="w-4 h-4" /> Académie
                </button>
            </div>

            <button
                onClick={() => setPrivacyMode(!privacyMode)}
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl hover:border-amber-500 transition-all font-black text-[13px] tracking-wide shadow-md active:scale-95"
            >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${privacyMode ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-slate-100 dark:bg-slate-700'}`}>
                {privacyMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </div>
                CONFIDENTIEL
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'finance' && (
        <div className="space-y-6 animate-fadeIn">
            {/* ✨ KPIs FINANCE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {[
                { label: 'Revenus Encaissés', value: maskValue(formatMontant(totalPaye, currency)), colors: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-500/20' }, icon: <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> },
                { label: 'Dépenses Totales', value: maskValue(formatMontant(totalDepenses, currency)), colors: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-500/20' }, icon: <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" /> },
                { label: 'Bénéfice Net', value: maskValue(formatMontant(beneficeNet, currency)), colors: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-500/20' }, icon: <Award className="w-6 h-6 text-amber-600 dark:text-amber-400" /> },
                { label: 'Taux Recouvrement', value: maskValue(`${tauxGlobal}%`), colors: { text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-500/20' }, icon: <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" /> },
                { label: 'À Recouvrer', value: maskValue(formatMontant(totalRestant, currency)), colors: { text: 'text-fuchsia-700 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', border: 'border-fuchsia-500/20' }, icon: <ShieldAlert className="w-6 h-6 text-fuchsia-600 dark:text-fuchsia-400" /> },
                { label: 'Potentiel Total', value: maskValue(formatMontant(totalEcolage, currency)), colors: { text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', border: 'border-violet-500/20' }, icon: <BarChart2 className="w-6 h-6 text-violet-600 dark:text-violet-400" /> },
                ].map((k, idx) => (
                <div key={k.label} className={`pro-card p-6 ${k.colors.bg} ${k.colors.border} relative overflow-hidden group hover:-translate-y-1 transition-all duration-300`} style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity bg-current ${k.colors.text}`} />
                    <div className="relative z-10 flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{k.label}</p>
                    <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shadow-sm group-hover:scale-110 transition-transform`}>
                        {k.icon}
                    </div>
                    </div>
                    <p className={`text-3xl font-black tracking-tighter ${k.colors.text}`}>{k.value}</p>
                </div>
                ))}
            </div>

            {/* 💰 BAR CHART */}
            <div className="pro-card p-8">
                <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Revenus par classe</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Montants encaissés vs restants ({currency})</p>
                </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                <BarChart data={classData} barCategoryGap="20%" barGap={4} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.5} />
                    <XAxis dataKey="classe" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dy={10} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip cursor={{ fill: 'transparent' }} content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                    <Bar dataKey="paye" name="Payé" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="restant" name="Restant" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 💰 RADAR CHART */}
                <div className="pro-card p-8 flex flex-col items-center">
                    <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight w-full mb-1">Performance Cycles</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest w-full mb-8">Taux de recouvrement %</p>
                    <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="cycle" tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                        <Tooltip content={<SingleValueTooltip />} />
                        <Radar name="Taux" dataKey="taux" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* 💰 PIE CHART */}
                <div className="pro-card p-8 flex flex-col items-center">
                    <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight w-full mb-1">Répartition Revenus</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest w-full mb-8">Part de chaque cycle</p>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                        <Pie data={cyclePieData} innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value" stroke="none">
                            {cyclePieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<PieMoneyTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 💰 CRITICAL ALERTS */}
            {retards.length > 0 && (
                <div className="pro-card p-8 bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/50">
                <h3 className="font-black text-rose-700 dark:text-rose-400 text-xl tracking-tight mb-2 flex items-center gap-3">
                    <div className="p-3 bg-rose-100 dark:bg-rose-500/20 rounded-xl">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                    </div>
                    Détection Automatique — Retards Critiques ({retards.length})
                </h3>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-6 ml-14">Élèves ayant payé moins de 30%</p>
                
                <div className="overflow-x-auto custom-scrollbar pb-4 ml-0 lg:ml-14">
                    <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-rose-200 dark:border-rose-800/50">
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Élève</th>
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Classe</th>
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Payé</th>
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Restant</th>
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Taux</th>
                        <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Contact</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 dark:divide-rose-800/30">
                        {retards.slice(0, 10).map((s) => {
                        const t = Math.round((s.dejaPaye / s.ecolage) * 100);
                        return (
                            <tr key={s.id} className="hover:bg-rose-100/50 dark:hover:bg-rose-500/10 transition-colors">
                            <td className="px-4 py-3 font-black text-slate-800 dark:text-white whitespace-nowrap">{s.prenom} {s.nom}</td>
                            <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.classe}</td>
                            <td className="px-4 py-3 font-black text-emerald-600 whitespace-nowrap">{maskValue(formatMontant(s.dejaPaye, currency))}</td>
                            <td className="px-4 py-3 font-black text-rose-600 whitespace-nowrap">{maskValue(formatMontant(s.restant, currency))}</td>
                            <td className="px-4 py-3"><span className="px-2.5 py-1 rounded-lg bg-rose-200/50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 font-black text-[10px]">{maskValue(`${t}%`)}</span></td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{maskValue(s.telephone)}</td>
                            </tr>
                        );
                        })}
                    </tbody>
                    </table>
                </div>
                {retards.length > 10 && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-4 ml-14 text-center">… et {retards.length - 10} autres élèves masqués</p>}
                </div>
            )}

            {/* 💰 FORECAST */}
            <div className="pro-card p-8">
                <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-6 flex items-center gap-3">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                </div>
                Prévisions & Trésorerie
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-indigo-50/80 dark:bg-indigo-500/10 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-500/20 transition-transform hover:-translate-y-1">
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Potentiel Maximum</p>
                    <p className="text-3xl font-black text-indigo-900 dark:text-indigo-400 tracking-tighter mb-1">{maskValue(formatMontant(totalEcolage, currency))}</p>
                    <p className="text-[11px] font-bold text-indigo-400">Si 100% du recouvrement est atteint</p>
                </div>
                <div className="bg-emerald-50/80 dark:bg-emerald-500/10 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-500/20 transition-transform hover:-translate-y-1">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Situation Réelle ({maskValue(tauxGlobal)}%)</p>
                    <p className="text-3xl font-black text-emerald-900 dark:text-emerald-400 tracking-tighter mb-1">{maskValue(formatMontant(totalPaye, currency))}</p>
                    <p className="text-[11px] font-bold text-emerald-400">Total encaissé de façon effective</p>
                </div>
                <div className="bg-amber-50/80 dark:bg-amber-500/10 rounded-2xl p-6 border border-amber-100 dark:border-amber-500/20 transition-transform hover:-translate-y-1">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Déficit Objectif</p>
                    <p className="text-3xl font-black text-amber-900 dark:text-amber-400 tracking-tighter mb-1">{maskValue(100 - tauxGlobal)}%</p>
                    <p className="text-[11px] font-bold text-amber-500">Soit {maskValue(formatMontant(totalRestant, currency))} en attente</p>
                </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'academie' && (
        <div className="space-y-6 animate-fadeIn">
            {/* 🎓 KPIs ACADEMIE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="pro-card p-6 bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-800/10 border-indigo-200 dark:border-indigo-800/30 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Taux de réussite global</p>
                        <p className="text-4xl font-black text-indigo-900 dark:text-indigo-400 tracking-tighter">{academicData.tauxReussite}%</p>
                        <p className="text-xs font-bold text-indigo-600/70 mt-1">Moyenne &ge; 10/20</p>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-indigo-200/50 dark:bg-indigo-800/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <GraduationCap className="w-8 h-8" />
                    </div>
                </div>

                <div className="pro-card p-6 bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-900/20 dark:to-violet-800/10 border-violet-200 dark:border-violet-800/30 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-1">Moyenne de l'établissement</p>
                        <p className="text-4xl font-black text-violet-900 dark:text-violet-400 tracking-tighter">{academicData.moyenneGenerale}<span className="text-lg text-violet-600/50">/20</span></p>
                        <p className="text-xs font-bold text-violet-600/70 mt-1">Toutes classes confondues</p>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-violet-200/50 dark:bg-violet-800/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                        <BookOpen className="w-8 h-8" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 🎓 BAR CHART - Moyennes par classe */}
                <div className="lg:col-span-2 pro-card p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Performances par classe</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Moyennes générales (/20)</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={academicData.classAverages} barCategoryGap="30%" margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.5} />
                            <XAxis dataKey="classe" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dy={10} />
                            <YAxis domain={[0, 20]} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dx={-10} />
                            <Tooltip cursor={{ fill: 'transparent' }} content={<SingleValueTooltip isScore />} />
                            <Bar dataKey="moyenne" name="Moyenne" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                {academicData.classAverages.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.moyenne >= 10 ? '#8b5cf6' : '#f43f5e'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* 🎓 TABLEAU D'HONNEUR (TOP 5) */}
                <div className="pro-card p-0 overflow-hidden flex flex-col">
                    <div className="bg-amber-500 p-6 text-white text-center">
                        <Medal className="w-10 h-10 mx-auto mb-2 drop-shadow-md text-amber-100" />
                        <h3 className="font-black text-xl tracking-tight drop-shadow-md">Tableau d'Honneur</h3>
                        <p className="text-xs font-bold text-amber-100 uppercase tracking-widest mt-1">Les 5 meilleurs élèves</p>
                    </div>
                    <div className="flex-1 p-4 bg-white dark:bg-slate-900">
                        {academicData.top5.length === 0 ? (
                            <p className="text-center text-slate-400 font-bold mt-10">Aucune note saisie.</p>
                        ) : (
                            <ul className="space-y-3">
                                {academicData.top5.map((s, idx) => (
                                    <li key={s.student.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900 dark:text-white truncate">{s.student.prenom} {s.student.nom}</p>
                                            <p className="text-xs text-slate-500 font-medium">{s.student.classe}</p>
                                        </div>
                                        <div className="font-black text-indigo-600 dark:text-indigo-400 text-lg">
                                            {s.moyenne.toFixed(2)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* 🎓 ALERTES ACADEMIQUES */}
            {academicData.alertes.length > 0 && (
                <div className="pro-card p-8 bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/50">
                    <h3 className="font-black text-rose-700 dark:text-rose-400 text-xl tracking-tight mb-2 flex items-center gap-3">
                        <div className="p-3 bg-rose-100 dark:bg-rose-500/20 rounded-xl">
                            <AlertCircle className="w-5 h-5 animate-pulse" />
                        </div>
                        Détection Décrochage — Élèves en difficulté ({academicData.alertes.length})
                    </h3>
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-6 ml-14">Moyenne générale inférieure à 8/20</p>
                    
                    <div className="overflow-x-auto custom-scrollbar pb-4 ml-0 lg:ml-14">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-rose-200 dark:border-rose-800/50">
                                    <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Élève</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Classe</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Moyenne Actuelle</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest">Contact Parent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-100 dark:divide-rose-800/30">
                                {academicData.alertes.slice(0, 10).map((s) => (
                                    <tr key={s.student.id} className="hover:bg-rose-100/50 dark:hover:bg-rose-500/10 transition-colors">
                                        <td className="px-4 py-3 font-black text-slate-800 dark:text-white whitespace-nowrap">{s.student.prenom} {s.student.nom}</td>
                                        <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.student.classe}</td>
                                        <td className="px-4 py-3"><span className="px-3 py-1 rounded-lg bg-rose-500 text-white font-black text-[11px]">{s.moyenne.toFixed(2)}/20</span></td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{maskValue(s.student.telephone)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      )}

    </div>
  );
};
