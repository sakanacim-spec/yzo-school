import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { Seance } from '../../types';
import {
    Calendar as CalendarIcon, Clock, MapPin,
    User as UserIcon, Printer, UserCheck
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { t } from '../../i18n';
import type { Language } from '../../i18n';
import {
    initI18nPdfDoc,
    normalizeLanguage,
    isRtlLanguage,
} from '../../utils/pdfEngine';
import { getAcademicTranslations } from '../../utils/pdfAcademicTranslations';

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
    slots.push(to); 
    return slots;
};

const timeToMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const exportPDF = async (
    seances: Seance[],
    matieres: any[],
    selectedClasse: string,
    jours: string[],
    slots: string[],
    childName: string,
    schoolName: string,
    language: Language
): Promise<jsPDF> => {
    const normLang = normalizeLanguage(language);
    const tAcad = getAcademicTranslations(normLang);
    const isRtl = isRtlLanguage(normLang);

    const pdfInst = await initI18nPdfDoc({ language: normLang, orientation: 'landscape', unit: 'mm', format: 'a4' });
    const { doc, prepareText, effectiveFont } = pdfInst;

    const title = `${tAcad.timetableTitle} — ${childName} (${selectedClasse})`;

    doc.setFont(effectiveFont, 'bold');
    doc.setFontSize(16);
    doc.text(prepareText(title), 148, 16, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont(effectiveFont, 'normal');
    doc.text(prepareText(schoolName), 148, 24, { align: 'center' });

    const filteredSeances = seances.filter(s => s.classe === selectedClasse);

    const translatedDays = jours.map(j => {
        const key = j.toLowerCase();
        const tr = t(normLang as Language, `schedule.days.${key}`);
        return tr || j;
    });

    const orderedJours = isRtl ? [...jours].reverse() : jours;
    const orderedTranslatedDays = isRtl ? [...translatedDays].reverse() : translatedDays;

    const head = [[
        prepareText(tAcad.time),
        ...orderedTranslatedDays.map(j => prepareText(j))
    ]];

    const body: string[][] = [];
    const relevantSlots = slots.slice(0, -1);

    relevantSlots.forEach(slot => {
        const row: string[] = [slot];
        orderedJours.forEach(jour => {
            const seance = filteredSeances.find(s =>
                s.jour === jour &&
                timeToMin(s.heureDebut) <= timeToMin(slot) &&
                timeToMin(s.heureFin) > timeToMin(slot)
            );
            if (seance) {
                const mat = matieres.find(m => m.id === seance.matiereId);
                const matName = mat?.nom || '?';
                const profName = seance.professeur || '';
                const salleName = seance.salle || '';
                const cellText = [matName, profName, salleName].filter(Boolean).join('\n');
                row.push(prepareText(cellText));
            } else {
                row.push('');
            }
        });
        
        const isDuplicate = row.slice(1).some((val, i) => {
            if (!val) return false;
            const prevRow = body[body.length - 1];
            return prevRow && prevRow[i + 1] === val;
        });
        if (!isDuplicate || row.slice(1).some(v => v !== '')) {
            body.push(row);
        }
    });

    autoTable(doc, {
        head,
        body,
        startY: 30,
        theme: 'grid',
        styles: {
            font: effectiveFont,
            fontSize: 7.5,
            cellPadding: 2.5,
            halign: isRtl ? 'right' : 'center',
            valign: 'middle'
        },
        headStyles: {
            font: effectiveFont,
            fillColor: [79, 70, 229],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function(data) {
            if (data.row.index > -1 && data.column.index > 0) {
                if (data.cell.text.length > 0 && data.cell.text[0] !== '') {
                    data.cell.styles.fillColor = [238, 242, 255];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    const cleanTitle = title.replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/g, '_');
    if (typeof window !== 'undefined' && doc.save) {
        doc.save(`${cleanTitle}.pdf`);
    }

    return doc;
};

export const ParentEmploiDuTemps: React.FC = () => {
    const { students, seances, matieres, schoolName, language } = useStore();
    const [selectedChildId, setSelectedChildId] = useState<string>(students[0]?.id || '');

    const selectedChild = students.find(s => s.id === selectedChildId) || students[0];
    const selectedClasse = selectedChild?.classe || '';

    const joursActifs = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']; 
    const currentSeances = useMemo(() => {
        return seances.filter(s => s.classe === selectedClasse);
    }, [seances, selectedClasse]);

    const activeSlots = useMemo(() => {
        if (currentSeances.length === 0) return generateSlots("08:00", "18:00");
        let minTime = "23:59";
        let maxTime = "00:00";
        currentSeances.forEach(s => {
            if (timeToMin(s.heureDebut) < timeToMin(minTime)) minTime = s.heureDebut;
            if (timeToMin(s.heureFin) > timeToMin(maxTime)) maxTime = s.heureFin;
        });
        if (minTime === "23:59") return generateSlots("08:00", "18:00");
        return generateSlots(minTime, maxTime);
    }, [currentSeances]);

    const getSeanceStyle = (seance: Seance) => {
        const slotsDuration = timeToMin(activeSlots[activeSlots.length - 1]) - timeToMin(activeSlots[0]);
        const startOffset = timeToMin(seance.heureDebut) - timeToMin(activeSlots[0]);
        const duration = timeToMin(seance.heureFin) - timeToMin(seance.heureDebut);

        const top = (startOffset / slotsDuration) * 100;
        const height = (duration / slotsDuration) * 100;

        return {
            top: `${top}%`,
            height: `${height}%`,
            minHeight: '40px'
        };
    };

    if (students.length === 0) {
        return (
            <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
                <div className="bg-white dark:bg-slate-900 rounded-[24px] p-12 text-center shadow-sm border border-slate-100 dark:border-slate-800">
                    <UserCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h2 className="text-xl font-black text-slate-700 dark:text-white mb-2">Aucun enfant lié</h2>
                    <p className="text-slate-500">Vous devez lier un enfant à votre compte pour voir son emploi du temps.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto min-h-screen">
            {/* ── En-tête ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <CalendarIcon className="w-8 h-8 text-blue-600" />
                        Emploi du temps
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
                        Consultez le planning hebdomadaire de vos enfants.
                    </p>
                </div>
                {currentSeances.length > 0 && (
                    <button
                        onClick={() => exportPDF(seances, matieres, selectedClasse, joursActifs, activeSlots, `${selectedChild.prenom} ${selectedChild.nom}`, schoolName || '', language as Language)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm shadow-blue-600/20 transition-all active:scale-95"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="hidden sm:inline">Imprimer (PDF)</span>
                    </button>
                )}
            </div>

            {/* ── Sélecteur d'enfant (Tabs) ── */}
            {students.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {students.map(child => (
                        <button
                            key={child.id}
                            onClick={() => setSelectedChildId(child.id)}
                            className={`px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all ${
                                selectedChildId === child.id 
                                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-105' 
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                        >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                                selectedChildId === child.id ? 'bg-white/20' : 'bg-slate-200'
                            }`}>
                                {child.prenom[0]}
                            </div>
                            {child.prenom} {child.nom}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Grille Emploi du Temps ── */}
            {currentSeances.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-[32px] p-12 text-center border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <CalendarIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-700 dark:text-white mb-2">Aucun emploi du temps</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">L'emploi du temps de la classe {selectedClasse} n'a pas encore été configuré par l'administration.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-[800px]">
                    <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50 p-6 relative">
                        <div className="min-w-[800px] h-full flex">
                            {/* Colonne des heures */}
                            <div className="w-16 flex flex-col shrink-0 relative mt-12 border-r border-slate-200 dark:border-slate-800">
                                {activeSlots.slice(0, -1).map(slot => (
                                    <div key={slot} className="flex-1 text-[10px] font-black text-slate-400 text-right pr-3 -mt-2">
                                        {slot}
                                    </div>
                                ))}
                            </div>

                            {/* Colonnes des jours */}
                            <div className="flex-1 flex border-l border-slate-100 dark:border-slate-800">
                                {joursActifs.map(jour => (
                                    <div key={jour} className="flex-1 border-r border-slate-100 dark:border-slate-800 relative flex flex-col">
                                        <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                                            <span className="font-black text-slate-700 dark:text-slate-200 text-sm">{jour}</span>
                                        </div>
                                        <div className="flex-1 relative">
                                            {/* Lignes horizontales pour la grille */}
                                            {activeSlots.slice(0, -1).map(slot => (
                                                <div key={slot} className="absolute w-full border-b border-slate-100 dark:border-slate-800/50" 
                                                     style={{ 
                                                         top: `${((timeToMin(slot) - timeToMin(activeSlots[0])) / (timeToMin(activeSlots[activeSlots.length - 1]) - timeToMin(activeSlots[0]))) * 100}%`
                                                     }} 
                                                />
                                            ))}
                                            
                                            {/* Séances */}
                                            {currentSeances.filter(s => s.jour === jour).map(seance => {
                                                const mat = matieres.find(m => m.id === seance.matiereId);
                                                const style = getSeanceStyle(seance);
                                                return (
                                                    <div
                                                        key={seance.id}
                                                        className={`absolute left-1 right-1 rounded-xl p-2 sm:p-3 overflow-hidden shadow-sm hover:shadow-md transition-all ${seance.couleur || 'bg-blue-500'} text-white group`}
                                                        style={style}
                                                    >
                                                        <div className="h-full flex flex-col">
                                                            <div className="flex items-start justify-between gap-1 mb-1">
                                                                <span className="font-black text-xs sm:text-sm leading-tight line-clamp-2">
                                                                    {mat?.nom || 'Sans matière'}
                                                                </span>
                                                            </div>
                                                            <div className="mt-auto space-y-0.5 text-[10px] sm:text-xs font-medium text-white/90">
                                                                <div className="flex items-center gap-1.5 line-clamp-1">
                                                                    <Clock className="w-3 h-3 shrink-0" />
                                                                    {seance.heureDebut} - {seance.heureFin}
                                                                </div>
                                                                {seance.professeur && (
                                                                    <div className="flex items-center gap-1.5 line-clamp-1">
                                                                        <UserIcon className="w-3 h-3 shrink-0" />
                                                                        {seance.professeur}
                                                                    </div>
                                                                )}
                                                                {seance.salle && (
                                                                    <div className="flex items-center gap-1.5 line-clamp-1">
                                                                        <MapPin className="w-3 h-3 shrink-0" />
                                                                        {seance.salle}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
