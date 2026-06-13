import React, { useEffect, useState } from 'react';
import { parentApi } from '../../services/parentApi';
import { FileText, Download, Loader2, AlertCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const ParentRecus: React.FC = () => {
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchRecus = async () => {
            try {
                const dash = await parentApi.getDashboard();
                const children = dash.students || [];

                const allPayPromises = children.map((c: any) => parentApi.getPayments(c.id));
                const results = await Promise.all(allPayPromises);

                const merged = results.flatMap((res: any) =>
                    res.payments.map((p: any) => ({
                        ...p,
                        studentName: `${res.student.prenom} ${res.student.nom}`,
                        classe: res.student.classe
                    }))
                ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                setPayments(merged);
            } catch (err: any) {
                setError("Impossible de charger vos reçus.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchRecus();
    }, []);

    const downloadReceipt = (payment: any) => {
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text('Reçu EduFinance', 20, 20);
        doc.setFontSize(12);
        doc.text(`Reçu N° : ${payment.recu}`, 20, 40);
        doc.text(`Date : ${format(new Date(payment.date), 'dd/MM/yyyy')}`, 20, 50);
        doc.text(`Élève : ${payment.studentName}`, 20, 60);
        doc.text(`Classe : ${payment.classe}`, 20, 70);
        doc.text(`Montant payé : ${payment.montant.toLocaleString()} FCFA`, 20, 80);
        if (payment.note) {
            doc.text(`Note : ${payment.note}`, 20, 90);
        }

        doc.save(`Recu_${payment.recu}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p>Chargement de vos reçus...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-slate-800">Mes reçus</h2>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-700 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {payments.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100 border-dashed">
                        Aucun reçu disponible pour l'instant.
                    </div>
                ) : (
                    payments.map(payment => (
                        <div key={payment.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between hover:shadow-md transition-shadow group">
                            <div className="mb-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-slate-400">#{payment.recu}</span>
                                </div>
                                <h3 className="font-bold text-slate-800 text-lg mb-1">{payment.montant.toLocaleString()} FCFA</h3>
                                <p className="text-sm font-medium text-slate-600 truncate">{payment.studentName}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {format(new Date(payment.date), 'dd MMM yyyy', { locale: fr })}
                                </p>
                            </div>

                            <button
                                onClick={() => downloadReceipt(payment)}
                                className="w-full py-2.5 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-700 font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2 border border-slate-200 hover:border-blue-600"
                            >
                                <Download className="w-4 h-4" />
                                Télécharger le PDF
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
