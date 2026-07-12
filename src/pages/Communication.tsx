import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Phone, MessageSquare, Send, Users, AlertCircle, Filter, CheckCircle2, BellRing } from 'lucide-react';
import { formatMontant, generateWhatsAppLink, sendBulkSMS } from '../utils/helpers';
import { notificationService } from '../services/notificationService';
import { Student } from '../types';
import { t } from '../i18n';
import type { Language } from '../i18n';

export const Communication: React.FC = () => {
    const students = useStore((s) => s.students);
    const settings = useStore((s) => s.settings);
    const messageRappel = useStore((s) => s.messageRappel);

    const { language } = useStore();
    const defaultMsg = t(language as Language, 'communication.defaultMessage') || "Bonjour parent de {nom_eleve},\nSauf erreur, il reste à payer {reste_a_payer} pour la scolarité.\nMerci de régulariser.\nLa Direction.";
    
    const [activeTab, setActiveTab] = useState<'impayes' | 'tous'>('impayes');
    const [selectedClass, setSelectedClass] = useState<string>('Toutes');
    const [messageTemplate, setMessageTemplate] = useState<string>(
        messageRappel || defaultMsg
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
        if (filteredStudents.length === 0) return alert(t(language as Language, 'communication.noRecipientSelected') || "Aucun destinataire sélectionné.");
        
        // WhatsApp doesn't easily allow bulk sending without Business API.
        // So we generate the link for the first one and warn the user.
        const firstStudent = filteredStudents[0];
        const msg = buildMessage(firstStudent);
        const link = generateWhatsAppLink(firstStudent.telephone, msg);
        
        alert(t(language as Language, 'communication.whatsappWarning') 
            ? (t(language as Language, 'communication.whatsappWarning') as string).replace('{{name}}', `${firstStudent.nom} ${firstStudent.prenom}`) 
            : `Pour éviter le spam WhatsApp, nous allons ouvrir la conversation pour le premier parent (${firstStudent.nom} ${firstStudent.prenom}).\n\nVous devrez répéter l'opération pour les autres depuis la fiche de l'élève ou utiliser le module SMS pour un envoi de masse en 1 clic.`);
        window.open(link, '_blank');
    };

    const handleSendSMS = async () => {
        if (filteredStudents.length === 0) return alert(t(language as Language, 'communication.noRecipientSelected') || "Aucun destinataire sélectionné.");
        
        const confirmMsg = t(language as Language, 'communication.confirmSms') 
            ? (t(language as Language, 'communication.confirmSms') as string).replace('{{count}}', filteredStudents.length.toString()) 
            : `Êtes-vous sûr de vouloir envoyer ${filteredStudents.length} SMS ?`;
        if (!window.confirm(confirmMsg)) return;

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
        if (filteredStudents.length === 0) return alert(t(language as Language, 'communication.noRecipientSelected') || "Aucun destinataire sélectionné.");
        
        const confirmMsg = t(language as Language, 'communication.confirmPush') 
            ? (t(language as Language, 'communication.confirmPush') as string).replace('{{count}}', filteredStudents.length.toString()) 
            : `Êtes-vous sûr de vouloir envoyer une Notification Push à ${filteredStudents.length} parents ?\n(Cette action est 100% gratuite)`;
        if (!window.confirm(confirmMsg)) return;

        setIsSending(true);
        setSendResult(null);

        let sentCount = 0;
        let failCount = 0;

        for (const student of filteredStudents) {
            const message = buildMessage(student);
            const success = await notificationService.notifyParents(
                student.id,
                message,
                'message',
                activeTab === 'impayes' ? (t(language as Language, 'communication.paymentReminderTitle') || '🚨 Relance de Paiement') : (t(language as Language, 'communication.schoolMessageTitle') || "📢 Message de l'École")
            );
            if (success) sentCount++;
            else failCount++;
        }

        setSendResult({
            success: sentCount > 0,
            count: sentCount,
            error: failCount > 0 ? (t(language as Language, 'communication.pushFailed') ? (t(language as Language, 'communication.pushFailed') as string).replace('{{count}}', failCount.toString()) : `${failCount} push ont échoué (parents non connectés).`) : undefined
        });
        setIsSending(false);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-indigo-500" />
                        {t(language as Language, 'communication.pageTitle') || 'Communication'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t(language as Language, 'communication.pageSubtitle') || 'Envoyez des messages ciblés aux parents par SMS ou WhatsApp'}</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Colonne Gauche : Configuration */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Filtres */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-6">
                            <Filter className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t(language as Language, 'communication.targeting') || 'Ciblage'}</h2>
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
                                    {t(language as Language, 'communication.unpaidReminders') || 'Relances Impayés'}
                                </button>
                                <button
                                    onClick={() => setActiveTab('tous')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                                        activeTab === 'tous' 
                                            ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {t(language as Language, 'communication.allParents') || 'Tous les parents'}
                                </button>
                            </div>
                            
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="Toutes">{t(language as Language, 'communication.allClasses') || 'Toutes les classes'}</option>
                                {classes.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Editeur de message */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t(language as Language, 'communication.messageTitle') || 'Message'}</h2>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => insertVariable('{nom_eleve}')} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg hover:bg-indigo-100 transition">
                                    + {t(language as Language, 'communication.varStudent') || 'Élève'}
                                </button>
                                <button onClick={() => insertVariable('{reste_a_payer}')} className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg hover:bg-rose-100 transition">
                                    + {t(language as Language, 'communication.varRemaining') || 'Reste à payer'}
                                </button>
                                <button onClick={() => insertVariable('{classe}')} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-100 transition">
                                    + {t(language as Language, 'communication.varClass') || 'Classe'}
                                </button>
                            </div>
                        </div>

                        <textarea
                            value={messageTemplate}
                            onChange={(e) => setMessageTemplate(e.target.value)}
                            rows={6}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                            placeholder={t(language as Language, 'communication.writeMessageHere') || 'Écrivez votre message ici...'}
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            {t(language as Language, 'communication.previewLength') 
                                ? (t(language as Language, 'communication.previewLength') as string)
                                    .replace('{{chars}}', messageTemplate.length.toString())
                                    .replace('{{sms}}', Math.ceil(messageTemplate.length / 160).toString())
                                : `Aperçu : ${messageTemplate.length} caractères (env. ${Math.ceil(messageTemplate.length / 160)} SMS/destinataire).`}
                        </p>
                    
                        {/* Boutons d'envoi */}
                        <div className="flex flex-col sm:flex-row gap-4 mt-6">
                            <button
                                onClick={handleSendPush}
                                disabled={isSending || filteredStudents.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl font-bold hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                            >
                                {isSending ? (
                                    <span className="animate-pulse">{t(language as Language, 'communication.sending') || 'Envoi en cours...'}</span>
                                ) : (
                                    <>
                                        <BellRing className="w-5 h-5" />
                                        {t(language as Language, 'communication.pushBtn') ? (t(language as Language, 'communication.pushBtn') as string).replace('{{count}}', filteredStudents.length.toString()) : `Push (${filteredStudents.length}) - Gratuit`}
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleSendSMS}
                                disabled={isSending || filteredStudents.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                            >
                                {isSending ? (
                                    <span className="animate-pulse">{t(language as Language, 'communication.sending') || 'Envoi en cours...'}</span>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        {t(language as Language, 'communication.smsBtn') ? (t(language as Language, 'communication.smsBtn') as string).replace('{{count}}', filteredStudents.length.toString()) : `SMS (${filteredStudents.length})`}
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
                                    <p className="font-bold">{sendResult.success ? (t(language as Language, 'communication.sendSuccess') || 'Envoi réussi !') : (t(language as Language, 'communication.sendError') || "Erreur lors de l'envoi")}</p>
                                    <p className="text-sm">{sendResult.success ? (t(language as Language, 'communication.messagesSentSuccess') ? (t(language as Language, 'communication.messagesSentSuccess') as string).replace('{{count}}', sendResult.count.toString()).replace('{{error}}', sendResult.error || '') : `${sendResult.count} messages ont été envoyés avec succès. ${sendResult.error || ''}`) : sendResult.error}</p>
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
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t(language as Language, 'communication.recipients') || 'Destinataires'}</h2>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2 py-1 rounded-lg">
                            {filteredStudents.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {filteredStudents.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-slate-500 font-medium">{t(language as Language, 'communication.noMatchingStudents') || "Aucun élève ne correspond à vos filtres ou n'a de numéro renseigné."}</p>
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
                                        <p className="text-xs font-bold text-rose-500">{t(language as Language, 'communication.remaining') || 'Reste:'} {formatMontant(student.restant)}</p>
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
