import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Phone, MessageSquare, Send, Users, AlertCircle, Filter, CheckCircle2, BellRing } from 'lucide-react';
import { formatMontant, generateWhatsAppLink, sendBulkSMS } from '../utils/helpers';
import { notificationService } from '../services/notificationService';
import { Student } from '../types';

export const Communication: React.FC = () => {
    const students = useStore((s) => s.students);
    const settings = useStore((s) => s.settings);

    const [activeTab, setActiveTab] = useState<'impayes' | 'tous'>('impayes');
    const [selectedClass, setSelectedClass] = useState<string>('Toutes');
    const [messageTemplate, setMessageTemplate] = useState<string>(
        "Bonjour parent de {nom_eleve},\nSauf erreur, il reste à payer {reste_a_payer} pour la scolarité.\nMerci de régulariser.\nLa Direction."
    );
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; count: number; error?: string } | null>(null);

    const classes = Array.from(new Set(students.map(s => s.classe))).sort();

    // Filtre des élèves selon l'onglet
    const filteredStudents = students.filter(s => {
        if (selectedClass !== 'Toutes' && s.classe !== selectedClass) return false;
        if (activeTab === 'impayes' && s.restant <= 0) return false;
        // On ne garde que ceux qui ont un numéro de téléphone valide
        if (!s.telephone || s.telephone.trim() === '') return false;
        return true;
    });

    const insertVariable = (variable: string) => {
        setMessageTemplate(prev => prev + variable);
    };

    const buildMessage = (student: Student) => {
        let msg = messageTemplate;
        msg = msg.replace(/{nom_eleve}/g, `${student.prenom} ${student.nom}`);
        msg = msg.replace(/{reste_a_payer}/g, formatMontant(student.restant));
        msg = msg.replace(/{classe}/g, student.classe);
        return msg;
    };

    const handleSendWhatsApp = () => {
        if (filteredStudents.length === 0) return alert("Aucun destinataire sélectionné.");
        
        // WhatsApp doesn't easily allow bulk sending without Business API.
        // So we generate the link for the first one and warn the user.
        const firstStudent = filteredStudents[0];
        const msg = buildMessage(firstStudent);
        const link = generateWhatsAppLink(firstStudent.telephone, msg);
        
        alert(`Pour éviter le spam WhatsApp, nous allons ouvrir la conversation pour le premier parent (${firstStudent.nom} ${firstStudent.prenom}).\n\nVous devrez répéter l'opération pour les autres depuis la fiche de l'élève ou utiliser le module SMS pour un envoi de masse en 1 clic.`);
        window.open(link, '_blank');
    };

    const handleSendSMS = async () => {
        if (filteredStudents.length === 0) return alert("Aucun destinataire sélectionné.");
        if (!window.confirm(`Êtes-vous sûr de vouloir envoyer ${filteredStudents.length} SMS ?`)) return;

        setIsSending(true);
        setSendResult(null);

        const recipients = filteredStudents.map(s => ({
            phone: s.telephone,
            message: buildMessage(s)
        }));

        const result = await sendBulkSMS(recipients);
        setSendResult(result);
        setIsSending(false);
    };

    const handleSendPush = async () => {
        if (filteredStudents.length === 0) return alert("Aucun destinataire sélectionné.");
        if (!window.confirm(`Êtes-vous sûr de vouloir envoyer une Notification Push à ${filteredStudents.length} parents ?\n(Cette action est 100% gratuite)`)) return;

        setIsSending(true);
        setSendResult(null);

        let sentCount = 0;
        let failCount = 0;

        for (const student of filteredStudents) {
            const message = buildMessage(student);
            const success = await notificationService.notifyParents(
                student.id,
                message,
                'general',
                activeTab === 'impayes' ? '🚨 Relance de Paiement' : '📢 Message de l\'École'
            );
            if (success) sentCount++;
            else failCount++;
        }

        setSendResult({
            success: sentCount > 0,
            count: sentCount,
            error: failCount > 0 ? `${failCount} push ont échoué (parents non connectés).` : undefined
        });
        setIsSending(false);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-indigo-500" />
                        Communication
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Envoyez des messages ciblés aux parents par SMS ou WhatsApp</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Colonne Gauche : Configuration */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Filtres */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-6">
                            <Filter className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Ciblage</h2>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                <button
                                    onClick={() => setActiveTab('impayes')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                        activeTab === 'impayes' 
                                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Relances Impayés
                                </button>
                                <button
                                    onClick={() => setActiveTab('tous')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                        activeTab === 'tous' 
                                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Tous les parents
                                </button>
                            </div>
                            
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="Toutes">Toutes les classes</option>
                                {classes.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Editeur de message */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Message</h2>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => insertVariable('{nom_eleve}')} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg hover:bg-indigo-100 transition">
                                    + {'{nom_eleve}'}
                                </button>
                                <button onClick={() => insertVariable('{reste_a_payer}')} className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg hover:bg-rose-100 transition">
                                    + {'{reste_a_payer}'}
                                </button>
                                <button onClick={() => insertVariable('{classe}')} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-100 transition">
                                    + {'{classe}'}
                                </button>
                            </div>
                        </div>

                        <textarea
                            value={messageTemplate}
                            onChange={(e) => setMessageTemplate(e.target.value)}
                            rows={6}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                            placeholder="Écrivez votre message ici..."
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Aperçu : {messageTemplate.length} caractères (env. {Math.ceil(messageTemplate.length / 160)} SMS/destinataire).
                        </p>
                    
                        {/* Boutons d'envoi */}
                        <div className="flex flex-col sm:flex-row gap-4 mt-6">
                            <button
                                onClick={handleSendPush}
                                disabled={isSending || filteredStudents.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl font-bold hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                            >
                                {isSending ? (
                                    <span className="animate-pulse">Envoi en cours...</span>
                                ) : (
                                    <>
                                        <BellRing className="w-5 h-5" />
                                        Push ({filteredStudents.length}) - Gratuit
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleSendSMS}
                                disabled={isSending || filteredStudents.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                            >
                                {isSending ? (
                                    <span className="animate-pulse">Envoi en cours...</span>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        SMS ({filteredStudents.length})
                                    </>
                                )}
                            </button>
                            
                            <button
                                onClick={handleSendWhatsApp}
                                disabled={filteredStudents.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                            >
                                <Phone className="w-5 h-5" />
                                WhatsApp
                            </button>
                        </div>

                        {/* Resultats d'envoi */}
                        {sendResult && (
                            <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 ${sendResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                {sendResult.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                <div>
                                    <p className="font-bold">{sendResult.success ? 'Envoi réussi !' : 'Erreur lors de l\'envoi'}</p>
                                    <p className="text-sm">{sendResult.success ? `${sendResult.count} messages ont été envoyés avec succès. ${sendResult.error || ''}` : sendResult.error}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Colonne Droite : Liste des destinataires */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col max-h-[800px]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Destinataires</h2>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2 py-1 rounded-lg">
                            {filteredStudents.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {filteredStudents.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-slate-500 font-medium">Aucun élève ne correspond à vos filtres ou n'a de numéro renseigné.</p>
                            </div>
                        ) : (
                            filteredStudents.map(student => (
                                <div key={student.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-bold text-sm text-slate-900 dark:text-white">{student.nom} {student.prenom}</p>
                                        <span className="text-xs text-slate-500 bg-white dark:bg-slate-800 px-2 py-0.5 rounded shadow-sm border border-slate-100 dark:border-slate-700">{student.classe}</span>
                                    </div>
                                    <p className="text-xs font-mono text-slate-500 mb-2">{student.telephone}</p>
                                    
                                    {activeTab === 'impayes' && student.restant > 0 && (
                                        <p className="text-xs font-bold text-rose-500">Reste: {formatMontant(student.restant)}</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
