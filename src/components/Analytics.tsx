import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatMontant, calculateClassStats, getStatusPaiement } from '../utils/helpers';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle,
  Target,
  Award,
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';

export const Analytics = () => {
  const { students, settings } = useStore();
  const classStats = calculateClassStats(students);

  // Données pour analyse par cycle
  const cycleAnalysis = useMemo(() => {
    const cycles = ['Primaire', 'Collège', 'Lycée'] as const;
    return cycles.map(cycle => {
      const cycleStudents = students.filter(s => s.cycle === cycle);
      const total = cycleStudents.reduce((sum, s) => sum + s.ecolage, 0);
      const paye = cycleStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
      const restant = cycleStudents.reduce((sum, s) => sum + s.restant, 0);
      return {
        cycle,
        effectif: cycleStudents.length,
        total,
        paye,
        restant,
        taux: total > 0 ? Math.round((paye / total) * 100) : 0
      };
    });
  }, [students]);

  // Répartition des statuts de paiement
  const statusDistribution = useMemo(() => {
    let solde = 0, trancheValidee = 0, tranchePartielle = 0, nonSolde = 0;
    
    students.forEach(s => {
      const status = getStatusPaiement(s, settings.seuilDeuxiemeTranche);
      switch (status) {
        case 'solde': solde++; break;
        case 'tranche_validee': trancheValidee++; break;
        case 'tranche_partielle': tranchePartielle++; break;
        case 'non_solde': nonSolde++; break;
      }
    });
    
    return [
      { name: 'Soldé', value: solde, color: '#22c55e' },
      { name: '2ème Tranche OK', value: trancheValidee, color: '#3b82f6' },
      { name: 'Partiel', value: tranchePartielle, color: '#f59e0b' },
      { name: 'Non soldé', value: nonSolde, color: '#ef4444' }
    ].filter(d => d.value > 0);
  }, [students, settings.seuilDeuxiemeTranche]);

  // Top 5 classes les plus solvables
  const topClasses = useMemo(() => {
    return [...classStats]
      .sort((a, b) => b.tauxRecouvrement - a.tauxRecouvrement)
      .slice(0, 5);
  }, [classStats]);

  // Classes avec retard de paiement (< 50%)
  const classesEnRetard = useMemo(() => {
    return classStats
      .filter(c => c.tauxRecouvrement < 50 && c.effectif > 0)
      .sort((a, b) => a.tauxRecouvrement - b.tauxRecouvrement);
  }, [classStats]);

  // Statistiques globales
  const globalStats = useMemo(() => {
    const totalAttendu = students.reduce((sum, s) => sum + s.ecolage, 0);
    const totalPaye = students.reduce((sum, s) => sum + s.dejaPaye, 0);
    const totalRestant = students.reduce((sum, s) => sum + s.restant, 0);
    const tauxActuel = totalAttendu > 0 ? (totalPaye / totalAttendu) * 100 : 0;
    return { totalAttendu, totalPaye, totalRestant, tauxActuel };
  }, [students]);

  // Données comparatives par classe
  const comparisonData = useMemo(() => {
    return classStats.map(c => ({
      classe: c.classe,
      attendu: c.ecolageTotal,
      paye: c.paye,
      taux: c.tauxRecouvrement
    }));
  }, [classStats]);

  if (students.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 sm:p-12 text-center">
          <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold text-gray-600">Aucune donnée à analyser</h2>
          <p className="text-gray-400 mt-2 text-sm sm:text-base">
            Importez des données ou ajoutez des élèves pour voir les analyses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="page-header">
        <h1>Analyses Financières</h1>
        <p className="text-gray-500 text-sm sm:text-base">Vue détaillée des performances de recouvrement</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Taux de recouvrement</p>
              <p className="text-2xl sm:text-3xl font-bold mt-1">{Math.round(globalStats.tauxActuel)}%</p>
            </div>
            <Target className="w-8 sm:w-10 h-8 sm:h-10 opacity-40 flex-shrink-0" />
          </div>
          <div className="mt-2 h-2 bg-blue-400 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full"
              style={{ width: `${globalStats.tauxActuel}%` }}
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Montant encaissé</p>
              <p className="text-xl sm:text-2xl font-bold mt-1">{formatMontant(globalStats.totalPaye)}</p>
            </div>
            <DollarSign className="w-8 sm:w-10 h-8 sm:h-10 opacity-40 flex-shrink-0" />
          </div>
          <p className="mt-2 text-xs sm:text-sm opacity-80 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
            sur {formatMontant(globalStats.totalAttendu)} attendus
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Reste à recouvrer</p>
              <p className="text-xl sm:text-2xl font-bold mt-1">{formatMontant(globalStats.totalRestant)}</p>
            </div>
            <AlertTriangle className="w-8 sm:w-10 h-8 sm:h-10 opacity-40 flex-shrink-0" />
          </div>
          <p className="mt-2 text-xs sm:text-sm opacity-80">
            {students.filter(s => s.restant > 0).length} élèves concernés
          </p>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenus par cycle */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-blue-600" />
              Revenus par cycle
            </h3>
          </div>
          <div className="card-body p-3 sm:p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cycleAnalysis} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="cycle" width={80} />
                <Tooltip 
                  formatter={(value) => formatMontant(Number(value) || 0)}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Bar dataKey="paye" name="Payé" fill="#22c55e" radius={[0, 4, 4, 0]} />
                <Bar dataKey="restant" name="Restant" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution des statuts */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-purple-600" />
              Distribution des statuts de paiement
            </h3>
          </div>
          <div className="card-body p-3 sm:p-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value, percent }) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Comparaison entre classes */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-green-600" />
            Comparaison des classes
          </h3>
        </div>
        <div className="card-body p-3 sm:p-6">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="classe" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value) => formatMontant(Number(value) || 0)}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Area type="monotone" dataKey="attendu" name="Attendu" stroke="#94a3b8" fill="#e2e8f0" />
              <Area type="monotone" dataKey="paye" name="Payé" stroke="#22c55e" fill="#bbf7d0" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top classes */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              Top 5 classes les plus solvables
            </h3>
          </div>
          <div className="card-body space-y-3">
            {topClasses.map((c, i) => (
              <div key={c.classe} className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition">
                <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                  i === 1 ? 'bg-gray-300 text-gray-700' :
                  i === 2 ? 'bg-orange-400 text-orange-900' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm sm:text-base truncate">{c.classe}</span>
                    <span className="text-green-600 font-bold text-xs sm:text-sm flex-shrink-0">{c.tauxRecouvrement}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${c.tauxRecouvrement}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Classes en retard */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              Classes en retard (&lt;50%)
            </h3>
          </div>
          <div className="card-body">
            {classesEnRetard.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm sm:text-base font-medium">Aucune classe en retard !</p>
                <p className="text-xs sm:text-sm">Toutes les classes ont un taux ≥50%</p>
              </div>
            ) : (
              <div className="space-y-3">
                {classesEnRetard.slice(0, 5).map((c) => (
                <div key={c.classe} className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition border border-red-100">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-medium text-sm sm:text-base truncate">{c.classe}</span>
                      <span className="text-red-600 font-bold text-xs sm:text-sm flex-shrink-0">{c.tauxRecouvrement}%</span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Reste: {formatMontant(c.restant)} ({c.effectif} élèves)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
