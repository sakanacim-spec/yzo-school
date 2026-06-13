import React, { useEffect, useState } from 'react';
import { parentApi } from '../../services/parentApi';
import { Clock, Download, Loader2, AlertCircle, CreditCard, UserCheck, Calendar } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const ParentHistorique: React.FC = () => {
    const [payments, setPayments] = useState<any[]>([]);
    const [presences, setPresences] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'payments' | 'presences'>('payments');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const dash = await parentApi.getDashboard();
                const children = dash.students || [];

                // Récupérer paiements
                const allPayPromises = children.map((c: any) => parentApi.getPayments(c.id));
                const payResults = await Promise.all(allPayPromises);
                const mergedPayments = payResults.flatMap((res: any) =>
                    res.payments.map((p: any) => ({
                        ...p,
                        studentName: `${res.student.prenom} ${res.student.nom}`,
                        classe: res.student.classe
                    }))
                ).sort((a: any) => new Date(a.date).getTime());

                setPayments(mergedPayments.reverse());

                // Récupérer présences
                const allPresPromises = children.map((c: any) => parentApi.getPresences(c.id));
                const presResults = await Promise.all(allPresPromises);
                const mergedPresences = presResults.flatMap((res: any, idx: number) =>
                    res.presences.map((p: any) => ({
                        ...p,
                        studentName: `${children[idx].prenom} ${children[idx].nom}`,
                        classe: children[idx].classe
                    }))
                ).sort((a: any) => new Date(a.date + 'T' + a.heure).getTime());

                setPresences(mergedPresences.reverse());

            } catch (err: any) {
                setError("Impossible de charger l'historique.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, []);

    const downloadReceipt = (payment: any) => {
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text('Reçu de Paiement', 20, 20);
        doc.setFontSize(12);
        doc.text(`Élève: ${payment.studentName}`, 20, 40);
        doc.text(`Classe: ${payment.classe}`, 20, 50);
        doc.text(`Date: ${format(new Date(payment.date), 'dd/MM/yyyy')}`, 20, 60);
        doc.text(`Montant payé: ${payment.montant.toLocaleString()} FCFA`, 20, 70);
        doc.text(`N° de reçu: ${payment.recu}`, 20, 80);
        if (payment.note) doc.text(`Note: ${payment.note}`, 20, 90);
        doc.save(`Recu_${payment.recu}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p>Chargement de votre historique...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-slate-800">Historique complet</h2>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('payments')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'payments' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <CreditCard className="w-4 h-4" /> Paiements
                    </button>
                    <button
                        onClick={() => setActiveTab('presences')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'presences' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <UserCheck className="w-4 h-4" /> Présences
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-700 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    {activeTab === 'payments' ? (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Enfant</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Montant</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {payments.length === 0 ? (
                                    <tr><td colSpan={4} className="py-12 text-center text-slate-400">Aucun paiement.</td></tr>
                                ) : (
                                    payments.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {format(new Date(p.date), 'dd MMM yyyy', { locale: fr })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{p.studentName}</div>
                                                <div className="text-xs text-slate-500">{p.classe}</div>
                                            </td>
                                            <td className="px-6 py-4 font-black text-emerald-600">
                                                {p.montant.toLocaleString()} FCFA
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => downloadReceipt(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl">
                                                    <Download className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Heure</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Enfant</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {presences.length === 0 ? (
                                    <tr><td colSpan={3} className="py-12 text-center text-slate-400">Aucun pointage.</td></tr>
                                ) : (
                                    presences.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    {format(new Date(p.date), 'dd MMMM', { locale: fr })}
                                                </div>
                                                <div className="text-xs text-slate-500 ml-6">{p.heure}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{p.studentName}</div>
                                                <div className="text-xs text-slate-500">{p.classe}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${p.statut === 'present' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {p.statut === 'present' ? 'À L\'ÉCOLE' : p.statut}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
