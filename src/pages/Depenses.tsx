import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Expense, ExpenseCategory } from '../types';
import { formatMontant } from '../utils/helpers';
import { Wallet, Plus, X, Search, Filter, TrendingUp, AlertCircle, Calendar } from 'lucide-react';
import { v4 as uuid } from '../utils/uuid';
import { notificationService } from '../services/notificationService';
import { playSuccessSound } from '../utils/audio';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

const CATEGORIES: ExpenseCategory[] = ['Salaires', 'Électricité & Eau', 'Loyer', 'Fournitures', 'Entretien', 'Autre'];
const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4'];

export const Depenses: React.FC = () => {
    const { expenses, addExpense, deleteExpense, user, settings } = useStore();
    const currency = settings?.currency || 'FCFA';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [form, setForm] = useState<Partial<Expense>>({
        titre: '',
        montant: 0,
        categorie: 'Salaires',
        date: new Date().toISOString().split('T')[0],
        beneficiaire: '',
        reference: '',
        commentaire: ''
    });

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.titre || !form.montant || !form.categorie || !form.date) {
            notificationService.error("Veuillez remplir les champs obligatoires.");
            return;
        }

        const newExpense: Expense = {
            id: uuid(),
            titre: form.titre,
            montant: Number(form.montant),
            categorie: form.categorie as ExpenseCategory,
            date: form.date,
            beneficiaire: form.beneficiaire || '',
            reference: form.reference || '',
            commentaire: form.commentaire || '',
            enregistrePar: user?.nom || 'Administration'
        };

        addExpense(newExpense);
        setIsModalOpen(false);
        playSuccessSound();
        notificationService.success("Dépense enregistrée avec succès.");
        setForm({ ...form, titre: '', montant: 0, beneficiaire: '', reference: '', commentaire: '' });
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action impactera le bilan financier.")) {
            deleteExpense(id);
            notificationService.success("Dépense supprimée.");
        }
    };

    // Filtrage
    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const matchSearch = e.titre.toLowerCase().includes(searchQuery.toLowerCase()) || 
                               (e.beneficiaire?.toLowerCase() || '').includes(searchQuery.toLowerCase());
            const matchCat = filterCategory ? e.categorie === filterCategory : true;
            return matchSearch && matchCat;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, searchQuery, filterCategory]);

    // Métriques
    const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.montant, 0), [expenses]);
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthExpenses = useMemo(() => {
        return expenses.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }).reduce((sum, e) => sum + e.montant, 0);
    }, [expenses, currentMonth, currentYear]);

    // Données du graphique par catégorie
    const chartData = useMemo(() => {
        const sums: Record<string, number> = {};
        CATEGORIES.forEach(c => sums[c] = 0);
        expenses.forEach(e => {
            if (sums[e.categorie] !== undefined) sums[e.categorie] += e.montant;
        });
        return Object.keys(sums).map((key, index) => ({
            name: key,
            value: sums[key],
            color: COLORS[index % COLORS.length]
        })).filter(d => d.value > 0);
    }, [expenses]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
            {/* EN-TÊTE */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 bg-gradient-to-br from-rose-900 to-rose-800 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        <Wallet className="w-8 h-8" />
                        Gestion des Dépenses
                    </h1>
                    <p className="text-rose-200 font-medium max-w-xl">
                        Suivez toutes les sorties d'argent, salaires et charges pour un bilan comptable précis.
                    </p>
                </div>
                <div className="relative z-10 flex gap-3">
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 bg-white text-rose-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-rose-50 hover:scale-105 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        Nouvelle Dépense
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center">
                        <Wallet className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500">Dépenses du Mois</p>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                            {formatMontant(monthExpenses, currency)}
                        </h3>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-600 flex items-center justify-center">
                        <TrendingUp className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500">Dépenses Totales (Cumul)</p>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                            {formatMontant(totalExpenses, currency)}
                        </h3>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                        <AlertCircle className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500">Catégorie Majeure</p>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white line-clamp-1">
                            {chartData.sort((a,b) => b.value - a.value)[0]?.name || 'N/A'}
                        </h3>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* GRAPHIQUE */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm lg:col-span-1">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6">Répartition par Catégorie</h3>
                    <div className="h-64">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                                    <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400">Aucune donnée</div>
                        )}
                    </div>
                </div>

                {/* LISTE DES DÉPENSES */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm lg:col-span-2">
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1 relative">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Rechercher une dépense, un bénéficiaire..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                            />
                        </div>
                        <div className="relative min-w-[200px]">
                            <Filter className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-medium appearance-none"
                            >
                                <option value="">Toutes les catégories</option>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700 text-xs uppercase tracking-wider font-black text-slate-400">
                                    <th className="py-3 px-4">Date</th>
                                    <th className="py-3 px-4">Titre / Bénéficiaire</th>
                                    <th className="py-3 px-4">Catégorie</th>
                                    <th className="py-3 px-4 text-right">Montant</th>
                                    <th className="py-3 px-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExpenses.map((expense) => (
                                    <tr key={expense.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                {new Date(expense.date).toLocaleDateString('fr-FR')}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="text-sm font-bold text-slate-800 dark:text-white">{expense.titre}</div>
                                            {expense.beneficiaire && <div className="text-xs text-slate-500">{expense.beneficiaire}</div>}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                {expense.categorie}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                                                - {formatMontant(expense.montant, currency)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <button 
                                                onClick={() => handleDelete(expense.id)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-lg transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredExpenses.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                                            Aucune dépense trouvée.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* MODALE D'AJOUT */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="p-6 bg-rose-50 dark:bg-rose-900/20 flex justify-between items-center border-b border-rose-100 dark:border-rose-900/50">
                            <h3 className="text-xl font-black text-rose-900 dark:text-rose-100 flex items-center gap-2">
                                <Wallet className="w-6 h-6 text-rose-500" />
                                Enregistrer une dépense
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-rose-200 dark:hover:bg-rose-800 rounded-full transition-colors text-rose-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Titre de la dépense *</label>
                                <input 
                                    type="text"
                                    required
                                    placeholder="Ex: Achat de craies, Salaire M. Dupont..."
                                    value={form.titre}
                                    onChange={e => setForm({...form, titre: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Montant ({currency}) *</label>
                                    <input 
                                        type="number"
                                        required
                                        min="0"
                                        value={form.montant || ''}
                                        onChange={e => setForm({...form, montant: Number(e.target.value)})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500 text-rose-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Date *</label>
                                    <input 
                                        type="date"
                                        required
                                        value={form.date}
                                        onChange={e => setForm({...form, date: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Catégorie *</label>
                                <select 
                                    value={form.categorie}
                                    onChange={e => setForm({...form, categorie: e.target.value as any})}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Bénéficiaire (Optionnel)</label>
                                <input 
                                    type="text"
                                    placeholder="Ex: Compagnie d'Électricité"
                                    value={form.beneficiaire}
                                    onChange={e => setForm({...form, beneficiaire: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Référence / Reçu (Optionnel)</label>
                                <input 
                                    type="text"
                                    placeholder="Ex: Facture #1234"
                                    value={form.reference}
                                    onChange={e => setForm({...form, reference: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-rose-500"
                                />
                            </div>

                            <button type="submit" className="w-full mt-4 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black transition-colors shadow-lg shadow-rose-600/30 flex justify-center items-center gap-2">
                                <Wallet className="w-5 h-5" />
                                Enregistrer la sortie d'argent
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
