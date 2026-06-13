import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { getCycleByClass } from '../data/classes';
import { TrendingUp, TrendingDown, DollarSign, PieChart as PieChartIcon, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Finance() {
  const { students, settings } = useStore();
  const formatMoney = (value: number) => new Intl.NumberFormat('fr-FR').format(value) + ' ' + (settings?.currency || 'FCFA');

  const cycleStats = useMemo(() => {
    const cycles = ['Primaire', 'Collège', 'Lycée'] as const;
    return cycles.map(cycle => {
      const cycleStudents = students.filter(s => getCycleByClass(s.classe) === cycle);
      const totalEcolage = cycleStudents.reduce((sum, s) => sum + s.ecolage, 0);
      const totalPaye = cycleStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
      return { cycle, eleves: cycleStudents.length, ecolage: totalEcolage, paye: totalPaye, restant: totalEcolage - totalPaye, taux: totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0 };
    });
  }, [students]);

  const classStats = useMemo(() => {
    const classMap = new Map<string, { ecolage: number; paye: number; eleves: number }>();
    students.forEach(s => {
      const current = classMap.get(s.classe) || { ecolage: 0, paye: 0, eleves: 0 };
      classMap.set(s.classe, { ecolage: current.ecolage + s.ecolage, paye: current.paye + s.dejaPaye, eleves: current.eleves + 1 });
    });
    return Array.from(classMap.entries()).map(([classe, data]) => ({ classe, ...data, restant: data.ecolage - data.paye, taux: data.ecolage > 0 ? Math.round((data.paye / data.ecolage) * 100) : 0 })).sort((a, b) => b.taux - a.taux);
  }, [students]);

  const pieData = useMemo(() => cycleStats.map((stat, index) => ({ name: stat.cycle, value: stat.paye, color: COLORS[index] })), [cycleStats]);
  const retardPaiement = useMemo(() => students.filter(s => s.restant > 0 && s.dejaPaye < s.ecolage * 0.3).sort((a, b) => b.restant - a.restant).slice(0, 10), [students]);
  const totalStats = useMemo(() => {
    const totalEcolage = students.reduce((sum, s) => sum + s.ecolage, 0);
    const totalPaye = students.reduce((sum, s) => sum + s.dejaPaye, 0);
    return { totalEcolage, totalPaye, totalRestant: totalEcolage - totalPaye, tauxGlobal: totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0 };
  }, [students]);

  if (students.length === 0) return (
    <div className="p-4 sm:p-6">
      <div className="card p-8 sm:p-12 text-center">
        <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <h2 className="text-lg sm:text-xl font-semibold text-gray-600">Aucune donnée financière</h2>
        <p className="text-gray-500 text-sm sm:text-base mt-2">Importez des élèves pour voir les analyses financières.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="page-header">
        <h1>Finance</h1>
        <p className="text-gray-500 text-sm sm:text-base">Vue d'ensemble des finances scolaires</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-6 sm:w-8 h-6 sm:h-8 opacity-80 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Total Attendu</p>
              <p className="text-lg sm:text-xl font-bold truncate">{formatMoney(totalStats.totalEcolage)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 sm:w-8 h-6 sm:h-8 opacity-80 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Total Perçu</p>
              <p className="text-lg sm:text-xl font-bold truncate">{formatMoney(totalStats.totalPaye)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-6 sm:w-8 h-6 sm:h-8 opacity-80 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Reste à Percevoir</p>
              <p className="text-lg sm:text-xl font-bold truncate">{formatMoney(totalStats.totalRestant)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 sm:p-5 text-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <PieChartIcon className="w-6 sm:w-8 h-6 sm:h-8 opacity-80 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm opacity-80 font-medium">Taux Global</p>
              <p className="text-lg sm:text-xl font-bold">{totalStats.tauxGlobal}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenus par Cycle */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-blue-600" />
              Revenus par Cycle
            </h3>
          </div>
          <div className="card-body p-3 sm:p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name }) => name}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value as number)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Détail par Cycle */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">Détail par Cycle</h3>
          </div>
          <div className="card-body space-y-3 sm:space-y-4">
            {cycleStats.map((stat, index) => (
              <div key={stat.cycle} className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index] }} />
                    <span className="font-medium text-sm sm:text-base">{stat.cycle}</span>
                    <span className="text-xs sm:text-sm text-gray-500">({stat.eleves} élèves)</span>
                  </div>
                  <span className="font-bold text-sm sm:text-base">{stat.taux}%</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-xs sm:text-sm mb-2">
                  <span className="text-green-600">Payé: {formatMoney(stat.paye)}</span>
                  <span className="text-red-600">Restant: {formatMoney(stat.restant)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${stat.taux}%`, backgroundColor: COLORS[index] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparaison par Classe */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Comparaison par Classe</h3>
        </div>
        <div className="card-body p-3 sm:p-6">
          <div className="h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="classe" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => [formatMoney(value as number), name === 'paye' ? 'Payé' : 'Restant']} />
                <Legend />
                <Bar dataKey="paye" name="Payé" fill="#10B981" stackId="a" radius={[0, 4, 4, 0]} />
                <Bar dataKey="restant" name="Restant" fill="#EF4444" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Retards de Paiement */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Retards de Paiement (moins de 30% payé)
          </h3>
        </div>
        <div className="card-body">
          {retardPaiement.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm sm:text-base">Aucun retard de paiement détecté</p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Élève</th>
                    <th className="text-left py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Classe</th>
                    <th className="text-right py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Écolage</th>
                    <th className="text-right py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Payé</th>
                    <th className="text-right py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Restant</th>
                    <th className="text-center py-3 px-3 sm:px-4 font-semibold text-gray-600 text-xs sm:text-sm">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {retardPaiement.map(student => (
                    <tr key={student.id} className="border-b border-gray-100 hover:bg-red-50/50 transition">
                      <td className="py-3 px-3 sm:px-4 font-medium text-sm">{student.nom} {student.prenom}</td>
                      <td className="py-3 px-3 sm:px-4 text-sm">{student.classe}</td>
                      <td className="py-3 px-3 sm:px-4 text-right text-sm">{formatMoney(student.ecolage)}</td>
                      <td className="py-3 px-3 sm:px-4 text-right text-green-600 text-sm">{formatMoney(student.dejaPaye)}</td>
                      <td className="py-3 px-3 sm:px-4 text-right text-red-600 font-bold text-sm">{formatMoney(student.restant)}</td>
                      <td className="py-3 px-3 sm:px-4 text-center">
                        <span className="badge-danger text-xs">{Math.round((student.dejaPaye / student.ecolage) * 100)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Prévision de Trésorerie */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Prévision de Trésorerie</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-blue-50 border border-blue-100 p-3 sm:p-4 rounded-lg text-center">
              <p className="text-xs sm:text-sm text-blue-600 mb-2">Si 50% des impayés règlent</p>
              <p className="text-lg sm:text-2xl font-bold text-blue-800">{formatMoney(totalStats.totalPaye + totalStats.totalRestant * 0.5)}</p>
            </div>
            <div className="bg-green-50 border border-green-100 p-3 sm:p-4 rounded-lg text-center">
              <p className="text-xs sm:text-sm text-green-600 mb-2">Si 75% des impayés règlent</p>
              <p className="text-lg sm:text-2xl font-bold text-green-800">{formatMoney(totalStats.totalPaye + totalStats.totalRestant * 0.75)}</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 p-3 sm:p-4 rounded-lg text-center">
              <p className="text-xs sm:text-sm text-purple-600 mb-2">Si 100% règlent</p>
              <p className="text-lg sm:text-2xl font-bold text-purple-800">{formatMoney(totalStats.totalEcolage)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
