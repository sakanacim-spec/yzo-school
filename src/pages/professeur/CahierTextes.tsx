import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { BookOpen, UserCheck, Calendar, CheckCircle2, Clock, XCircle, Plus, Trash2 } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { uploadDevoirFile } from '../../services/backendSync';
import { notificationService } from '../../services/notificationService';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';
import type { Language } from '../../types';
import { notificationService } from '../../services/notificationService';

const safeFormatDate = (dateStr: string | undefined, fmt: string, language: Language) => {
  if (!dateStr) return t(language, 'cahierTextes.noDate') || 'Date non précisée';
  const d = new Date(dateStr);
  return isValid(d) ? format(d, fmt, { locale: language === 'en' ? enUS : fr }) : t(language, 'cahierTextes.invalidDate') || 'Date invalide';
};

const parseDevoirDescription = (desc: string) => {
  if (!desc) return { cleanDesc: '', completedIds: [] as string[] };
  const marker = '\n[COMPLETED_STUDENTS]:';
  const idx = desc.indexOf(marker);
  if (idx === -1) return { cleanDesc: desc, completedIds: [] as string[] };
  const cleanDesc = desc.substring(0, idx);
  const listStr = desc.substring(idx + marker.length);
  const completedIds = listStr ? listStr.split(',').filter(Boolean) : [];
  return { cleanDesc, completedIds };
};

export const CahierTextes: React.FC = () => {
  const { language } = useStore();
  const user = useStore(s => s.user);
  const students = useStore(s => s.students);
  const devoirs = useStore(s => s.devoirs);
  const addDevoir = useStore(s => s.addDevoir);
  const deleteDevoir = useStore(s => s.deleteDevoir);
  const matieres = useStore(s => s.matieres);
  
  const classeMatieres = useStore(s => s.classeMatieres) || [];
  
  const myAssignations = useMemo(() => {
    if (!user) return [];
    const userName = (user.nom || '').trim().toLowerCase();
    const userUsername = (user.username || '').trim().toLowerCase();
    
    return classeMatieres.filter((cm) => {
        const profName = (cm.professeur || '').trim().toLowerCase();
        return profName === userName || profName === userUsername;
    });
  }, [classeMatieres, user]);

  const [selectedClasse, setSelectedClasse] = useState(myAssignations[0]?.classe || '');
  const [selectedMatiereId, setSelectedMatiereId] = useState(myAssignations[0]?.matiereId || '');
  
  // Devoirs state
  const [desc, setDesc] = useState('');
  const [dateRendu, setDateRendu] = useState(new Date().toISOString().split('T')[0]);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const classStudents = useMemo(() => students.filter(s => s.classe === selectedClasse).sort((a,b) => a.nom.localeCompare(b.nom)), [students, selectedClasse]);
  
  const myDevoirs = useMemo(() => (devoirs || []).filter(d => d.classe === selectedClasse).sort((a,b) => new Date(b.dateDonnee).getTime() - new Date(a.dateDonnee).getTime()), [devoirs, selectedClasse]);

  const handleAddDevoir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !selectedClasse || !selectedMatiereId) return;
    const matiere = matieres.find(m => m.id === selectedMatiereId)?.nom || (t(language as Language, 'common.unknown') || 'Inconnue');
    
    let fichierUrl = undefined;
    if (file) {
      setIsUploading(true);
      try {
        fichierUrl = await uploadDevoirFile(file);
      } catch (err) {
        console.error("Erreur upload", err);
        alert(t(language as Language, 'cahierTextes.uploadError') || "L'envoi du fichier a échoué.");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    addDevoir({
      id: crypto.randomUUID(),
      dateDonnee: new Date().toISOString().split('T')[0],
      dateRendu,
      matiere,
      description: desc,
      classe: selectedClasse,
      professeurNom: user?.nom || (t(language as Language, 'common.professor') || 'Professeur'),
      fichierUrl
    });
    setDesc('');
    setFile(null);
  };


  if (!user || user.role !== 'professeur') {
    return <div className="p-8 text-center">{t(language as Language, 'common.restrictedAccess') || 'Accès restreint.'}</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {myAssignations.length === 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl mb-6">
          <h3 className="font-bold text-amber-800">{t(language as Language, 'cahierTextes.noClassAssignedTitle') || 'Aucune classe assignée'}</h3>
          <p className="text-amber-700 text-sm">{t(language as Language, 'cahierTextes.noClassAssignedDesc') || 'Veuillez demander à l\'administration de vous assigner des matières et des classes depuis le menu "Académique".'}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white">{t(language as Language, 'cahierTextes.title') || 'Cahier de Textes & Devoirs'}</h1>
          <p className="text-slate-500">{t(language as Language, 'cahierTextes.subtitle') || 'Gérez les leçons du jour et les devoirs de vos classes.'}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedClasse} 
            onChange={e => setSelectedClasse(e.target.value)}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
          >
            {[...new Set(myAssignations.map(a => a.classe))].map(c => (
              <option key={c} value={c}>{t(language as Language, 'common.class') || 'Classe'}: {c}</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 h-fit">
            <h2 className="text-lg font-black mb-4">{t(language as Language, 'cahierTextes.addHomework') || 'Ajouter un devoir'}</h2>
            <form onSubmit={handleAddDevoir} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t(language as Language, 'cahierTextes.dueDate') || 'Pour le (Date de rendu)'}</label>
                <input type="date" value={dateRendu} onChange={e => setDateRendu(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl dark:bg-slate-900 dark:border-slate-700" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t(language as Language, 'common.description') || 'Description'}</label>
                <textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder={t(language as Language, 'cahierTextes.descPlaceholder') || "Ex: Exercices 1 à 4 page 45..."} className="w-full bg-slate-50 border p-3 rounded-xl dark:bg-slate-900 dark:border-slate-700" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t(language as Language, 'cahierTextes.attachedFile') || 'Fichier joint (PDF, Image) - Optionnel'}</label>
                <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full bg-slate-50 border p-2 rounded-xl dark:bg-slate-900 dark:border-slate-700 text-sm" />
              </div>
              <button type="submit" disabled={isUploading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex justify-center items-center gap-2">
                <Plus className="w-5 h-5" /> {isUploading ? (t(language as Language, 'common.uploading') || 'Envoi en cours...') : (t(language as Language, 'common.publish') || 'Publier')}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {myDevoirs.map(d => {
              const { cleanDesc, completedIds } = parseDevoirDescription(d.description);
              return (
                <div key={d.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black">{d.matiere}</span>
                      <span className="text-xs font-bold text-slate-400">{t(language as Language, 'cahierTextes.givenOn') || 'Donné le'} {safeFormatDate(d.dateDonnee, 'dd MMM yyyy', language as Language)}</span>
                    </div>
                    <button onClick={() => deleteDevoir(d.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">{cleanDesc}</p>
                  {d.fichierUrl && (
                    <div className="mt-2">
                      <a href={d.fichierUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg text-sm font-bold transition-colors">
                        <BookOpen className="w-4 h-4" /> {t(language as Language, 'cahierTextes.viewAttachment') || 'Voir la pièce jointe'}
                      </a>
                    </div>
                  )}
                  <div className="mt-2 text-sm font-bold flex items-center gap-1 text-amber-600">
                    <Calendar className="w-4 h-4" /> {t(language as Language, 'cahierTextes.toSubmitBy') || 'À rendre pour le'} {safeFormatDate(d.dateRendu, 'EEEE dd MMMM yyyy', language as Language)}
                  </div>
                  
                  {/* Suivi des devoirs */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                      {t(language as Language, 'cahierTextes.progressTracking') || "Suivi de l'avancement :"} {completedIds.length} / {classStudents.length} {t(language as Language, 'common.done') || 'fait'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {classStudents.map(student => {
                        const isCompleted = completedIds.includes(student.id);
                        return (
                          <span 
                            key={student.id} 
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all ${
                              isCompleted 
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30' 
                                : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border border-slate-100 dark:border-slate-800'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {student.prenom} {student.nom}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {myDevoirs.length === 0 && (
              <div className="p-8 text-center text-slate-500 font-medium">{t(language as Language, 'cahierTextes.noHomework') || 'Aucun devoir enregistré.'}</div>
            )}
          </div>
        </div>
    </div>
  );
};
