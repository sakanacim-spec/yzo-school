import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Seance } from '../types';
import {
    Calendar as CalendarIcon, Plus, X, Clock, MapPin,
    User as UserIcon, Trash2, Printer, BookOpen,
    ChevronLeft, ChevronRight, Eye, Settings2
} from 'lucide-react';
import { v4 as uuid } from '../utils/uuid';
import { playSuccessSound } from '../utils/audio';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';
import type { Language } from '../types';

// ── Constantes configurables ─────────────────────────────────
const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;

// Génère les créneaux horaires de 30 en 30 minutes entre deux heures
const generateSlots = (from: string, to: string, stepMin = 30): string[] => {
    const slots: string[] = [];
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let cur = fh * 60 + fm;
    const end = th * 60 + tm;
    while (cur < end) {
        const h = Math.floor(cur / 60).toString().padStart(2, '0');
        const m = (cur % 60).toString().padStart(2, '0');
        slots.push(`${h}:${m}`);
        cur += stepMin;
    }
    slots.push(to); // inclure la borne de fin
    return slots;
};

const timeToMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const COULEURS = [
    { cls: 'bg-indigo-500', label: 'Indigo' },
    { cls: 'bg-emerald-500', label: 'Vert' },
    { cls: 'bg-rose-500', label: 'Rouge' },
    { cls: 'bg-amber-500', label: 'Orange' },
    { cls: 'bg-purple-500', label: 'Violet' },
    { cls: 'bg-cyan-500', label: 'Cyan' },
    { cls: 'bg-fuchsia-500', label: 'Fuchsia' },
    { cls: 'bg-blue-500', label: 'Bleu' },
    { cls: 'bg-teal-500', label: 'Teal' },
    { cls: 'bg-orange-500', label: 'Orange foncé' },
];

// ── Export PDF ───────────────────────────────────────────────
const exportPDF = (
    seances: Seance[],
    matieres: any[],
    selectedClasse: string,
    jours: string[],
    slots: string[],
    viewMode: string,
    viewProf: string,
    schoolName: string,
    language: Language
) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const title = viewMode === 'prof' && viewProf
        ? (t(language, 'schedule.scheduleProf') || 'Emploi du temps — {{prof}}').replace('{{prof}}', viewProf)
        : (t(language, 'schedule.scheduleClass') || 'Emploi du temps — {{class}}').replace('{{class}}', selectedClasse);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 148, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(schoolName, 148, 26, { align: 'center' });

    const filteredSeances = viewMode === 'prof' && viewProf
        ? seances.filter(s => s.professeur === viewProf)
        : seances.filter(s => s.classe === selectedClasse);

    // Construire le tableau
    const head = [[t(language, 'schedule.time') || 'Heure', ...jours.map(j => t(language, 'schedule.days.' + j.toLowerCase()) || j)]];
    const body: string[][] = [];

    // Trouver les séances uniques par slot/jour
    const usedSlots = new Set(filteredSeances.flatMap(s => [s.heureDebut, s.heureFin]));
    const relevantSlots = slots.filter(s => usedSlots.has(s) || true).slice(0, -1);

    relevantSlots.forEach(slot => {
        const row: string[] = [slot];
        jours.forEach(jour => {
            const seance = filteredSeances.find(s =>
                s.jour === jour &&
                timeToMin(s.heureDebut) <= timeToMin(slot) &&
                timeToMin(s.heureFin) > timeToMin(slot)
            );
            if (seance) {
                const mat = matieres.find(m => m.id === seance.matiereId);
                row.push(`${mat?.nom || '?'}\n${seance.professeur || ''}\n${seance.salle || ''}`);
            } else {
                row.push('');
            }
        });
        body.push(row);
    });

    autoTable(doc, {
        head,
        body,
        startY: 32,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 255] },
        styles: { fontSize: 7, cellPadding: 2 },
    });

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};

// ── Composant principal ──────────────────────────────────────
export const EmploiDuTemps: React.FC = () => {
    const { language } = useLanguage();
    const { user, students, classeMatieres, matieres, seances, addSeance, deleteSeance, settings, schoolName } = useStore();

    // Horaires configurables (depuis les paramètres ou valeurs par défaut)
    const heureDebut = (settings as any)?.heureDebutEcole || '07:30';
    const heureFin = (settings as any)?.heureFinEcole || '18:00';
    const SLOTS = useMemo(() => generateSlots(heureDebut, heureFin, 30), [heureDebut, heureFin]);
    // Jours configurables
    const joursActifs = useMemo(() => {
        const jours = (settings as any)?.joursOuverture as string[] | undefined;
        return (jours && jours.length > 0) ? jours : [...JOURS_SEMAINE];
    }, [settings]);

    const classesList = useMemo(() => Array.from(new Set(students.map(s => s.classe))).sort(), [students]);
    const profsList = useMemo(() => Array.from(new Set(classeMatieres.map(cm => cm.professeur).filter(Boolean))).sort(), [classeMatieres]);

    const isProf = user?.role === 'professeur';
    const profMatch = useMemo(() => {
        if (!isProf || !user) return '';
        const u = (user.nom || '').trim().toLowerCase();
        return profsList.find(p => p?.trim().toLowerCase() === u) || user.nom || '';
    }, [isProf, user, profsList]);

    const [selectedClasse, setSelectedClasse] = useState(classesList[0] || '');
    const [viewMode, setViewMode] = useState<'classe' | 'prof'>(isProf ? 'prof' : 'classe');
    const [viewProf, setViewProf] = useState(isProf ? profMatch : (profsList[0] || ''));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Config horaires locaux (non persistés, juste pour la vue)
    const [configDebut, setConfigDebut] = useState(heureDebut);
    const [configFin, setConfigFin] = useState(heureFin);
    const configSlots = useMemo(() => generateSlots(configDebut, configFin, 30), [configDebut, configFin]);
    const activeSlots = showConfig ? configSlots : SLOTS;

    const CELL_HEIGHT = 56; // px par tranche de 30 min

    // Séances filtrées
    const currentSeances = useMemo(() => {
        if (viewMode === 'prof' && viewProf) return seances.filter(s => s.professeur === viewProf);
        return seances.filter(s => s.classe === selectedClasse);
    }, [seances, selectedClasse, viewMode, viewProf]);

    // Formulaire
    const [form, setForm] = useState<Partial<Seance>>({
        jour: 'Lundi',
        heureDebut: activeSlots[0] || '08:00',
        heureFin: activeSlots[2] || '09:00',
        salle: '',
        couleur: 'bg-indigo-500',
    });
    const [selectedAssignation, setSelectedAssignation] = useState('');

    const classAssignations = useMemo(() => {
        if (!selectedClasse) return [];
        return classeMatieres.filter(cm => cm.classe === selectedClasse);
    }, [classeMatieres, selectedClasse]);

    const handleOpenModal = (jour?: string, heure?: string) => {
        setForm(prev => ({
            ...prev,
            jour: jour as any || 'Lundi',
            heureDebut: heure || activeSlots[0],
            heureFin: activeSlots[Math.min(2, activeSlots.length - 1)] || '09:00',
        }));
        setIsModalOpen(true);
    };

    const handleSaveSeance = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClasse || !selectedAssignation || !form.jour || !form.heureDebut || !form.heureFin) {
            alert(t(language as Language, 'schedule.fillRequiredFields') || "Veuillez remplir tous les champs obligatoires.");
            return;
        }
        if (timeToMin(form.heureFin!) <= timeToMin(form.heureDebut!)) {
            alert(t(language as Language, 'schedule.endTimeAfterStartTime') || "L'heure de fin doit être après l'heure de début.");
            return;
        }

        const assignation = classAssignations.find(a => a.id === selectedAssignation);
        if (!assignation) return;

        const newSeance: Seance = {
            id: uuid(),
            classe: selectedClasse,
            jour: form.jour as any,
            heureDebut: form.heureDebut!,
            heureFin: form.heureFin!,
            matiereId: assignation.matiereId,
            professeur: assignation.professeur,
            salle: form.salle || '',
            couleur: form.couleur || 'bg-indigo-500',
        };

        addSeance(newSeance);
        setIsModalOpen(false);
        playSuccessSound();
    };

    const handleDelete = (id: string) => {
        if (window.confirm(t(language as Language, 'schedule.confirmDeleteSession') || "Supprimer cette séance ?")) deleteSeance(id);
    };

    // Calcul position/taille d'une séance dans la grille
    const getSeanceStyle = (seance: Seance) => {
        const startMin = timeToMin(seance.heureDebut);
        const endMin = timeToMin(seance.heureFin);
        const gridStart = timeToMin(activeSlots[0] || '07:30');
        const top = ((startMin - gridStart) / 30) * CELL_HEIGHT;
        const height = ((endMin - startMin) / 30) * CELL_HEIGHT;
        return { top: `${top}px`, height: `${Math.max(height, CELL_HEIGHT)}px` };
    };

    const totalRows = activeSlots.length - 1;
    const gridHeight = totalRows * CELL_HEIGHT;

    return (
        <div className="space-y-5 max-w-[1400px] mx-auto pb-24">
            {/* ── Header ── */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 rounded-[32px] p-7 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
                            <CalendarIcon className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">{t(language as Language, 'schedule.timetable') || 'Emploi du Temps'}</h1>
                            <p className="text-indigo-200 text-sm font-medium mt-0.5">{t(language as Language, 'schedule.timetableDesc') || 'Durées flexibles · Vue classe & professeur · Export PDF'}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!isProf && (
                            <button
                                onClick={() => setShowConfig(v => !v)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold text-sm transition-all"
                            >
                                <Settings2 className="w-4 h-4" /> {t(language as Language, 'schedule.schedules') || 'Horaires'}
                            </button>
                        )}
                        <button
                            onClick={() => exportPDF(seances, matieres, selectedClasse, joursActifs, activeSlots, viewMode, viewProf, schoolName || '', language as Language)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold text-sm transition-all"
                        >
                            <Printer className="w-4 h-4" /> {t(language as Language, 'schedule.exportPdf') || 'Exporter PDF'}
                        </button>
                        {!isProf && (
                            <button
                                onClick={() => handleOpenModal()}
                                disabled={viewMode === 'classe' && !selectedClasse}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 hover:bg-indigo-50 rounded-2xl font-black text-sm transition-all shadow-lg disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4" /> {t(language as Language, 'schedule.newSession') || 'Nouvelle séance'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Config horaires ── */}
            {showConfig && (
                <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-indigo-100 dark:border-indigo-900/30 p-5 shadow-sm">
                    <h3 className="font-black text-slate-700 dark:text-white mb-4 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-indigo-500" /> {t(language as Language, 'schedule.gridConfig') || 'Configuration des horaires de la grille'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t(language as Language, 'schedule.dayStart') || 'Début journée'}</label>
                            <input type="time" value={configDebut} onChange={e => setConfigDebut(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t(language as Language, 'schedule.dayEnd') || 'Fin journée'}</label>
                            <input type="time" value={configFin} onChange={e => setConfigFin(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div className="col-span-2 flex items-end">
                            <p className="text-xs text-slate-400"><span dangerouslySetInnerHTML={{ __html: (t(language as Language, 'schedule.gridInfoHtml') || 'La grille affichera de <strong>{{start}}</strong> à <strong>{{end}}</strong> avec des créneaux de 30 min. {{lines}} lignes au total.').replace('{{start}}', configDebut).replace('{{end}}', configFin).replace('{{lines}}', String(configSlots.length - 1)) }} /></p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sélecteurs vue + classe/prof ── */}
            <div className="flex flex-col md:flex-row gap-3">
                {/* Mode vue */}
                {!isProf && (
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                        <button
                            onClick={() => setViewMode('classe')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${viewMode === 'classe' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            <BookOpen className="w-4 h-4" /> {t(language as Language, 'schedule.byClass') || 'Par Classe'}
                        </button>
                        <button
                            onClick={() => setViewMode('prof')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${viewMode === 'prof' ? 'bg-white dark:bg-slate-900 text-violet-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            <UserIcon className="w-4 h-4" /> {t(language as Language, 'schedule.byTeacher') || 'Par Professeur'}
                        </button>
                    </div>
                )}

                {/* Sélecteur classe ou prof */}
                {viewMode === 'classe' ? (
                    <div className="flex-1">
                        <select
                            value={selectedClasse}
                            onChange={e => setSelectedClasse(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">{t(language as Language, 'schedule.selectClass') || 'Sélectionnez une classe'}</option>
                            {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                ) : (
                    <div className="flex-1">
                        <select
                            value={viewProf}
                            onChange={e => setViewProf(e.target.value)}
                            disabled={isProf}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-75"
                        >
                            <option value="">{t(language as Language, 'schedule.selectTeacher') || 'Sélectionnez un professeur'}</option>
                            {profsList.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                )}

                {/* Résumé séances */}
                <div className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{currentSeances.length} {currentSeances.length > 1 ? (t(language as Language, 'schedule.sessions') || 'séances') : (t(language as Language, 'schedule.session') || 'séance')}</span>
                </div>
            </div>

            {/* ── Grille emploi du temps ── */}
            {(viewMode === 'prof' ? !!viewProf : !!selectedClasse) ? (
                <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <div style={{ minWidth: `${joursActifs.length * 140 + 80}px` }}>
                            {/* En-têtes jours */}
                            <div className="grid border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-20"
                                style={{ gridTemplateColumns: `80px repeat(${joursActifs.length}, 1fr)` }}>
                                <div className="p-4 text-center">
                                    <Clock className="w-4 h-4 text-slate-300 mx-auto" />
                                </div>
                                {joursActifs.map(jour => (
                                    <div key={jour} className="p-4 text-center">
                                        <p className="font-black text-slate-800 dark:text-white text-sm">{t(language as Language, 'schedule.days.' + jour.toLowerCase()) || jour}</p>
                                        <p className="text-[10px] text-slate-400 font-semibold">
                                            {currentSeances.filter(s => s.jour === jour).length} {t(language as Language, 'schedule.classes') || 'cours'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Corps grille */}
                            <div className="grid relative"
                                style={{ gridTemplateColumns: `80px repeat(${joursActifs.length}, 1fr)`, height: `${gridHeight}px` }}>

                                {/* Colonne heures */}
                                <div className="border-r border-slate-100 dark:border-slate-800 relative">
                                    {activeSlots.slice(0, -1).map((slot, i) => (
                                        <div key={slot} className="absolute w-full flex items-start justify-end pr-3 pt-1"
                                            style={{ top: `${i * CELL_HEIGHT}px`, height: `${CELL_HEIGHT}px` }}>
                                            <span className="text-[10px] font-bold text-slate-400">{slot}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Colonnes jours */}
                                {joursActifs.map(jour => (
                                    <div
                                        key={jour}
                                        className="relative border-r border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors"
                                        onClick={() => viewMode === 'classe' && handleOpenModal(jour, activeSlots[0])}
                                    >
                                        {/* Lignes horizontales 30min */}
                                        {activeSlots.slice(0, -1).map((slot, i) => (
                                            <div key={slot} className={`absolute w-full border-b ${i % 2 === 0 ? 'border-slate-100 dark:border-slate-800' : 'border-dashed border-slate-50 dark:border-slate-800/50'}`}
                                                style={{ top: `${i * CELL_HEIGHT}px`, height: `${CELL_HEIGHT}px` }} />
                                        ))}

                                        {/* Séances */}
                                        {currentSeances.filter(s => s.jour === jour).map(seance => {
                                            const matiere = matieres.find(m => m.id === seance.matiereId);
                                            const style = getSeanceStyle(seance);
                                            const durationMin = timeToMin(seance.heureFin) - timeToMin(seance.heureDebut);

                                            return (
                                                <div
                                                    key={seance.id}
                                                    className={`absolute left-1 right-1 rounded-2xl p-2.5 shadow-lg flex flex-col justify-between overflow-hidden group z-10 hover:z-30 transition-all hover:scale-[1.02] hover:shadow-2xl border border-white/20 ${seance.couleur || 'bg-indigo-500'} text-white`}
                                                    style={style}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <div>
                                                        <div className="flex items-start justify-between gap-1">
                                                            <h4 className="font-black text-xs leading-tight line-clamp-2">{matiere?.nom || '?'}</h4>
                                                            {!isProf && (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleDelete(seance.id); }}
                                                                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/40 p-1 rounded-lg shrink-0"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="text-[9px] font-bold text-white/80 mt-0.5 flex items-center gap-1">
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {seance.heureDebut}–{seance.heureFin}
                                                            <span className="ml-1 opacity-60">({durationMin}{t(language as Language, 'schedule.min') || 'min'})</span>
                                                        </div>
                                                    </div>
                                                    {durationMin >= 60 && (
                                                        <div className="mt-1 space-y-0.5">
                                                            {seance.professeur && (
                                                                <div className="flex items-center gap-1 bg-black/20 rounded-lg px-1.5 py-0.5 w-max text-[9px] font-medium">
                                                                    <UserIcon className="w-2.5 h-2.5" />
                                                                    <span className="truncate max-w-[80px]">{seance.professeur}</span>
                                                                </div>
                                                            )}
                                                            {seance.salle && (
                                                                <div className="flex items-center gap-1 text-[9px] font-medium text-white/70">
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    {seance.salle}
                                                                </div>
                                                            )}
                                                            {viewMode === 'prof' && (
                                                                <div className="flex items-center gap-1 text-[9px] font-bold text-white/80 bg-black/20 rounded-lg px-1.5 py-0.5 w-max">
                                                                    <BookOpen className="w-2.5 h-2.5" />
                                                                    {seance.classe}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-[28px] border border-dashed border-slate-200 dark:border-slate-700">
                    <CalendarIcon className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-600 dark:text-slate-300 mb-2">
                        {viewMode === 'classe' ? (t(language as Language, 'schedule.selectClass') || 'Sélectionnez une classe') : (t(language as Language, 'schedule.selectTeacher') || 'Sélectionnez un professeur')}
                    </h3>
                    <p className="text-sm text-slate-400">{t(language as Language, 'schedule.scheduleWillShowHere') || "L'emploi du temps s'affichera ici."}</p>
                </div>
            )}

            {/* ── Modal ajout séance ── */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden">
                        {/* Header modal */}
                        <div className="px-7 py-5 bg-indigo-600 flex items-center justify-between">
                            <h3 className="text-xl font-black text-white">{t(language as Language, 'schedule.newSession') || 'Nouvelle séance'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSeance} className="p-6 space-y-5">
                            {/* Matière */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t(language as Language, 'schedule.subjectAndTeacher') || 'Matière & Professeur'} *</label>
                                <select
                                    value={selectedAssignation}
                                    onChange={e => setSelectedAssignation(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                >
                                    <option value="">{t(language as Language, 'common.select') || 'Sélectionnez...'}</option>
                                    {classAssignations.map(a => {
                                        const mat = matieres.find(m => m.id === a.matiereId);
                                        return <option key={a.id} value={a.id}>{mat?.nom} — {a.professeur}</option>;
                                    })}
                                </select>
                            </div>

                            {/* Jour + Salle */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t(language as Language, 'common.day') || 'Jour'} *</label>
                                    <select
                                        value={form.jour}
                                        onChange={e => setForm({ ...form, jour: e.target.value as any })}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    >
                                        {joursActifs.map(j => <option key={j} value={j}>{t(language as Language, 'schedule.days.' + j.toLowerCase()) || j}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t(language as Language, 'schedule.room') || 'Salle'}</label>
                                    <input
                                        type="text"
                                        placeholder={t(language as Language, 'schedule.roomPlaceholder') || "Ex: Salle A1"}
                                        value={form.salle}
                                        onChange={e => setForm({ ...form, salle: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Heures — input time libre (durée flexible) */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t(language as Language, 'schedule.startTime') || 'Heure de début'} *</label>
                                    <input
                                        type="time"
                                        value={form.heureDebut}
                                        min={activeSlots[0]}
                                        max={activeSlots[activeSlots.length - 1]}
                                        onChange={e => setForm({ ...form, heureDebut: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{t(language as Language, 'schedule.endTime') || 'Heure de fin'} *</label>
                                    <input
                                        type="time"
                                        value={form.heureFin}
                                        min={form.heureDebut}
                                        max={activeSlots[activeSlots.length - 1]}
                                        onChange={e => setForm({ ...form, heureFin: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                            </div>
                            {form.heureDebut && form.heureFin && timeToMin(form.heureFin) > timeToMin(form.heureDebut) && (
                                <p className="text-xs text-indigo-600 font-bold text-center -mt-2">
                                    {(t(language as Language, 'schedule.durationMinutes') || 'Durée : {{duration}} minutes').replace('{{duration}}', String(timeToMin(form.heureFin!) - timeToMin(form.heureDebut!)))}
                                </p>
                            )}

                            {/* Couleur */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t(language as Language, 'schedule.color') || 'Couleur'}</label>
                                <div className="flex flex-wrap gap-2">
                                    {COULEURS.map(c => (
                                        <button
                                            key={c.cls}
                                            type="button"
                                            onClick={() => setForm({ ...form, couleur: c.cls })}
                                            className={`w-8 h-8 rounded-full ${c.cls} transition-all ${form.couleur === c.cls ? 'ring-4 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-110'}`}
                                            title={t(language as Language, 'schedule.colors.' + c.label.toLowerCase().replace(/\s/g, '')) || c.label}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98]">
                                {t(language as Language, 'schedule.saveSession') || 'Sauvegarder la séance'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
