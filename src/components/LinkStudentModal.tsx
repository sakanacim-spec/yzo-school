import React, { useState, useEffect } from 'react';
import { parentApi } from '../services/parentApi';
import { Search, UserPlus, GraduationCap, X, Check, AlertCircle, Loader2 } from 'lucide-react';

interface LinkStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const LinkStudentModal: React.FC<LinkStudentModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [search, setSearch] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [totalStudents, setTotalStudents] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setSearch('');
            setStudents([]);
            setError('');
            setMessage('');
            setHasSearched(false);
            setTotalStudents(null);
        } else {
            // Vérifier le nombre total d'élèves disponibles
            checkTotalStudents();
        }
    }, [isOpen]);

    const checkTotalStudents = async () => {
        try {
            const result = await parentApi.countStudents();
            setTotalStudents(result.count);
        } catch (err) {
            console.error('Erreur comptage élèves:', err);
            setTotalStudents(0);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search.trim().length >= 2) {
                handleSearch();
            } else {
                setStudents([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const handleSearch = async () => {
        setLoading(true);
        setError('');
        try {
            // Utilise 'search' qui cherche dans nom et prenom sur le backend maintenant
            const result = await parentApi.searchStudents({ nom: search });
            if (!result.students || result.students.length === 0) {
                console.warn('Aucun élève trouvé pour:', search);
                setStudents([]);
            } else {
                setStudents(result.students);
            }
            setHasSearched(true);
        } catch (err: any) {
            console.error('Erreur recherche:', err);
            setError(err.error || "Erreur lors de la recherche. Vérifiez votre connexion.");
            setHasSearched(true);
        } finally {
            setLoading(false);
        }
    };

    const handleLink = async (studentId: string) => {
        setLinking(studentId);
        setError('');
        try {
            await parentApi.linkStudent(studentId);
            setMessage("Enfant lié avec succès !");
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err.error || "Impossible de lier cet enfant.");
        } finally {
            setLinking(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Lier un enfant</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <p className="text-slate-500 text-sm">
                        Recherchez votre enfant par son nom ou prénom pour l'ajouter à votre espace parent.
                    </p>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Entrez le nom ou prénom de l'élève..."
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                                <p className="text-xs">Recherche en cours...</p>
                            </div>
                        )}

                        {!loading && students.map((student) => (
                            <div
                                key={student.id}
                                className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group shadow-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                        <GraduationCap className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-slate-800 font-bold">{student.prenom} {student.nom}</p>
                                        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{student.classe}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleLink(student.id)}
                                    disabled={linking !== null}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm shadow-blue-200 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {linking === student.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>Lier</>
                                    )}
                                </button>
                            </div>
                        ))}

                        {!loading && search.length >= 2 && students.length === 0 && (
                            <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
                                <Search className="w-12 h-12 opacity-10" />
                                <p className="font-medium text-slate-500">Aucun élève ne correspond à votre recherche.</p>
                                <p className="text-xs">Vérifiez l'orthographe du nom ou du prénom.</p>
                                {totalStudents === 0 && (
                                    <p className="text-xs text-red-400 mt-2 font-medium">
                                        ⚠️ Aucun élève n'est synchronisé dans la base de données.<br/>
                                        L'administrateur doit importer les données depuis Excel.
                                    </p>
                                )}
                            </div>
                        )}

                        {!loading && !hasSearched && search.length < 2 && (
                            <div className="text-center py-8 text-slate-400 border border-dashed border-slate-100 rounded-2xl">
                                <p className="text-xs mb-2">Tapez au moins 2 caractères pour rechercher</p>
                                {totalStudents !== null && (
                                    <p className="text-xs text-slate-400">
                                        {totalStudents > 0 
                                            ? `💡 ${totalStudents} élève(s) disponible(s) dans la base`
                                            : '⚠️ Aucun élève synchronisé - Contactez l\'administrateur'
                                        }
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium animate-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-sm font-bold animate-in slide-in-from-top-2">
                            <Check className="w-5 h-5 shrink-0" />
                            {message}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 text-center">
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-700 font-bold text-sm"
                    >
                        Annuler
                    </button>
                </div>
            </div>
        </div>
    );
};
