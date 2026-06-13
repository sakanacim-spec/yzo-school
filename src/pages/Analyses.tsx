import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { CLASS_CONFIG } from '../data/classConfig';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { TrendingUp, AlertTriangle, Target, Award, Eye, EyeOff, Activity, ShieldAlert, BarChart2 } from 'lucide-react';
import { computeCycleComparison } from '../services/analyticsService';

const MoneyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) => {
  const privacyMode = useStore(s => s.privacyMode);
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
              {privacyMode ? '••••••' : new Intl.NumberFormat('fr-FR').format(p.value)} FCFA
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PieMoneyTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  const privacyMode = useStore(s => s.privacyMode);
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-900/90 shadow-2xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
      <p className="font-black text-slate-800 dark:text-slate-100 mb-1">{payload[0].name}</p>
      <p className="text-amber-600 font-bold">{privacyMode ? '••••••' : new Intl.NumberFormat('fr-FR').format(payload[0].value)} FCFA</p>
    </div>
  );
};

const SingleValueTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  const privacyMode = useStore(s => s.privacyMode);
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-900/90 shadow-2xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
      <p className="font-black text-slate-800 dark:text-slate-100 mb-1">{payload[0].payload.cycle || payload[0].name}</p>
      <p className="text-indigo-600 font-bold">{privacyMode ? '••••••' : `${payload[0].value}%`}</p>
    </div>
  );
};

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const COLORS = ['#1e40af', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export const Analyses: React.FC = () => {
  const students = useStore((s) => s.students);
  const privacyMode = useStore((s) => s.privacyMode);
  const setPrivacyMode = useStore((s) => s.setPrivacyMode);

  const maskValue = (val: string | number) => privacyMode ? '••••••' : val;

  const classData = useMemo(() => {
    return CLASS_CONFIG.map((c) => {
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
  }, [students]);

  const cycleComparison = useMemo(() => computeCycleComparison(students), [students]);

  const cyclePieData = useMemo(() => {
    return cycleComparison.map(c => ({ name: c.cycle, value: c.totalEncaisse }));
  }, [cycleComparison]);

  const topClasses = [...classData].sort((a, b) => b.taux - a.taux);

  const totalEcolage  = students.reduce((a, s) => a + s.ecolage, 0);
  const totalPaye     = students.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant  = students.reduce((a, s) => a + s.restant, 0);
  const tauxGlobal    = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;

  const retards = students.filter((s) => {
    const taux = s.ecolage > 0 ? s.dejaPaye / s.ecolage : 0;
    return s.status !== 'Soldé' && taux < 0.3;
  });

  const radarData = useMemo(() => cycleComparison.map((c) => ({ cycle: c.cycle, taux: c.taux })), [cycleComparison]);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fadeIn">
        <div className="w-32 h-32 bg-amber-500/10 dark:bg-amber-500/5 rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.2)]">
          <Activity className="w-16 h-16 text-amber-500 animate-pulse" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">Aucune donnée à analyser</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto px-4 text-base leading-relaxed">
          Importez des élèves depuis la section Élèves pour activer les capacités d'analyse financière.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-slideUp">
      
      {/* ── HEADER ── */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <BarChart2 className="w-64 h-64 text-amber-500" />
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Analyse <span className="text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-amber-600">Financière</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Intelligence artificielle et modélisation des données de recouvrement
            </p>
          </div>
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl hover:border-amber-500 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] font-black text-[13px] tracking-wide shadow-md active:scale-95 hover:scale-105 group"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${privacyMode ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-slate-100 dark:bg-slate-700'}`}>
              {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            MODE CONFIDENTIEL
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { label: 'Taux Recouvrement', value: maskValue(`${tauxGlobal}%`), colors: { text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-500/20' }, icon: <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" /> },
          { label: 'Revenus Encaissés', value: maskValue(`${fmtMoney(totalPaye)} F`), colors: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-500/20' }, icon: <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> },
          { label: 'À Recouvrer', value: maskValue(`${fmtMoney(totalRestant)} F`), colors: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-500/20' }, icon: <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" /> },
          { label: 'Potentiel Total', value: maskValue(`${fmtMoney(totalEcolage)} F`), colors: { text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', border: 'border-violet-500/20' }, icon: <Award className="w-6 h-6 text-violet-600 dark:text-violet-400" /> },
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

      {/* ── BAR CHART ── */}
      <div className="pro-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Revenus par classe</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Montants encaissés vs restants (FCFA)</p>
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

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="pro-card p-8 flex flex-col">
          <div className="mb-8">
            <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Répartition des revenus</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Montants encaissés (FCFA)</p>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cyclePieData} cx="50%" cy="45%" outerRadius={110} innerRadius={70} dataKey="value" paddingAngle={5} stroke="none">
                  {cyclePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className="hover:opacity-80 transition-opacity outline-none" />)}
                </Pie>
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                <Tooltip content={<PieMoneyTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="pro-card p-8 flex flex-col">
          <div className="mb-8">
            <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Solvabilité par cycle</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Taux de recouvrement (%)</p>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="cycle" tick={{ fontSize: 12, fontWeight: 900, fill: '#475569' }} />
                <Radar
                  name="Taux de recouvrement"
                  dataKey="taux"
                  stroke="#1e40af"
                  strokeWidth={3}
                  fill="#1e40af"
                  fillOpacity={0.3}
                  className="drop-shadow-lg"
                />
                <Tooltip content={<SingleValueTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="pro-card p-8">
        <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-6 flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-xl">
            <Award className="w-5 h-5" />
          </div>
          Classement Solvabilité
        </h3>
        <div className="overflow-x-auto custom-scrollbar pb-4">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">#</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Classe</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Cycle</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Effectif</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Payé</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Restant</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Taux</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Soldés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {topClasses.map((c, i) => (
                <tr key={c.classe} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-4 py-3">
                    <span className={`w-8 h-8 rounded-[0.75rem] flex items-center justify-center text-xs font-black shadow-sm ${
                      i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white' :
                      i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                      i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-black text-slate-800 dark:text-white whitespace-nowrap">{c.classe}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-widest ${
                      c.cycle === 'Primaire' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                      c.cycle === 'Collège'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                    }`}>{c.cycle}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-500">{maskValue(c.effectif)}</td>
                  <td className="px-4 py-3 font-black text-emerald-600 whitespace-nowrap">{maskValue(fmtMoney(c.paye))} F</td>
                  <td className="px-4 py-3 font-black text-rose-500 whitespace-nowrap">{maskValue(fmtMoney(c.restant))} F</td>
                  <td className="px-4 py-3 min-w-[150px]">
                    <div className="flex items-center gap-3">
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-1000" 
                          style={{ width: `${c.taux}%`, background: c.taux >= 80 ? '#10b981' : c.taux >= 50 ? '#f59e0b' : '#f43f5e' }} 
                        />
                      </div>
                      <span className={`text-xs font-black ${c.taux >= 80 ? 'text-emerald-600' : c.taux >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{maskValue(`${c.taux}%`)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-500 whitespace-nowrap">
                    <span className="text-emerald-600">{privacyMode ? '••' : c.soldes}</span> <span className="text-slate-300 mx-1">/</span> {privacyMode ? '••' : c.effectif}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CRITICAL ALERTS ── */}
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
                      <td className="px-4 py-3 font-black text-emerald-600 whitespace-nowrap">{maskValue(fmtMoney(s.dejaPaye))} F</td>
                      <td className="px-4 py-3 font-black text-rose-600 whitespace-nowrap">{maskValue(fmtMoney(s.restant))} F</td>
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

      {/* ── FORECAST ── */}
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
            <p className="text-3xl font-black text-indigo-900 dark:text-indigo-400 tracking-tighter mb-1">{maskValue(fmtMoney(totalEcolage))} F</p>
            <p className="text-[11px] font-bold text-indigo-400">Si 100% du recouvrement est atteint</p>
          </div>
          <div className="bg-emerald-50/80 dark:bg-emerald-500/10 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-500/20 transition-transform hover:-translate-y-1">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Situation Réelle ({maskValue(tauxGlobal)}%)</p>
            <p className="text-3xl font-black text-emerald-900 dark:text-emerald-400 tracking-tighter mb-1">{maskValue(fmtMoney(totalPaye))} F</p>
            <p className="text-[11px] font-bold text-emerald-400">Total encaissé de façon effective</p>
          </div>
          <div className="bg-amber-50/80 dark:bg-amber-500/10 rounded-2xl p-6 border border-amber-100 dark:border-amber-500/20 transition-transform hover:-translate-y-1">
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Déficit Objectif</p>
            <p className="text-3xl font-black text-amber-900 dark:text-amber-400 tracking-tighter mb-1">{maskValue(100 - tauxGlobal)}%</p>
            <p className="text-[11px] font-bold text-amber-500">Soit {maskValue(fmtMoney(totalRestant))} FCFA en attente</p>
          </div>
        </div>
      </div>

    </div>
  );
};
