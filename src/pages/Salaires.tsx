import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Payroll } from '../types';
import { Wallet, Search, CheckCircle, Clock, FileText, ChevronDown, Plus, TrendingUp } from 'lucide-react';
import { v4 as uuid } from '../utils/uuid';
import { playSuccessSound } from '../utils/audio';

export const Salaires: React.FC = () => {
    const personnels = useStore(s => s.personnels || []);
    const payrolls = useStore(s => s.payrolls);
    const addPayroll = useStore(s => s.addPayroll);
    const paySalary = useStore(s => s.paySalary);

    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [searchTerm, setSearchTerm] = useState('');
    const [promptOpen, setPromptOpen] = useState(false);
    const [selectedPersonnelId, setSelectedPersonnelId] = useState<string | null>(null);
    const [salaireSaisi, setSalaireSaisi] = useState('150000');

    const filteredPersonnels = personnels.filter(p => {
        const nomMatch = p.nom ? p.nom.toLowerCase().includes(searchTerm.toLowerCase()) : false;
        const prenomMatch = p.prenom ? p.prenom.toLowerCase().includes(searchTerm.toLowerCase()) : false;
        return nomMatch || prenomMatch;
    });

    const getPayrollForPersonnel = (personnelId: string, month: string) => {
        return payrolls.find(p => p.personnelId === personnelId && p.mois === month);
    };

    const handleGeneratePayroll = (personnelId: string) => {
        setSelectedPersonnelId(personnelId);
        setSalaireSaisi('150000');
        setPromptOpen(true);
    };

    const submitGeneratePayroll = () => {
        if (!selectedPersonnelId) return;
        const salaireBase = parseFloat(salaireSaisi.replace(/\s+/g, '')) || 150000; 

        const newPayroll: Payroll = {
            id: uuid(),
            personnelId: selectedPersonnelId,
            mois: currentMonth,
            salaireBase: salaireBase,
            primes: 0,
            deductions: 0,
            netAPayer: salaireBase,
            statut: 'En attente'
        };
        addPayroll(newPayroll);
        playSuccessSound();
        setPromptOpen(false);
        setSelectedPersonnelId(null);
    };

    const handlePay = (payrollId: string) => {
        if (window.confirm("Êtes-vous sûr de vouloir payer ce salaire ? Le montant sera automatiquement déduit de la caisse (Dépenses).")) {
            paySalary(payrollId);
            playSuccessSound();
            alert("Salaire payé et dépense enregistrée.");
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Gestion des Salaires</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Générez et payez les salaires de votre personnel.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un employé..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="relative w-full md:w-48">
                    <input
                        type="month"
                        value={currentMonth}
                        onChange={(e) => setCurrentMonth(e.target.value)}
                        className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm flex flex-col h-full">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 text-sm border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="p-4 font-semibold whitespace-nowrap">Employé</th>
                                <th className="p-4 font-semibold whitespace-nowrap">Rôle</th>
                                <th className="p-4 font-semibold whitespace-nowrap">Mois</th>
                                <th className="p-4 font-semibold whitespace-nowrap text-right">Net à Payer</th>
                                <th className="p-4 font-semibold whitespace-nowrap text-center">Statut</th>
                                <th className="p-4 font-semibold whitespace-nowrap text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {filteredPersonnels.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                                        Aucun membre du personnel trouvé.
                                    </td>
                                </tr>
                            ) : (
                                filteredPersonnels.map(personnel => {
                                    const payroll = getPayrollForPersonnel(personnel.id, currentMonth);
                                    
                                    return (
                                        <tr key={personnel.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-900 dark:text-white">
                                                    {personnel.nom} {personnel.prenom}
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-500 dark:text-slate-400 capitalize">
                                                {personnel.role}
                                            </td>
                                            <td className="p-4 text-slate-500 dark:text-slate-400">
                                                {new Date(currentMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                            </td>
                                            <td className="p-4 text-right font-bold text-slate-900 dark:text-white">
                                                {payroll ? `${payroll.netAPayer.toLocaleString()} F` : '-'}
                                            </td>
                                            <td className="p-4 text-center">
                                                {!payroll ? (
                                                    <span className="text-slate-400 text-sm">Non généré</span>
                                                ) : payroll.statut === 'Payé' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                        <CheckCircle className="w-3 h-3" /> Payé
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                                        <Clock className="w-3 h-3" /> En attente
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {!payroll ? (
                                                    <button
                                                        onClick={() => handleGeneratePayroll(personnel.id)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                                                    >
                                                        <FileText className="w-4 h-4" /> Générer fiche
                                                    </button>
                                                ) : payroll.statut === 'En attente' ? (
                                                    <button
                                                        onClick={() => handlePay(payroll.id)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                                    >
                                                        <Wallet className="w-4 h-4" /> Payer
                                                    </button>
                                                ) : (
                                                    <button
                                                        disabled
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> Réglé
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {promptOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 animate-slideUp">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Salaire de base</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Saisissez le salaire de base pour ce mois (en FCFA) :</p>
                        <input
                            type="number"
                            value={salaireSaisi}
                            onChange={(e) => setSalaireSaisi(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => { setPromptOpen(false); setSelectedPersonnelId(null); }}
                                className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={submitGeneratePayroll}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
                            >
                                Générer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
