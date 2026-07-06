// ============================================================
// PAGE RECOUVREMENT — Liste Prioritaire de Recouvrement
// ============================================================
import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Target, Search, Filter, Printer, Download, FileText } from 'lucide-react';

import { computeClassComparison, computePriorityList } from '../services/analyticsService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatMontant } from '../utils/helpers';
import { drawHeader } from '../utils/pdfUtils';
import { useStore } from '../store/useStore';
import { t } from '../i18n';
import type { Language } from '../types';

export const Recouvrement: React.FC = () => {
    const { language } = useStore();
    const students = useStore(s => s.students);
    const tranches = useStore(s => s.tranches);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterCycle, setFilterCycle] = useState('');
    const currency = useStore(s => s.currency);
    const schoolName = useStore(s => s.schoolName);
    const schoolAddress = useStore(s => s.schoolAddress);
    const schoolPhone = useStore(s => s.schoolPhone);
    const schoolSlogan = useStore(s => s.schoolSlogan);
    const schoolMinistry = useStore(s => s.schoolMinistry);
    const schoolCountry = useStore(s => s.schoolCountry);
    const schoolYear = useStore(s => s.schoolYear);
    const storeSettings = useStore(s => s.settings);

    // 1. Calcul des données
    const classComp = useMemo(() => computeClassComparison(students), [students]);
    const basePriorityList = useMemo(() => computePriorityList(students, classComp, tranches), [students, classComp, tranches]);

    // 2. Filtrage
    const priorityList = useMemo(() => {
        return basePriorityList.filter(s => {
            const matchSearch = (s.nom + ' ' + s.prenom).toLowerCase().includes(searchTerm.toLowerCase());
            const matchClass = filterClass ? s.classe === filterClass : true;
            const matchCycle = filterCycle ? s.cycle === filterCycle : true;
            return matchSearch && matchClass && matchCycle;
        });
    }, [basePriorityList, searchTerm, filterClass, filterCycle]);

    const classesConfig = useStore((s) => s.classes) || [];
    const activeCyclesSet = new Set(classesConfig.map(c => c.cycle));
    const cycles = Array.from(activeCyclesSet);

    // --- Actions Export ---

    const sanitizeText = (str: string) => {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u202F\u00A0]/g, ' ') : "";
    };

    const generatePDFList = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        
        const fullSettings = {
            ...storeSettings,
            schoolName: schoolName || 'Etablissement',
            schoolAddress: schoolAddress,
            schoolPhone: schoolPhone,
            schoolSlogan: schoolSlogan,
            schoolMinistry: schoolMinistry,
            schoolCountry: schoolCountry,
            schoolYear: schoolYear,
            currency
        };

        const yOffset = drawHeader(doc, fullSettings as any, t(language as Language, 'recovery.priorityListTitle') || 'LISTE PRIORITAIRE DE RECOUVREMENT');
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text((t(language as Language, 'recovery.generatedOn') || 'Généré le : {{date}}').replace('{{date}}', new Date().toLocaleDateString('fr-FR')), 14, yOffset + 6);

        autoTable(doc, {
            startY: yOffset + 12,
            head: [[
                t(language as Language, 'recovery.colName') || 'Nom Prénom',
                t(language as Language, 'recovery.colClass') || 'Classe',
                t(language as Language, 'recovery.colPhone') || 'Téléphone',
                t(language as Language, 'recovery.colRemaining') || 'Restant',
                t(language as Language, 'recovery.colDelay') || 'Retard (Jours)',
                t(language as Language, 'recovery.colPriority') || 'Priorité'
            ]],
            body: priorityList.map(s => [
                sanitizeText(`${s.nom} ${s.prenom}`),
                sanitizeText(s.classe),
                s.telephone || '-',
                formatMontant(s.restant, currency).replace('€', 'Eur').replace('£', 'GBP').replace(/[\u202F\u00A0]/g, ' '),
                s.joursRetard.toString(),
                sanitizeText(s.niveauPriorite)
            ]),
            styles: { fontSize: 9, font: 'helvetica' },
            headStyles: { fillColor: [220, 38, 38] },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body') {
                    const val = data.cell.raw as string;
                    if (val === 'Eleve') data.cell.styles.textColor = [220, 38, 38];
                    else if (val === 'Moyen') data.cell.styles.textColor = [217, 119, 6];
                    else data.cell.styles.textColor = [22, 163, 74];
                }
            }
        });

        doc.save('Recouvrement_Prioritaire.pdf');
    };

    const generateExcelList = () => {
        // En-tête avec les informations de l'établissement
        const headerInfo = [
            [schoolMinistry || ''],
            [schoolName || 'Etablissement'],
            [schoolSlogan ? `« ${schoolSlogan} »` : ''],
            [schoolAddress ? `${t(language as Language, 'common.address') || 'Adresse'}: ${schoolAddress}` : ''],
            [schoolPhone ? `${t(language as Language, 'common.phoneLabel') || 'Tel'}: ${schoolPhone}` : ''],
            [schoolYear ? `${t(language as Language, 'common.schoolYearLabel') || 'Année scolaire'}: ${schoolYear}` : ''],
            [''],
            [t(language as Language, 'recovery.priorityListTitle') || 'LISTE PRIORITAIRE DE RECOUVREMENT'],
            [(t(language as Language, 'recovery.generatedOn') || 'Généré le: {{date}}').replace('{{date}}', new Date().toLocaleDateString('fr-FR'))],
            ['']
        ];

        const data = priorityList.map(s => ({
            [t(language as Language, 'recovery.colNameFull') || "Nom Complet"]: `${s.nom} ${s.prenom}`,
            [t(language as Language, 'common.class') || "Classe"]: s.classe,
            [t(language as Language, 'recovery.colPhoneParent') || "Téléphone Parent"]: s.telephone || '-',
            [t(language as Language, 'recovery.colRemainingToPay') || "Reste à Payer"]: formatMontant(s.restant, currency).replace(/[\u202F\u00A0]/g, ' '),
            [t(language as Language, 'recovery.colDelayDays') || "Jours de Retard"]: s.joursRetard,
            [t(language as Language, 'recovery.colPriorityLevel') || "Niveau de Priorité"]: s.niveauPriorite
        }));

        const ws = XLSX.utils.json_to_sheet(data, { origin: "A10" });
        
        // Ajouter l'en-tête personnalisé au-dessus
        XLSX.utils.sheet_add_aoa(ws, headerInfo, { origin: "A1" });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recouvrement");
        XLSX.writeFile(wb, `Recouvrement_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Target className="w-5 h-5 text-red-600" />
                        {t(language as Language, 'recovery.priority') || 'Priorité de Recouvrement'}
                    </h2>
                    <p className="text-sm text-gray-500">
                        {t(language as Language, 'recovery.priorityDesc') || "Liste triée par score d'urgence (Montant + Retard + Taux Classe)"}
                    </p>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                    <button onClick={generateExcelList} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all font-medium text-sm">
                        <Download className="w-4 h-4" />
                        {t(language as Language, 'recovery.exportExcel') || 'Excel'}
                    </button>

                    <button onClick={generatePDFList} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all font-medium text-sm">
                        <FileText className="w-4 h-4" />
                        {t(language as Language, 'recovery.exportPdf') || 'PDF'}
                    </button>

                    <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition-all font-medium text-sm">
                        <Printer className="w-4 h-4" />
                        {t(language as Language, 'recovery.printUrgencies') || 'Imprimer urgences'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 print:hidden">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input
                            type="text"
                            placeholder={t(language as Language, 'recovery.searchStudentPlaceholder') || "Rechercher un élève..."}
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <select
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm appearance-none bg-white"
                            value={filterClass}
                            onChange={(e) => setFilterClass(e.target.value)}
                        >
                            <option value="">{t(language as Language, 'recovery.allClasses') || 'Toutes les classes'}</option>
                            {[...new Set(basePriorityList.map(s => s.classe))].filter(Boolean).sort().map(className => (
                                <option key={className} value={className}>{className}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <select
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm appearance-none bg-white"
                            value={filterCycle}
                            onChange={(e) => setFilterCycle(e.target.value)}
                        >
                            <option value="">{t(language as Language, 'recovery.allCycles') || 'Tous les cycles'}</option>
                            {[...new Set(basePriorityList.map(s => s.cycle))].filter(Boolean).sort().map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {priorityList.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 text-gray-500">
                    {t(language as Language, 'recovery.noStudentMatches') || 'Aucun élève ne correspond aux critères.'}
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden printable-area">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-semibold rounded-tl-xl w-14">#</th>
                                    <th className="p-4 font-semibold">{t(language as Language, 'recovery.studentScore') || 'Élève (Score)'}</th>
                                    <th className="p-4 font-semibold">{t(language as Language, 'recovery.classContact') || 'Classe & Contact'}</th>
                                    <th className="p-4 font-semibold text-right">{t(language as Language, 'recovery.delayDays') || 'Retard (Jours)'}</th>
                                    <th className="p-4 font-semibold text-right">{t(language as Language, 'recovery.remainingAmount') || 'Montant Restant'}</th>
                                    <th className="p-4 font-semibold text-center rounded-tr-xl">{t(language as Language, 'recovery.urgencyLevel') || "Niveau d'urgence"}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm">
                                {priorityList.map((s, index) => {
                                    const urgent = s.niveauPriorite === 'Élevé';
                                    const moyen = s.niveauPriorite === 'Moyen';

                                    return (
                                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4 text-gray-400 font-medium">
                                                {index + 1}
                                            </td>
                                            <td className="p-4">
                                                <p className="font-bold text-gray-800">{s.nom.toUpperCase()} {s.prenom}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{(t(language as Language, 'recovery.score') || 'Score: {{score}}/100').replace('{{score}}', String(s.scorePriorite))}</p>
                                            </td>
                                            <td className="p-4">
                                                <p className="font-medium text-gray-700">{s.classe}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{s.telephone}</p>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${urgent ? 'bg-red-50 text-red-600' : moyen ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                                                    {s.joursRetard}
                                                </span>
                                                {s.trancheInfo && (
                                                    <p className="text-[10px] text-red-500 mt-1">{s.trancheInfo}</p>
                                                )}
                                            </td>
                                            <td className="p-4 text-right font-bold text-red-600">
                                                {formatMontant(s.restant, currency)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${urgent ? 'bg-red-100 text-red-800 border-red-200' :
                                                        moyen ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                                            'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                    }`}>
                                                    {s.niveauPriorite}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
