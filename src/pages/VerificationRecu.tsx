// ============================================================
// VÉRIFICATION REÇU — Page anti-fraude avec QR Code
// ============================================================
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { QRCodeSVG } from 'qrcode.react';
import {
    ShieldCheck, Search, CheckCircle2, XCircle, FileText, AlertTriangle
} from 'lucide-react';

export const VerificationRecu: React.FC = () => {
    const students = useStore((s) => s.students);
    const schoolName = useStore((s) => s.schoolName);

    const [codeRecherche, setCodeRecherche] = useState('');
    const [resultat, setResultat] = useState<'authentique' | 'invalide' | null>(null);
    const [foundPayment, setFoundPayment] = useState<{
        nom: string; prenom: string; classe: string;
        montant: number; date: string; recu: string; statut: string;
    } | null>(null);

    // ── Recherche dans tous les paiements ──────────────────────
    const rechercherRecu = () => {
        if (!codeRecherche.trim()) return;

        for (const student of students) {
            const payments = student.historiquesPaiements || [];
            for (const p of payments) {
                // Chercher par code de reçu ou par ID de paiement
                if (
                    p.recu?.toLowerCase() === codeRecherche.trim().toLowerCase() ||
                    p.id?.toLowerCase() === codeRecherche.trim().toLowerCase() ||
                    p.reference?.toLowerCase() === codeRecherche.trim().toLowerCase()
                ) {
                    setFoundPayment({
                        nom: student.nom,
                        prenom: student.prenom,
                        classe: student.classe,
                        montant: p.montant,
                        date: p.date,
                        recu: p.recu || p.id,
                        statut: student.status,
                    });
                    setResultat('authentique');
                    return;
                }
            }
        }

        // Aussi chercher par nom de reçu dans le champ recu du student
        const byRecu = students.find(s =>
            s.recu?.toLowerCase() === codeRecherche.trim().toLowerCase()
        );
        if (byRecu) {
            setFoundPayment({
                nom: byRecu.nom,
                prenom: byRecu.prenom,
                classe: byRecu.classe,
                montant: byRecu.dejaPaye,
                date: byRecu.updatedAt,
                recu: byRecu.recu || byRecu.id,
                statut: byRecu.status,
            });
            setResultat('authentique');
            return;
        }

        setResultat('invalide');
        setFoundPayment(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        rechercherRecu();
    };

    const resetSearch = () => {
        setCodeRecherche('');
        setResultat(null);
        setFoundPayment(null);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-purple-600 to-violet-700 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Vérification de reçu</h2>
                        <p className="text-purple-200 text-sm">Système anti-fraude — {schoolName}</p>
                    </div>
                </div>
            </div>

            {/* Formulaire de recherche */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4 text-sm">
                    <Search className="w-4 h-4 text-purple-600" />
                    Entrer le code du reçu
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={codeRecherche}
                            onChange={(e) => { setCodeRecherche(e.target.value); setResultat(null); }}
                            placeholder="Ex: REC-2026-000245 ou code du reçu"
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none font-mono"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            className="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                        >
                            <ShieldCheck className="w-4 h-4" />
                            Vérifier
                        </button>
                        {resultat && (
                            <button
                                type="button"
                                onClick={resetSearch}
                                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition"
                            >
                                Réinitialiser
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* Résultat */}
            {resultat === 'authentique' && foundPayment && (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-emerald-800">✅ Reçu authentique</h3>
                            <p className="text-sm text-emerald-600">Ce reçu est valide et vérifié</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 space-y-3 border border-emerald-100">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Élève</p>
                                <p className="text-sm font-bold text-gray-900">{foundPayment.prenom} {foundPayment.nom}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Classe</p>
                                <p className="text-sm font-bold text-gray-900">{foundPayment.classe}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Montant payé</p>
                                <p className="text-sm font-bold text-emerald-600">{foundPayment.montant.toLocaleString('fr-FR')} FCFA</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Date</p>
                                <p className="text-sm font-bold text-gray-900">
                                    {new Date(foundPayment.date).toLocaleDateString('fr-FR')}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">N° Reçu</p>
                                <p className="text-sm font-bold text-gray-900 font-mono">{foundPayment.recu}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Statut</p>
                                <p className={`text-sm font-bold ${foundPayment.statut === 'Soldé' ? 'text-emerald-600' : 'text-amber-600'
                                    }`}>{foundPayment.statut}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center pt-2">
                        <div className="bg-white p-3 rounded-xl border border-emerald-100">
                            <QRCodeSVG
                                value={`VERIFICATION:${foundPayment.recu}|${foundPayment.prenom} ${foundPayment.nom}|${foundPayment.montant}`}
                                size={100}
                                level="H"
                                bgColor="white"
                                fgColor="#065f46"
                            />
                        </div>
                    </div>

                    <p className="text-center text-xs text-emerald-600 font-medium">
                        Vérifié le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
                    </p>
                </div>
            )}

            {resultat === 'invalide' && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-red-800">❌ Reçu non valide</h3>
                    <p className="text-sm text-red-600 mt-2">
                        Ce code ne correspond à aucun reçu dans notre système.
                    </p>
                    <p className="text-xs text-red-400 mt-3">
                        Si vous pensez qu'il s'agit d'une erreur, contactez l'administration
                    </p>
                </div>
            )}

            {/* Instructions */}
            {!resultat && (
                <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
                    <h4 className="font-semibold text-blue-800 text-sm mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Comment vérifier un reçu ?
                    </h4>
                    <div className="space-y-2 text-xs text-blue-700">
                        <p>1. Entrez le code inscrit sur le reçu (format REC-XXXX-XXXXXX)</p>
                        <p>2. Ou scannez le QR Code imprimé sur le reçu</p>
                        <p>3. Le système vérifiera l'authenticité du reçu</p>
                        <p>4. Toutes les informations du paiement seront affichées</p>
                    </div>
                </div>
            )}
        </div>
    );
};
