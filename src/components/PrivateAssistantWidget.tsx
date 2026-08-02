import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, X, Send, Sparkles, User, Loader2
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getAuthHeaders } from '../services/apiHelpers';
import { API_BASE_URL } from '../config';

interface Message {
    id: string;
    sender: 'bot' | 'user';
    text: string;
}

export const PrivateAssistantWidget: React.FC = () => {
    const user = useStore((s) => s.user);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [hasUnread, setHasUnread] = useState(true);
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            setHasUnread(false);
        }
    }, [isOpen, messages]);

    // Message d'accueil automatique après 2 secondes
    useEffect(() => {
        const timer = setTimeout(() => {
            initWelcomeMessages();
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    const initWelcomeMessages = () => {
        const userName = user?.prenom ? `${user.prenom} ${user.nom || ''}`.trim() : (user?.nom || '');
        const greetingName = userName ? ` ${userName}` : '';
        
        let text = `Bonjour${greetingName} ! Je suis votre assistant virtuel.`;
        if (user?.role === 'superadmin') text = `Bonjour SuperAdmin${greetingName} ! Que puis-je faire pour vous aider à analyser nos plateformes ?`;
        if (['admin', 'directeur', 'directeur_general', 'comptable'].includes(user?.role || '')) text = `Bonjour${greetingName} ! Comment puis-je vous aider dans la gestion de votre école aujourd'hui ?`;
        if (user?.role === 'parent') text = `Bonjour${greetingName} ! Comment puis-je vous aider avec la scolarité de vos enfants ?`;
        
        setMessages([
            { id: 'welcome-1', sender: 'bot', text }
        ]);
    };

    const handleSendCustomMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isThinking) return;

        const userText = input.trim();
        setInput('');

        const newMsg: Message = { id: Date.now().toString(), sender: 'user', text: userText };
        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);

        setIsThinking(true);

        try {
            // Build context based on role
            let context = '';
            const currentPage = window.location.pathname; // Gets the current route like "/dons", "/eleves", etc.
            const userNameContext = user ? `Nom de l'utilisateur avec qui tu parles : ${user.prenom || ''} ${user.nom || ''}. ` : '';
            
            if (user?.role === 'superadmin') {
                const store = useStore.getState();
                context = `${userNameContext}L'utilisateur est actuellement sur la page : ${currentPage}. Stats: ${store.students.length} students across platform.`;
            } else {
                const store = useStore.getState();
                context = `${userNameContext}L'utilisateur est actuellement sur la page : ${currentPage}. School Name: ${store.schoolName}, Students: ${store.students.length}.`;
            }

            const res = await fetch(`${API_BASE_URL}/assistant/private`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ messages: updatedMessages, context })
            });
            const data = await res.json();
            
            setMessages((prev) => [...prev, { 
                id: (Date.now() + 2).toString(), 
                sender: 'bot', 
                text: data.reply || "Désolé, je n'ai pas pu répondre." 
            }]);
        } catch (error) {
            setMessages((prev) => [...prev, { 
                id: (Date.now() + 2).toString(), 
                sender: 'bot', 
                text: "Erreur de connexion à l'assistant." 
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[99999] flex flex-col items-end pointer-events-auto">
            {/* Fenêtre du Chatbot */}
            {isOpen && (
                <div className="w-[360px] sm:w-[400px] h-[520px] bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden mb-4 animate-scaleUp">
                    {/* Header du Bot */}
                    <div className="p-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                                <Bot className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                                    Assistant Yziow
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                                </h4>
                                <p className="text-[11px] text-blue-100 opacity-90">Assistant sécurisé</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-white"
                            title="Fermer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/50 dark:bg-slate-950/50">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.sender === 'bot' && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white shadow-sm mt-1">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                )}
                                <div
                                    className={`relative p-3.5 px-4 text-sm whitespace-pre-wrap leading-relaxed shadow-sm max-w-[85%] ${
                                        msg.sender === 'user'
                                            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm ml-auto'
                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl rounded-tl-sm border border-slate-100 dark:border-slate-700'
                                    }`}
                                >
                                    {msg.text}
                                </div>
                                {msg.sender === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm mt-1">
                                        <User className="w-4 h-4" />
                                    </div>
                                )}
                                {/* Options cliquables sous le message du bot */}
                                {msg.options && msg.options.length > 0 && (
                                    <div className="mt-2 space-y-1.5 w-full max-w-[90%]">
                                        {msg.options.map((opt, idx) => (
                                            <button
                                                key={idx}
                                                onClick={opt.action}
                                                className="w-full flex items-center justify-between p-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-700 rounded-xl transition-all shadow-xs hover:border-blue-300 group text-left"
                                            >
                                                <span className="flex items-center gap-2">
                                                    {opt.icon}
                                                    {opt.label}
                                                </span>
                                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isThinking && (
                            <div className="flex items-center gap-2 text-slate-400 ml-10">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-xs">L'assistant réfléchit...</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Zone de saisie utilisateur */}
                    <form onSubmit={handleSendCustomMessage} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Posez une question..."
                            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white px-3.5 py-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isThinking}
                            className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            )}

            {/* Bouton de déclenchement (Bulle flottante) */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative group flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white p-3.5 rounded-full shadow-2xl hover:scale-105 transition-all duration-300 active:scale-95"
            >
                {/* Avatar Icon */}
                <div className="relative">
                    <Bot className="w-7 h-7 text-white" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
                </div>

                {/* Badge d'aide visible quand fermé */}
                {!isOpen && (
                    <span className="hidden sm:flex items-center gap-1.5 pr-2 font-bold text-xs">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        Besoin d'aide pour commencer ?
                    </span>
                )}

                {/* Notification unread badge */}
                {hasUnread && !isOpen && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce shadow-md">
                        1
                    </span>
                )}
            </button>
        </div>
    );
};
