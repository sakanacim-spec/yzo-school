import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../config';
import { getAuthHeaders } from '../services/apiHelpers';
import { Send, MessageSquare, ShieldCheck, BookOpen, Download, X, Printer, CheckCircle } from 'lucide-react';

export const SupportPage: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useStore();

  const loadMessages = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/support/messages`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Support fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000); // Polling toutes les 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/support/send`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: newMessage })
      });
      if (res.ok) {
        setNewMessage('');
        loadMessages();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handlePrintManual = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Support & Documentation Yziow</h2>
            <p className="text-sm text-blue-100">Discutez avec le SuperAdmin ou consultez le Manuel Officiel</p>
          </div>
        </div>

        <button
          onClick={() => setShowManualModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-bold text-white border border-white/30 transition-all shadow-lg hover:scale-105"
        >
          <BookOpen className="w-4 h-4 text-amber-300" />
          <span>Manuel de Procédures</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900 space-y-4">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Besoin d'aide ?</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Envoyez-nous un message et notre équipe vous répondra dans les plus brefs délais.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === 'school';
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-5 py-3 ${
                  isMe 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                  <p className={`text-[10px] mt-2 text-right ${isMe ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {isMe && <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Modal Manuel de Procédures */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Manuel de Procédures Officiel Yziow</h3>
                  <p className="text-xs text-slate-400">Éditeur : Global Marketing & Technology — Guide Opérationnel Établissement</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintManual}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700"
                  title="Imprimer ou enregistrer en PDF"
                >
                  <Printer className="w-4 h-4 text-blue-400" />
                  <span className="hidden sm:inline">Imprimer / PDF</span>
                </button>
                
                <button
                  onClick={() => setShowManualModal(false)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Document Reader */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 text-slate-800 dark:text-slate-200 text-sm leading-relaxed custom-scrollbar print:p-0">
              
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold">Document Réservé à la Direction :</span> Ce guide encadre et sécurise l'ensemble des opérations administratives, pédagogiques et financières réalisées sur la plateforme Yziow.
                </div>
              </div>

              {/* Procédure 1 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 1 — Inscription & Configuration Initiale
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Se rendre sur <strong>yziow.com</strong>, créer le compte école, puis configurer dans <strong>Paramètres</strong> le nom officiel, le logo de l'établissement, le cachet/sceau numérisé (PNG recommandé) et le numéro de téléphone officiel.
                </p>
              </section>

              {/* Procédure 2 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 2 — Structuration Académique
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Accéder à <strong>Gestion Académique</strong> pour créer les classes (CP1, 6ème, Terminale, etc.), attribuer les matières, définir les coefficients (ex: Mathématiques Coeff. 4) et assigner les enseignants responsables.
                </p>
              </section>

              {/* Procédure 3 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 3 — Inscription des Élèves & Accès Parents
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Enregistrer les élèves individuellement ou par import Excel. La plateforme génère automatiquement le Matricule Unique et la carte QR Code. Communiquer le code d'association au parent pour qu'il suive l'élève depuis l'application parent.
                </p>
              </section>

              {/* Procédure 4 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 4 — Pointage par QR Code & Présences
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Utiliser le module <strong>Scan Présence</strong> à l'entrée de l'école pour scanner la carte scolaire. Les absences saisies par les enseignants en classe déclenchent une alerte instantanée sur le compte du parent.
                </p>
              </section>

              {/* Procédure 5 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 5 — Évaluation & Bulletins PDF Certifiés
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Saisir les notes de devoirs et compositions. La plateforme calcule automatiquement les moyennes pondérées et les rangs. Cliquer sur <strong>Bulletins &gt; Générer PDF</strong> pour imprimer des bulletins certifiés avec logo et cachet.
                </p>
              </section>

              {/* Procédure 6 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 6 — Finances & Reversements Yziow Pay
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Enregistrer les paiements de scolarité pour générer un reçu certifié unique. Dans <strong>Paramètres &gt; Yziow Pay</strong>, configurer le numéro Mobile Money ou le RIB pour recevoir automatiquement les versements des fonds collectés.
                </p>
              </section>

              {/* Procédure 7 */}
              <section className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 7 — Levée de Fonds & Dons (Crowdfunding)
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Lancer des campagnes de dons pour des travaux ou équipements. Les fonds proviennent des parents, des contacts personnels, des réseaux sociaux et des partenaires Yziow (95% reversés à l'école, 5% commission Yziow Pay).
                </p>
              </section>

              {/* Procédure 8 */}
              <section className="space-y-3 pb-4">
                <h4 className="text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Procédure 8 — Support & Programme Ambassadeurs
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Utiliser l'Assistant IA 24h/7j ou la messagerie Support pour communiquer avec l'équipe SuperAdmin. Recommander Yziow à d'autres écoles via le programme Ambassadeur pour percevoir des commissions d'affiliation.
                </p>
              </section>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-500">Document Officiel — Éditée par Global Marketing & Technology</p>
              <button
                onClick={() => setShowManualModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

