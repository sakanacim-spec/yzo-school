import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { BulletinTogoPDF } from '../components/pdf/BulletinTogoPDF';
import { calculerBulletinsClasse, BulletinEleveResultat } from '../utils/bulletinCalculations';
import { useReactToPrint } from 'react-to-print';
import { FileSpreadsheet, Printer, Users, Award, ShieldCheck } from 'lucide-react';

export const Bulletins: React.FC = () => {
    const { 
        currentPeriode, students, matieres, classeMatieres, notes,
        schoolName, schoolLogo, schoolStamp, schoolYear 
    } = useStore();

    const classesList = Array.from(new Set(students.map(s => s.classe))).sort();
    const [selectedClasse, setSelectedClasse] = useState('');
    const [bulletinsCalcules, setBulletinsCalcules] = useState<BulletinEleveResultat[]>([]);

    // Component ref for printing
    const printRef = useRef<HTMLDivElement>(null);

    // Fonction d'impression
    const handlePrintAll = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Bulletins_${selectedClasse}_${currentPeriode.replace(/ /g, '_')}`,
        pageStyle: `
          @page { size: A4 portrait; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-after: always; break-after: page; }
          }
        `
    });

    const validerCalcul = () => {
        if (!selectedClasse) return;
        const resultats = calculerBulletinsClasse(
            selectedClasse, 
            currentPeriode, 
            students, 
            matieres, 
            classeMatieres, 
            notes,
            useStore.getState().presences
        );
        setBulletinsCalcules(resultats);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-orange-500 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-white/20 rounded-xl">
                        <FileSpreadsheet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Générateur de Bulletins (Modèle Officiel DRE)</h2>
                        <p className="text-amber-100">Calcul automatique des moyennes, rangs et génération PDF.</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm font-semibold opacity-80 uppercase tracking-widest">{currentPeriode}</p>
                </div>
            </div>

            {/* Outils de génération */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Classe</label>
                    <select
                        value={selectedClasse}
                        onChange={(e) => setSelectedClasse(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 font-bold"
                    >
                        <option value="">Sélectionner une classe...</option>
                        {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <button
                    onClick={validerCalcul}
                    disabled={!selectedClasse}
                    className="bg-gray-800 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-900 shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                    <ShieldCheck className="w-5 h-5" />
                    Calculer
                </button>
                <button
                    onClick={handlePrintAll}
                    disabled={bulletinsCalcules.length === 0}
                    className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                    <Printer className="w-5 h-5" />
                    Imprimer (Lot PDF)
                </button>
            </div>

            {/* Aperçu des Résultats (Liste) */}
            {bulletinsCalcules.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Users className="w-5 h-5 text-gray-500" />
                            Aperçu des résultats ({bulletinsCalcules.length} élèves)
                        </h3>
                        <div className="text-sm flex gap-4">
                            <span>Moy. Max : <b className="text-emerald-600">{bulletinsCalcules[0].moyenneMax.toFixed(2)}</b></span>
                            <span>Moy. Cl. : <b className="text-blue-600">{bulletinsCalcules[0].moyenneClasse.toFixed(2)}</b></span>
                        </div>
                    </div>
                    <div className="p-4 grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
                        {bulletinsCalcules.map((b) => (
                            <div key={b.eleve.id} className="border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                                <div className="absolute right-0 top-0 w-2 h-full bg-amber-500"></div>
                                <h4 className="font-bold text-gray-900 group-hover:text-amber-600 transition">{b.eleve.nom} {b.eleve.prenom}</h4>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-gray-50 p-2 rounded">
                                        <p className="text-gray-500 text-xs uppercase">Moy. Gen.</p>
                                        <p className={`font-black text-lg ${b.moyenneGenerale >= 10 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {b.moyenneGenerale.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded">
                                        <p className="text-gray-500 text-xs uppercase">Rang</p>
                                        <p className="font-black text-lg text-blue-600 flex items-center gap-1">
                                            <Award className="w-4 h-4" /> {b.rangGeneral}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* DIV INVISIBLE CONTENANT TOUS LES BULLETINS POUR IMPRESSION */}
            <div className="hidden">
                <div ref={printRef} className="print-container">
                    {bulletinsCalcules.map((b) => (
                        <div key={b.eleve.id} className="page-break w-[210mm] h-[297mm] overflow-hidden bg-white mx-auto box-border" style={{ pageBreakAfter: 'always' }}>
                            <BulletinTogoPDF
                                data={b}
                                schoolName={schoolName}
                                schoolLogo={schoolLogo}
                                schoolStamp={schoolStamp}
                                schoolYear={schoolYear}
                                studentPhoto={b.eleve.photoUrl || null}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Message de bienvenue */}
            {bulletinsCalcules.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                    <FileSpreadsheet className="w-16 h-16 text-gray-200 mb-4" />
                    <p className="text-gray-500 font-semibold text-lg text-center max-w-sm">
                        Sélectionnez une classe puis calculez pour prévisualiser et imprimer les bulletins.
                    </p>
                </div>
            )}
        </div>
    );
};
