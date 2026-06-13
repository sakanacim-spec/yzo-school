import { useStore } from '../store/useStore';
import { calculateDashboardStats, calculateClassStats, formatMontant } from '../utils/helpers';
import { 
  Users, 
  GraduationCap, 
  Wallet, 
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  BookOpen
} from 'lucide-react';
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
  Cell
} from 'recharts';

export const Dashboard = () => {
  const students = useStore((state) => state.students);
  const stats = calculateDashboardStats(students);
  const classStats = calculateClassStats(students);

  const cycleData = [
    { name: 'Primaire', value: stats.totalPrimaire, color: '#22c55e' },
    { name: 'Collège', value: stats.totalCollege, color: '#3b82f6' },
    { name: 'Lycée', value: stats.totalLycee, color: '#1e3a5f' }
  ].filter(d => d.value > 0);

  const statusData = [
    { name: 'Soldés', value: stats.elevesSoldes, color: '#22c55e' },
    { name: 'Non Soldés', value: stats.elevesNonSoldes, color: '#ef4444' }
  ];

  const topClasses = [...classStats]
    .sort((a, b) => b.tauxRecouvrement - a.tauxRecouvrement)
    .slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tableau de bord</h1>
          <p className="text-gray-500">Vue d'ensemble de la gestion financière</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        <StatCard
          icon={Users}
          label="Total Élèves"
          value={stats.totalEleves.toString()}
          subtext={`P:${stats.totalPrimaire} | C:${stats.totalCollege} | L:${stats.totalLycee}`}
          color="blue"
        />
        <StatCard
          icon={Wallet}
          label="Écolage Attendu"
          value={formatMontant(stats.totalEcolageAttendu)}
          subtext="Total des frais de scolarité"
          color="slate"
        />
        <StatCard
          icon={CheckCircle2}
          label="Montant Payé"
          value={formatMontant(stats.totalDejaPaye)}
          subtext={`${stats.elevesSoldes} élèves soldés`}
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Taux de Recouvrement"
          value={`${stats.tauxRecouvrement}%`}
          subtext={`Reste: ${formatMontant(stats.totalRestant)}`}
          color="emerald"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Bar Chart - Recouvrement par classe */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Taux de recouvrement par classe
          </h3>
          {topClasses.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topClasses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="classe" tick={{ fontSize: 11 }} />
                <YAxis unit="%" />
                <Tooltip 
                  formatter={(value) => [`${value}%`, 'Taux']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="tauxRecouvrement" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              <p>Aucune donnée disponible</p>
            </div>
          )}
        </div>

        {/* Pie Charts */}
        <div className="space-y-4 sm:space-y-6">
          {/* Répartition par cycle */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <GraduationCap className="w-5 h-5" />
              Par cycle
            </h3>
            {cycleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={cycleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {cycleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-gray-400 text-sm">
                Aucune donnée
              </div>
            )}
          </div>

          {/* Statut paiement */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Statut paiements
            </h3>
            {stats.totalEleves > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-gray-400 text-sm">
                Aucune donnée
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Class Rankings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 hover:shadow-md transition-shadow overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Classement des classes (par taux de recouvrement)
        </h3>
        {classStats.length > 0 ? (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 -mx-4 sm:-mx-6 sm:mx-0">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Rang</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Classe</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Cycle</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600">Effectif</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">Attendu</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">Payé</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">Restant</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600">Taux</th>
                </tr>
              </thead>
              <tbody>
                {[...classStats]
                  .sort((a, b) => b.tauxRecouvrement - a.tauxRecouvrement)
                  .map((c, i) => (
                    <tr key={c.classe} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-yellow-400 text-yellow-900' :
                          i === 1 ? 'bg-gray-300 text-gray-700' :
                          i === 2 ? 'bg-orange-400 text-orange-900' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">{c.classe}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          c.cycle === 'Primaire' ? 'bg-green-100 text-green-700' :
                          c.cycle === 'Collège' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {c.cycle}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">{c.effectif}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{formatMontant(c.ecolageTotal)}</td>
                      <td className="py-3 px-4 text-right text-green-600 font-medium">{formatMontant(c.paye)}</td>
                      <td className="py-3 px-4 text-right text-red-500">{formatMontant(c.restant)}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                c.tauxRecouvrement >= 80 ? 'bg-green-500' :
                                c.tauxRecouvrement >= 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${c.tauxRecouvrement}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{c.tauxRecouvrement}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">
            Aucun élève enregistré. Importez des données pour voir les statistiques.
          </p>
        )}
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext: string;
  color: 'blue' | 'green' | 'slate' | 'emerald';
}

const StatCard = ({ icon: Icon, label, value, subtext, color }: StatCardProps) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-900',
    green: 'bg-green-50 text-green-700',
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700'
  };

  const iconColors = {
    blue: 'bg-blue-900 text-white',
    green: 'bg-green-500 text-white',
    slate: 'bg-slate-600 text-white',
    emerald: 'bg-emerald-500 text-white'
  };

  return (
    <div className={`${colorClasses[color]} rounded-2xl p-5 md:p-6 border border-opacity-20 shadow-sm hover:shadow-md transition-all duration-200`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm font-semibold opacity-75 uppercase tracking-wide">{label}</p>
          <p className="text-xl md:text-2xl font-bold mt-2">{value}</p>
          <p className="text-xs md:text-sm mt-2 opacity-60 line-clamp-2">{subtext}</p>
        </div>
        <div className={`w-11 h-11 md:w-12 md:h-12 ${iconColors[color]} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon className="w-5 h-5 md:w-6 md:h-6" />
        </div>
      </div>
    </div>
  );
};
