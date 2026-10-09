import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { t, Language } from '../i18n';
import { parentApi } from '../services/parentApi';
import { Search, UserPlus, GraduationCap, X, Check, AlertCircle, CheckSquare, Square } from 'lucide-react';

interface LinkStudentProps {
    onComplete: () => void;
}

export const LinkStudent: React.FC<LinkStudentProps> = ({ onComplete }) => {
    const { language } = useStore();
    const [search, setSearch] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [transferPrompt, setTransferPrompt] = useState<{ studentId: string; globalId: string } | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
                successTimerRef.current = null;
            }
        };
    }, []);

    // Recherche automatique avec debounce
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
            const result = await parentApi.searchStudents({ nom: search });
            // Éliminer les doublons côté frontend juste au cas où
            const uniqueStudents = Array.from(new Map(result.students.map((s: any) => [s.id, s])).values());
            setStudents(uniqueStudents);
        } catch (err: any) {
            setError(t(language as Language, 'parent.searchError') || "Erreur lors de la recherche.");
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id: string, isAlreadyLinked: boolean) => {
        if (isAlreadyLinked) return;
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBulkLink = async () => {
        if (selectedIds.length === 0) return;
        setLinking(true);
        setError('');
        try {
            await parentApi.linkStudents(selectedIds);

            setMessage(`${selectedIds.length} ${t(language as Language, 'parent.linkSuccessSuffix') || 'enfant(s) lié(s) avec succès !'}`);
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => {
                onComplete();
            }, 1500);
        } catch (err: any) {
            if (err.error === 'TRANSFER_REQUIRED' && err.studentId && err.target_student_global_id) {
                setTransferPrompt({ studentId: err.studentId, globalId: err.target_student_global_id });
            } else {
                setError(err.error || t(language as Language, 'parent.linkError') || "Impossible de lier les élèves sélectionnés.");
            }
        } finally {
            setLinking(false);
        }
    };

    const handleTransferConfirm = async () => {
        if (!transferPrompt || isTransferring) return;
        setIsTransferring(true);
        setError('');
        try {
            const res = await parentApi.transferIdentity(transferPrompt.studentId, transferPrompt.globalId);
            if (res.status === 'created' || res.status === 'already_mapped') {
                setMessage(t(language as Language, 'parent.linkSuccess') || "Enfant transféré avec succès !");
                // Remove the transferred student from selectedIds
                setSelectedIds(prev => prev.filter(id => id !== transferPrompt.studentId));
                if (successTimerRef.current) clearTimeout(successTimerRef.current);
                successTimerRef.current = setTimeout(() => {
                    setTransferPrompt(null);
                    // Optionally refresh the list or trigger complete if all done
                    if (selectedIds.length <= 1) onComplete();
                }, 1500);
            } else {
                setError("Erreur inattendue lors du transfert.");
            }
        } catch (err: any) {
            const code = err.error || '';
            if (code === 'IDENTITY_CONFLICT' || code === 'MAPPING_CONFLICT') {
                setError("Conflit d'identité. Veuillez recommencer la recherche.");
                setTransferPrompt(null);
            } else if (code === 'TARGET_NOT_OWNED' || code === 'DESTINATION_NOT_OWNED') {
                setError("Vous n'avez pas l'autorisation de transférer cet enfant.");
                setTransferPrompt(null);
            } else {
                setError("Erreur lors du transfert. Veuillez réessayer.");
            }
        } finally {
            setIsTransferring(false);
        }
    };

    const handleTransferCancel = () => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
        setTransferPrompt(null);
        setError('');
    };

    const handleCancelAll = () => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
        onComplete();
    };

    return (
        <div className="space-y-6">
            {transferPrompt ? (
                <div className="space-y-4">
                    <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                            <UserPlus className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-lg">Enfant déjà reconnu</h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Nous avons retrouvé l'identité de cet enfant dans un autre établissement. Vous pouvez confirmer sa liaison à cet établissement tout en conservant son historique et ses droits Parent Pack existants, lorsqu'ils sont applicables.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                            onClick={handleTransferCancel}
                            disabled={isTransferring}
                            className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-colors disabled:opacity-50"
                        >
                            {t(language as Language, 'common.cancel') || 'Annuler'}
                        </button>
                        <button
                            onClick={handleTransferConfirm}
                            disabled={isTransferring}
                            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isTransferring ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Confirmer le transfert'
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm mt-4">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="flex items-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300 text-sm mt-4">
                            <Check className="w-4 h-4 shrink-0" />
                            {message}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tighter">{t(language as Language, 'parent.registerChildren') || 'Enregistrez vos enfants'}</h2>
                        <p className="text-slate-500 text-sm font-medium">
                            {t(language as Language, 'parent.registerChildrenDesc') || 'Recherchez vos enfants par leur nom et cochez-les pour les lier à votre compte.'}
                        </p>
                    </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t(language as Language, 'parent.enterName') || 'Entrez un nom...'}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all shadow-inner"
                />
            </div>

            {loading && (
                <div className="flex justify-center py-4">
                    <div className="w-8 h-8 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                </div>
            )}

            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {students.map((student) => {
                    const isSelected = selectedIds.includes(student.id);
                    const isAlreadyLinked = student.is_linked;
                    return (
                        <div
                            key={student.id}
                            onClick={() => toggleSelect(student.id, isAlreadyLinked)}
                            className={`flex items-center justify-between p-4 border rounded-xl transition-all group ${isAlreadyLinked
                                ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
                                : isSelected
                                    ? 'bg-blue-50 border-blue-200 cursor-pointer'
                                    : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-md cursor-pointer'
                                }`}
                        >
                            <div className="flex items-center gap-3 text-left">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isAlreadyLinked ? 'bg-slate-200' : isSelected ? 'bg-blue-600' : 'bg-blue-50'}`}>
                                    <GraduationCap className={`w-5 h-5 ${isAlreadyLinked ? 'text-slate-400' : isSelected ? 'text-white' : 'text-blue-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-900 font-bold truncate">{student.prenom} {student.nom}</p>
                                    <p className="text-slate-500 text-[11px] font-medium uppercase tracking-tight">{student.classe} • {student.cycle}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {isAlreadyLinked ? (
                                    <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">{t(language as Language, 'parent.linked') || 'Lié'}</span>
                                ) : (
                                    <div className={isSelected ? 'text-blue-400' : 'text-slate-500'}>
                                        {isSelected ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {!loading && search.length >= 2 && students.length === 0 && (
                    <div className="text-center py-8 text-blue-300/60 flex flex-col items-center gap-2">
                        <X className="w-8 h-8 opacity-20" />
                        <p>{t(language as Language, 'students.noResults') || 'Aucun élève trouvé.'}</p>
                    </div>
                )}
            </div>

            {selectedIds.length > 0 && (
                <button
                    onClick={handleBulkLink}
                    disabled={linking}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    {linking ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <UserPlus className="w-5 h-5" />
                            {t(language as Language, 'parent.linkSelectedPrefix') || 'Lier les'} {selectedIds.length} {t(language as Language, 'parent.linkSelectedSuffix') || 'enfant(s) sélectionnés'}
                        </>
                    )}
                </button>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {message && (
                <div className="flex items-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300 text-sm">
                    <Check className="w-4 h-4 shrink-0" />
                    {message}
                </div>
            )}

            <button
                onClick={handleCancelAll}
                className="w-full text-slate-400 text-xs font-black uppercase tracking-widest hover:text-blue-600 transition-colors py-2"
            >
                {selectedIds.length > 0 ? (t(language as Language, 'common.cancel') || 'Annuler') : (t(language as Language, 'common.later') || 'Plus tard')}
            </button>
                </>
            )}
        </div>
    );
};
