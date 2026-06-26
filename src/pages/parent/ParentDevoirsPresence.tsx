import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BookOpen, UserCheck, Calendar, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const ParentDevoirsPresence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'devoirs' | 'presence'>('devoirs');
  
  const user = useStore(s => s.user);
  const students = useStore(s => s.students);
  const devoirs = useStore(s => s.devoirs) || [];
  const presences = useStore(s => s.presences) || [];
  
  const myChildren = useMemo(() => {
    return students.filter(s => s.parentId === user?.id || s.telephone === user?.username);
  }, [students, user]);

  const [selectedChildId, setSelectedChildId] = useState(myChildren[0]?.id || '');

  const selectedChild = myChildren.find(c => c.id === selectedChildId);

  const childDevoirs = useMemo(() => {
    if (!selectedChild) return [];
    return devoirs.filter(d => d.classe === selectedChild.classe).sort((a,b) => new Date(b.dateDonnee).getTime() - new Date(a.dateDonnee).getTime());
  }, [devoirs, selectedChild]);

  const childPresences = useMemo(() => {
    if (!selectedChildId) return [];
    return presences.filter(p => p.eleveId === selectedChildId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [presences, selectedChildId]);

  if (!user || user.role !== 'parent') {
    return <div className="p-8 text-center">Acc\u00e8s r\u00e9serv\u00e9 aux parents.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white">Devoirs & Pr\u00e9sences</h1>
          <p className="text-slate-500">Suivez le travail \u00e0 la maison et l'assiduit\u00e9 de vos enfants.</p>
        </div>
        
        {myChildren.length > 1 && (
          <select 
            value={selectedChildId} 
            onChange={e => setSelectedChildId(e.target.value)}
            className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold border-none rounded-xl"
          >
            {myChildren.map(c => (
              <option key={c.id} value={c.id}>{c.nom} {c.prenom}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 pb-px">
        <button
          onClick={() => setActiveTab('devoirs')}
          className={`pb-4 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'devoirs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen className="w-4 h-4 inline-block mr-2" />
          Travail \u00e0 faire
        </button>
        <button
          onClick={() => setActiveTab('presence')}
          className={`pb-4 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'presence' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <UserCheck className="w-4 h-4 inline-block mr-2" />
          Assiduit\u00e9 & Retards
        </button>
      </div>

      {activeTab === 'devoirs' && (
        <div className="space-y-4">
          {childDevoirs.map(d => {
            const isLate = new Date(d.dateRendu) < new Date(new Date().toISOString().split('T')[0]);
            return (
              <div key={d.id} className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-black">{d.matiere}</span>
                      <span className="text-xs font-bold text-slate-400">Par {d.professeurNom}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">{d.description}</p>
                  </div>
                  <div className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${isLate ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                    <Calendar className="w-4 h-4" /> 
                    \u00c0 rendre le {format(new Date(d.dateRendu), 'dd MMM yyyy', {locale: fr})}
                  </div>
                </div>
              </div>
            );
          })}
          {childDevoirs.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
              <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Aucun devoir</h3>
              <p className="text-sm text-slate-500">Aucun travail \u00e0 la maison n'est enregistr\u00e9 pour le moment.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'presence' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          {childPresences.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Heure</th>
                  <th className="px-6 py-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {childPresences.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">{format(new Date(p.date), 'EEEE dd MMMM', {locale: fr})}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{p.heure.slice(0, 5)}</td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                        p.statut === 'present' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 
                        p.statut === 'absent' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' : 
                        'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                      }`}>
                        {p.statut === 'present' && <CheckCircle2 className="w-4 h-4" />}
                        {p.statut === 'absent' && <XCircle className="w-4 h-4" />}
                        {p.statut === 'retard' && <Clock className="w-4 h-4" />}
                        {p.statut.toUpperCase()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Assiduit\u00e9 parfaite</h3>
              <p className="text-sm text-slate-500">Aucune absence ni retard enregistr\u00e9 pour cet enfant.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
