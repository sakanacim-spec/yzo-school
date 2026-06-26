import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BookOpen, UserCheck, Calendar, CheckCircle2, Clock, XCircle, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const CahierTextes: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'devoirs' | 'appel'>('devoirs');
  
  const user = useStore(s => s.user);
  const students = useStore(s => s.students);
  const devoirs = useStore(s => s.devoirs);
  const addDevoir = useStore(s => s.addDevoir);
  const deleteDevoir = useStore(s => s.deleteDevoir);
  const presences = useStore(s => s.presences);
  const addPresence = useStore(s => s.addPresence);
  const matieres = useStore(s => s.matieres);
  
  const personnel = useStore(s => s.personnel) || [];
  const prof = personnel.find(p => p.id === user?.id);
  const myAssignations = prof?.assignations || [];

  const [selectedClasse, setSelectedClasse] = useState(myAssignations[0]?.classe || '');
  const [selectedMatiereId, setSelectedMatiereId] = useState(myAssignations[0]?.matiereId || '');
  
  // Devoirs state
  const [desc, setDesc] = useState('');
  const [dateRendu, setDateRendu] = useState(new Date().toISOString().split('T')[0]);

  // Appel state
  const [appelDate, setAppelDate] = useState(new Date().toISOString().split('T')[0]);

  const classStudents = useMemo(() => students.filter(s => s.classe === selectedClasse).sort((a,b) => a.nom.localeCompare(b.nom)), [students, selectedClasse]);
  
  const myDevoirs = useMemo(() => (devoirs || []).filter(d => d.classe === selectedClasse).sort((a,b) => new Date(b.dateDonnee).getTime() - new Date(a.dateDonnee).getTime()), [devoirs, selectedClasse]);

  const handleAddDevoir = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !selectedClasse || !selectedMatiereId) return;
    const matiere = matieres.find(m => m.id === selectedMatiereId)?.nom || 'Inconnue';
    
    addDevoir({
      id: crypto.randomUUID(),
      dateDonnee: new Date().toISOString().split('T')[0],
      dateRendu,
      matiere,
      description: desc,
      classe: selectedClasse,
      professeurNom: user?.nom || 'Professeur'
    });
    setDesc('');
  };

  const markPresence = (studentId: string, statut: 'present' | 'absent' | 'retard') => {
    const student = classStudents.find(s => s.id === studentId);
    if (!student) return;

    const existing = (presences || []).find(p => p.eleveId === studentId && p.date === appelDate);
    if (existing) {
      alert("Ce pointage a d\u00e9j\u00e0 \u00e9t\u00e9 enregistr\u00e9 pour aujourd'hui.");
      return; 
    }

    addPresence({
      id: crypto.randomUUID(),
      eleveId: studentId,
      eleveNom: student.nom,
      elevePrenom: student.prenom,
      eleveClasse: student.classe,
      date: appelDate,
      heure: new Date().toTimeString().split(' ')[0],
      statut,
      type: 'ENTREE'
    });
  };

  if (!user || user.role !== 'professeur') {
    return <div className="p-8 text-center">Acc\u00e8s restreint.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white">Cahier de Textes & Pr\u00e9sences</h1>
          <p className="text-slate-500">G\u00e9rez les devoirs et faites l'appel de vos classes.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedClasse} 
            onChange={e => setSelectedClasse(e.target.value)}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
          >
            {[...new Set(myAssignations.map(a => a.classe))].map(c => (
              <option key={c} value={c}>Classe: {c}</option>
            ))}
          </select>
          <select 
            value={selectedMatiereId} 
            onChange={e => setSelectedMatiereId(e.target.value)}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
          >
            {myAssignations.filter(a => a.classe === selectedClasse).map(a => (
              <option key={a.matiereId} value={a.matiereId}>{matieres.find(m => m.id === a.matiereId)?.nom}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 pb-px">
        <button
          onClick={() => setActiveTab('devoirs')}
          className={`pb-4 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'devoirs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen className="w-4 h-4 inline-block mr-2" />
          Devoirs & Le\u00e7ons
        </button>
        <button
          onClick={() => setActiveTab('appel')}
          className={`pb-4 px-4 font-bold text-sm transition-colors border-b-2 ${activeTab === 'appel' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <UserCheck className="w-4 h-4 inline-block mr-2" />
          Appel de la classe
        </button>
      </div>

      {activeTab === 'devoirs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 h-fit">
            <h2 className="text-lg font-black mb-4">Ajouter un devoir</h2>
            <form onSubmit={handleAddDevoir} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pour le (Date de rendu)</label>
                <input type="date" value={dateRendu} onChange={e => setDateRendu(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl dark:bg-slate-900 dark:border-slate-700" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Exercices 1 \u00e0 4 page 45..." className="w-full bg-slate-50 border p-3 rounded-xl dark:bg-slate-900 dark:border-slate-700" required />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex justify-center items-center gap-2">
                <Plus className="w-5 h-5" /> Publier
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {myDevoirs.map(d => (
              <div key={d.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black">{d.matiere}</span>
                    <span className="text-xs font-bold text-slate-400">Donn\u00e9 le {format(new Date(d.dateDonnee), 'dd MMM yyyy', {locale: fr})}</span>
                  </div>
                  <button onClick={() => deleteDevoir(d.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">{d.description}</p>
                <div className="mt-2 text-sm font-bold flex items-center gap-1 text-amber-600">
                  <Calendar className="w-4 h-4" /> \u00c0 rendre pour le {format(new Date(d.dateRendu), 'EEEE dd MMMM yyyy', {locale: fr})}
                </div>
              </div>
            ))}
            {myDevoirs.length === 0 && (
              <div className="p-8 text-center text-slate-500 font-medium">Aucun devoir enregistr\u00e9.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'appel' && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black">Faire l'appel</h2>
            <input type="date" value={appelDate} onChange={e => setAppelDate(e.target.value)} className="px-4 py-2 border rounded-xl font-bold bg-slate-50 dark:bg-slate-900 dark:border-slate-700" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-100 dark:border-slate-700 text-sm font-bold text-slate-400 uppercase">
                  <th className="py-4">El\u00e8ve</th>
                  <th className="py-4 text-center">Pointage du jour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {classStudents.map(student => {
                  const p = (presences || []).find(x => x.eleveId === student.id && x.date === appelDate);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="py-3">
                        <div className="font-bold text-slate-800 dark:text-white">{student.nom}</div>
                        <div className="text-sm text-slate-500">{student.prenom}</div>
                      </td>
                      <td className="py-3 text-center">
                        {p ? (
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                            p.statut === 'present' ? 'bg-emerald-100 text-emerald-700' : 
                            p.statut === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {p.statut === 'present' && <CheckCircle2 className="w-4 h-4" />}
                            {p.statut === 'absent' && <XCircle className="w-4 h-4" />}
                            {p.statut === 'retard' && <Clock className="w-4 h-4" />}
                            {p.statut.toUpperCase()}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => markPresence(student.id, 'present')} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl transition-colors"><CheckCircle2 className="w-5 h-5" /></button>
                            <button onClick={() => markPresence(student.id, 'retard')} className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl transition-colors"><Clock className="w-5 h-5" /></button>
                            <button onClick={() => markPresence(student.id, 'absent')} className="p-2 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl transition-colors"><XCircle className="w-5 h-5" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
