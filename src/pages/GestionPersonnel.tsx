import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, Loader2 } from 'lucide-react';
import { personnelApi } from '../services/personnelApi';
import { UserRole } from '../types';
import { useStore } from '../store/useStore';

interface Personnel {
    id: string;
    nom: string;
    telephone: string;
    role: UserRole;
}

export const GestionPersonnel: React.FC = () => {
    const { user } = useStore();
    const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form state
    const [nom, setNom] = useState('');
    const [telephone, setTelephone] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('professeur');

    const fetchPersonnel = async () => {
        setIsLoading(true);
        try {
            const data = await personnelApi.getPersonnel();
            setPersonnelList(data);
        } catch (error) {
            console.error('Erreur lors du chargement du personnel:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPersonnel();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await personnelApi.createPersonnel({ nom, telephone, password, role });
            // Reset form
            setNom('');
            setTelephone('');
            setPassword('');
            setRole('professeur');
            // Refresh list
            fetchPersonnel();
        } catch (error: any) {
            alert(error.error || 'Erreur lors de la création.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Voulez-vous vraiment supprimer ce compte ?')) return;
        try {
            await personnelApi.deletePersonnel(id);
            fetchPersonnel();
        } catch (error: any) {
            alert(error.error || 'Erreur lors de la suppression.');
        }
    };

    const isAdmin = user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'admin';

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-slate-500 font-bold">Accès réservé à la direction.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-4 p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Users className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">Gestion du Personnel</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Ajoutez et gérez les professeurs, censeurs et comptables.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Formulaire d'ajout */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm h-fit">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-indigo-500" />
                        Nouveau Membre
                    </h2>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nom complet</label>
                            <input 
                                type="text"
                                required
                                value={nom}
                                onChange={e => setNom(e.target.value)}
                                placeholder="ex: M. Dupont"
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-slate-400 mt-1">Pour un professeur, ce nom doit correspondre à celui dans la gestion académique.</p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Numéro de téléphone</label>
                            <input 
                                type="tel"
                                required
                                pattern="[0-9+ ]+"
                                title="Veuillez entrer un numéro valide (chiffres et symbole + uniquement)"
                                value={telephone}
                                onChange={e => setTelephone(e.target.value)}
                                placeholder="Numéro pour la connexion"
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Mot de passe</label>
                            <input 
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Rôle</label>
                            <select 
                                value={role}
                                onChange={e => setRole(e.target.value as UserRole)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-700 dark:text-indigo-400"
                            >
                                <option value="professeur">Professeur / Enseignant</option>
                                <option value="surveillant">Surveillant</option>
                                <option value="censeur">Censeur</option>
                                <option value="comptable">Comptable</option>
                                <option value="superviseur">Superviseur</option>
                                <option value="secretaire">Secrétaire</option>
                                <option value="admin">Administrateur</option>
                            </select>
                        </div>

                        <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Créer le compte'}
                        </button>
                    </form>
                </div>

                {/* Liste du personnel */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        Comptes Administrateurs & Professeurs
                    </h2>

                    {isLoading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                    ) : personnelList.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Aucun personnel enregistré</h3>
                            <p className="text-slate-500">Utilisez le formulaire pour créer le premier compte.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-100 dark:border-slate-700">
                                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">Nom</th>
                                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">Téléphone</th>
                                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider">Rôle</th>
                                        <th className="pb-3 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {personnelList.map(p => (
                                        <tr key={p.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                            <td className="py-4 font-bold text-slate-700 dark:text-slate-200">{p.nom}</td>
                                            <td className="py-4 text-slate-500 font-medium">{p.telephone}</td>
                                            <td className="py-4">
                                                <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-full uppercase">
                                                    {p.role}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right">
                                                {p.role !== 'directeur' && p.role !== 'directeur_general' && (
                                                    <button 
                                                        onClick={() => handleDelete(p.id)}
                                                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                        title="Supprimer"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
