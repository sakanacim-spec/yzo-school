import React, { useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { isBackendAvailable } from '../services/backendSync';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { 
  Users, TrendingUp, Wallet, AlertCircle, CheckCircle, School, BookOpen, 
  GraduationCap, Target, ArrowUpRight, BarChart2, UserCheck, FileText, Eye, EyeOff 
} from 'lucide-react';
import { CLASS_CONFIG } from '../data/classConfig';
import {
  computeRecouvrement,
  computeClassComparison,
  computeSanteFinanciere,
  computeCycleComparison
} from '../services/analyticsService';
import { generateRapportMensuelPDF } from '@/utils/reportGenerator';
import { DashboardSkeleton } from '../components/SkeletonLoaders';

const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const PIE_COLORS = ['#f59e0b', '#10b981', '#f43f5e'];
const BAR_COLORS = { paye: '#10b981', restant: '#f43f5e' };

interface StatCardProps {
  title: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; trend?: string; delay?: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, sub, icon, color, trend, delay = 0 }) => (
  <div 
    className="pro-card relative group p-6 overflow-hidden animate-slideUp"
    style={{ animationDelay: `${delay}ms` }}
  >
    {/* Subtle gradient background for depth */}
    <div className={`absolute -right-12 -top-12 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700 ${color}`} />
    
    <div className="relative z-10 flex items-start justify-between">
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">{title}</p>
        <div>
           <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</p>
           {sub && <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
        </div>
        {trend && (
           <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 w-fit mt-2 border border-emerald-500/10 shadow-[0_2px_10px_rgba(16,185,129,0.1)]">
              <ArrowUpRight className="w-3 h-3" />
              <p className="text-[10px] font-black tracking-wide">{trend}</p>
           </div>
        )}
      </div>
      <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center shadow-lg border border-white/20 backdrop-blur-md group-hover:scale-110 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${color}`}>
        {icon}
      </div>
    </div>
  </div>
);

const CustomTooltip: React.FC<{ active?: boolean; payload?: { name: string; value: number }[]; label?: string }> = ({ active, payload, label }) => {
  const privacyMode = useStore(s => s.privacyMode);
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/90 dark:bg-slate-900/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-[20px] border border-slate-200/50 dark:border-slate-700/50 p-4 text-xs backdrop-blur-xl">
        <p className="font-bold text-slate-800 dark:text-slate-100 mb-3">{label}</p>
        <div className="space-y-2">
          {payload.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.name === 'Payé' ? BAR_COLORS.paye : BAR_COLORS.restant }} />
                <span className="font-bold text-slate-600 dark:text-slate-300">{p.name}</span>
              </div>
              <span className="font-black text-slate-900 dark:text-white">
                {privacyMode ? '••••••' : fmtMoney(p.value)} FCFA
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC = () => {
  const students = useStore((s) => s.students);
  const user = useStore((s) => s.user);
  const getPresencesToday = useStore((s) => s.getPresencesToday);
  const isSyncing = useStore((s) => s.isSyncing);
  const privacyMode = useStore((s) => s.privacyMode);
  const setPrivacyMode = useStore((s) => s.setPrivacyMode);

  const maskValue = (val: string | number) => privacyMode ? '••••••' : val;

  const todayPresences = useMemo(() => getPresencesToday(), [getPresencesToday]);
  const tauxPresence = students.length > 0 ? Math.round((todayPresences.length / students.length) * 100) : 0;

  useEffect(() => {
    const roles = ['admin', 'directeur', 'directeur_general', 'comptable'];
    if (user?.role && roles.includes(user.role)) {
      const initSync = async () => {
        const available = await isBackendAvailable();
        if (available) {
          const fetchAllFromBackend = useStore.getState().fetchAllFromBackend;
          await fetchAllFromBackend();
        }
      };
      initSync();
    }
  }, []);

  const recouvrement = useMemo(() => computeRecouvrement(students), [students]);
  const classComp = useMemo(() => computeClassComparison(students), [students]);
  const santeFinanciere = useMemo(() => computeSanteFinanciere(students), [students]);
  const cycleComparison = useMemo(() => computeCycleComparison(students), [students]);

  useEffect(() => {
    if (students.length === 0 || classComp.length === 0) return;
    
    const now = new Date();
    const day = now.getDate();
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const lastReportMonth = useStore.getState().lastReportMonth;
    
    if (day >= 5 && lastReportMonth !== currentMonthKey) {
      setTimeout(() => {
        generateRapportMensuelPDF(students, classComp, { 
          name: useStore.getState().schoolName || useStore.getState().appName, 
          logo: useStore.getState().schoolLogo,
          stamp: useStore.getState().schoolStamp
        });
        useStore.getState().setLastReportMonth(currentMonthKey);
      }, 2000);
    }
  }, [students, classComp]);

  const stats = useMemo(() => {
    const primaire = students.filter((s) => s.cycle === 'Primaire');
    const college = students.filter((s) => s.cycle === 'Collège');
    const lycee = students.filter((s) => s.cycle === 'Lycée');

    const cycleStat = (arr: typeof students) => ({
      count: arr.length,
      ecolage: arr.reduce((a, s) => a + s.ecolage, 0),
      paye: arr.reduce((a, s) => a + s.dejaPaye, 0),
      restant: arr.reduce((a, s) => a + s.restant, 0),
      soldes: arr.filter((s) => s.status === 'Soldé').length,
      taux: arr.length > 0
        ? Math.round((arr.reduce((a, s) => a + s.dejaPaye, 0) / arr.reduce((a, s) => a + s.ecolage, 0)) * 100)
        : 0,
    });

    const totalEcolage = students.reduce((a, s) => a + s.ecolage, 0);
    const totalPaye = students.reduce((a, s) => a + s.dejaPaye, 0);
    const totalRestant = students.reduce((a, s) => a + s.restant, 0);
    const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
    const soldes = students.filter((s) => s.status === 'Soldé').length;
    const nonSoldes = students.filter((s) => s.status !== 'Soldé').length;

    return {
      primaire: primaire.length, college: college.length, lycee: lycee.length,
      cycleStats: {
        Primaire: cycleStat(primaire),
        Collège: cycleStat(college),
        Lycée: cycleStat(lycee),
      },
      totalEcolage, totalPaye, totalRestant, taux, soldes, nonSoldes,
    };
  }, [students]);

  const classData = useMemo(() => {
    return CLASS_CONFIG.map((c) => {
      const cls = students.filter((s) => s.classe === c.name);
      return {
        classe: c.name,
        Payé: cls.reduce((a, s) => a + s.dejaPaye, 0),
        Restant: cls.reduce((a, s) => a + s.restant, 0),
        total: cls.length,
      };
    }).filter((c) => c.total > 0);
  }, [students]);

  const cycleData = [
    { name: 'Primaire', value: stats.primaire },
    { name: 'Collège', value: stats.college },
    { name: 'Lycée', value: stats.lycee },
  ].filter((d) => d.value > 0);

  const topClasses = useMemo(() => {
    return CLASS_CONFIG.map((c) => {
      const cls = students.filter((s) => s.classe === c.name);
      if (!cls.length) return null;
      const paye = cls.reduce((a, s) => a + s.dejaPaye, 0);
      const total = cls.reduce((a, s) => a + s.ecolage, 0);
      return { name: c.name, cycle: c.cycle, taux: total > 0 ? Math.round((paye / total) * 100) : 0, count: cls.length };
    }).filter(Boolean).sort((a, b) => (b?.taux ?? 0) - (a?.taux ?? 0)).slice(0, 5) as { name: string; cycle: string; taux: number; count: number }[];
  }, [students]);

  if (isSyncing && students.length === 0) {
    return <DashboardSkeleton />;
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fadeIn">
        <div className="w-32 h-32 bg-amber-500/10 dark:bg-amber-500/5 rounded-[32px] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.2)]">
          <GraduationCap className="w-16 h-16 text-amber-500 animate-bounce" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">Aucune donnée trouvée</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto px-4 text-base leading-relaxed">
          Importez un fichier Excel ou patientez si une synchronisation est en cours.
          Vérifiez que vous êtes bien connecté à internet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto">
      {/* ── HERO BANNER ── */}
      <div className="relative pro-card p-8 lg:p-10 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <TrendingUp className="w-64 h-64 text-amber-500" />
        </div>
        
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
            <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-6 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                    <Target className="w-3.5 h-3.5" /> Dashboard Stratégique
                </div>
                <h2 className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-4 leading-tight">
                    Vision & <span className="text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-amber-600">Performance</span>
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed font-medium max-w-xl">
                    Tableau de bord exécutif en temps réel : analysez le recouvrement, les projections financières et les performances globales par cycle.
                </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 xl:gap-6">
                <button 
                  onClick={() => generateRapportMensuelPDF(students, classComp, { 
                    name: useStore.getState().schoolName || useStore.getState().appName, 
                    logo: useStore.getState().schoolLogo,
                    stamp: useStore.getState().schoolStamp
                  })}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[20px] hover:scale-105 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] font-black text-[13px] tracking-wide shadow-xl hover:shadow-2xl active:scale-[0.98] group"
                >
                    <div className="w-8 h-8 rounded-full bg-white/20 dark:bg-slate-900/10 flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
                        <FileText className="w-4 h-4" />
                    </div>
                    RAPPORT MENSUEL
                </button>

                <button
                  onClick={() => setPrivacyMode(!privacyMode)}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-[20px] hover:border-amber-500 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] font-black text-[13px] tracking-wide shadow-md active:scale-[0.98] hover:scale-105 group"
                  title={privacyMode ? "Afficher les chiffres" : "Masquer les chiffres"}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${privacyMode ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </div>
                  MODE CONFIDENTIEL
                </button>

                <div className="w-full sm:w-auto flex items-center gap-5 bg-white/80 dark:bg-slate-800/80 px-6 py-4 rounded-[24px] border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-xl shadow-lg">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Santé Financière</p>
                        <p className={`text-xl font-black tracking-tight ${santeFinanciere.color}`}>
                            {maskValue(santeFinanciere.label)}
                        </p>
                    </div>
                    <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center border-[3px] shadow-lg ${
                        santeFinanciere.score >= 80 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' :
                        santeFinanciere.score >= 50 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-rose-500 bg-rose-50 text-rose-600'
                    }`}>
                        <span className="text-lg font-black tracking-tighter">
                            {maskValue(santeFinanciere.score)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* ── METRICS GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard
          delay={100}
          title="Total Élèves"
          value={maskValue(students.length)}
          sub={privacyMode ? 'Données masquées' : `${stats.soldes} soldés / ${stats.nonSoldes} non soldés`}
          icon={<Users className="w-6 h-6 text-amber-600" />}
          color="bg-amber-50/80 dark:bg-amber-900/20 border-amber-500/20"
        />
        <StatCard
          delay={200}
          title="Écolage Attendu"
          value={maskValue(`${fmtMoney(stats.totalEcolage)} F`)}
          sub="Total annuel"
          icon={<Wallet className="w-6 h-6 text-indigo-600" />}
          color="bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-500/20"
        />
        <StatCard
          delay={300}
          title="Déjà Perçu"
          value={maskValue(`${fmtMoney(stats.totalPaye)} F`)}
          sub="Paiements reçus"
          icon={<CheckCircle className="w-6 h-6 text-emerald-600" />}
          color="bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-500/20"
          trend={privacyMode ? undefined : `+${stats.taux}% recouvré`}
        />
        <StatCard
          delay={400}
          title="Solde Restant"
          value={maskValue(`${fmtMoney(stats.totalRestant)} F`)}
          sub="À recouvrer"
          icon={<AlertCircle className="w-6 h-6 text-rose-600" />}
          color="bg-rose-50/80 dark:bg-rose-900/20 border-rose-500/20"
        />
        <StatCard
          delay={500}
          title="Présences du Jour"
          value={maskValue(`${todayPresences.length} / ${students.length}`)}
          sub="Élèves pointés"
          icon={<UserCheck className="w-6 h-6 text-cyan-600" />}
          color="bg-cyan-50/80 dark:bg-cyan-900/20 border-cyan-500/20"
          trend={privacyMode ? undefined : `${tauxPresence}% de présence`}
        />
      </div>

      {/* ── RECOVERY BAR ── */}
      <div className="pro-card p-8 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight">Recouvrement Global</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Progression des encaissements sur l'année</p>
          </div>
          <div className="text-5xl font-black text-amber-500 dark:text-amber-400 tracking-tighter drop-shadow-sm">{maskValue(`${stats.taux}%`)}</div>
        </div>
        <div className="relative h-8 bg-slate-100/50 dark:bg-slate-800/50 rounded-full overflow-hidden shadow-inner p-1.5 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-amber-500 to-emerald-500 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-[0_0_20px_rgba(245,158,11,0.5)] relative overflow-hidden"
            style={{ width: `${stats.taux}%` }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)50%,rgba(255,255,255,0.2)75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]" />
          </div>
        </div>
        <div className="flex justify-between mt-4 text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">
          <span>Initial (0%)</span>
          <span className="text-slate-300">Seuil (50%)</span>
          <span>Objectif (100%)</span>
        </div>
      </div>

      {/* ── CYCLE ANALYSIS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {([
          {
            label: 'Primaire', sub: 'CI au CM2',
            icon: <School className="w-6 h-6 text-amber-600" />,
            colors: { border: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600', fill: 'bg-amber-500' },
            key: 'Primaire' as const,
          },
          {
            label: 'Collège', sub: '6ème au 3ème',
            icon: <BookOpen className="w-6 h-6 text-indigo-600" />,
            colors: { border: 'border-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600', fill: 'bg-indigo-500' },
            key: 'Collège' as const,
          },
          {
            label: 'Lycée', sub: 'Seconde à Terminale',
            icon: <GraduationCap className="w-6 h-6 text-rose-600" />,
            colors: { border: 'border-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600', fill: 'bg-rose-500' },
            key: 'Lycée' as const,
          },
        ] as const).map((c) => {
          const cs = stats.cycleStats[c.key];
          return (
            <div key={c.label} className={`pro-card p-8 border-t-4 border-t-transparent hover:border-t-${c.colors.fill.replace('bg-','')} transition-all duration-300 group`}>
              <div className="flex items-center gap-5 mb-8">
                <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center shadow-md ${c.colors.bg} group-hover:scale-110 transition-transform duration-500 ease-out`}>
                  {c.icon}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className={`text-2xl font-black tracking-tighter text-slate-900 dark:text-white`}>{c.label}</p>
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest truncate mt-0.5">{c.sub}</p>
                </div>
                <div className={`px-4 py-2 rounded-xl font-black text-xl bg-slate-50 dark:bg-slate-800 ${c.colors.text}`}>
                  {maskValue(cs.count)}
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Attendu</span>
                  <span className="font-black text-slate-900 dark:text-white">{maskValue(fmtMoney(cs.ecolage))} F</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Perçu</span>
                  <span className="font-black text-emerald-600">{maskValue(fmtMoney(cs.paye))} F</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-wide">Reste</span>
                  <span className="font-black text-rose-600">{maskValue(fmtMoney(cs.restant))} F</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-3">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Taux de recouvrement</span>
                  <span className={`text-xl font-black ${c.colors.text}`}>{maskValue(`${cs.taux}%`)}</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner p-0.5">
                  <div
                    className={`h-full ${c.colors.fill} rounded-full transition-all duration-1000 shadow-md relative overflow-hidden`}
                    style={{ width: `${cs.taux}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 w-full h-full -translate-x-full animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── CHARTS SECTION ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 pro-card p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Paiements par classe</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Distribution des montants (FCFA)</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-[16px]">
              <BarChart2 className="w-5 h-5 text-slate-400" />
            </div>
          </div>
          {classData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm font-bold bg-slate-50 dark:bg-slate-800/50 rounded-[20px]">Aucune donnée</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={classData} barCategoryGap="20%" barGap={4} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.5} />
                <XAxis dataKey="classe" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dy={10} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                <Bar dataKey="Payé" fill={BAR_COLORS.paye} radius={[6, 6, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Restant" fill={BAR_COLORS.restant} radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="pro-card p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-xl tracking-tight mb-1">Répartition</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Élèves par cycle</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-[16px]">
              <PieChart className="w-5 h-5 text-slate-400" />
            </div>
          </div>
          {cycleData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold bg-slate-50 dark:bg-slate-800/50 rounded-[20px]">Aucune donnée</div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={cycleData} 
                    cx="50%" cy="45%" 
                    outerRadius={110} innerRadius={70} 
                    dataKey="value" 
                    paddingAngle={5}
                    stroke="none"
                  >
                    {cycleData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="hover:opacity-80 transition-opacity outline-none" />)}
                  </Pie>
                  <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                  <Tooltip 
                    formatter={(value) => [`${value} élèves`, 'Total']} 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px', fontWeight: 900 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── TOP PERFORMERS & SOLVABILITY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pro-card p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-[16px]">
                <BarChart2 className="w-6 h-6" />
              </div>
              Top Performances
            </h3>
          </div>

          <div className="space-y-4">
            {classComp.slice(0, 5).map((row, i) => (
              <div key={row.classe} className="group flex items-center gap-5 p-4 rounded-[24px] bg-slate-50/50 dark:bg-slate-800/30 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:-translate-y-1">
                <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-black text-lg shadow-sm ${
                    i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' :
                    i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' :
                    i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-lg font-black text-slate-800 dark:text-white tracking-tight">{row.classe}</span>
                    <span className={`text-[11px] font-black px-3 py-1 rounded-lg ${
                        row.taux >= 85 ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400' : 'text-amber-700 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400'
                    }`}>{maskValue(`${row.taux}%`)}</span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 relative overflow-hidden ${row.taux >= 85 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${row.taux}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full h-full -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pro-card p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-[16px]">
                <Target className="w-6 h-6" />
              </div>
              Solvabilité / Cycle
            </h3>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={cycleComparison}>
                <PolarGrid stroke="#cbd5e1" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="cycle" tick={{ fontSize: 12, fontWeight: 900, fill: '#475569' }} />
                <Radar
                  name="Taux"
                  dataKey="taux"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  fill="#f59e0b"
                  fillOpacity={0.3}
                  className="drop-shadow-lg"
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px', fontWeight: 900 }}
                  formatter={(value) => [`${value}%`, 'Recouvrement']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
