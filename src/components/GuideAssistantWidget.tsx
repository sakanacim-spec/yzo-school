import React, { useState, useEffect, useRef } from 'react';
import { 
    Bot, X, Send, Sparkles, Building2, Users, GraduationCap, 
    ArrowRight, HelpCircle, CheckCircle2, ChevronRight, MessageSquareText
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { t, Language } from '../i18n';
import { API_BASE_URL } from '../config';

interface GuideAssistantWidgetProps {
    onOpenRegisterSchool?: () => void;
    onOpenRegisterParent?: () => void;
    onOpenLogin?: () => void;
}

interface Message {
    id: string;
    sender: 'bot' | 'user';
    text: string;
    options?: { label: string; action: () => void; icon?: React.ReactNode }[];
}

export const GuideAssistantWidget: React.FC<GuideAssistantWidgetProps> = ({
    onOpenRegisterSchool,
    onOpenRegisterParent,
    onOpenLogin
}) => {
    const language = useStore((s) => s.language as Language);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [hasUnread, setHasUnread] = useState(true);
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
        setMessages([
            {
                id: 'welcome-1',
                sender: 'bot',
                text: 'Bonjour ! 👋 Bienvenue sur Yziow. Je suis votre assistant virtuel.',
            },
            {
                id: 'welcome-2',
                sender: 'bot',
                text: 'Pour bien vous orienter, dites-moi quel est votre profil :',
                options: [
                    {
                        label: '🏫 Je suis Directeur / Établissement',
                        icon: <Building2 className="w-4 h-4 text-blue-600" />,
                        action: () => handleRoleSelect('director')
                    },
                    {
                        label: '👨‍👩‍👧 Je suis un Parent d\'élève',
                        icon: <Users className="w-4 h-4 text-emerald-600" />,
                        action: () => handleRoleSelect('parent')
                    },
                    {
                        label: '👨‍🏫 Je suis Enseignant ou Élève',
                        icon: <GraduationCap className="w-4 h-4 text-purple-600" />,
                        action: () => handleRoleSelect('teacher')
                    },
                    {
                        label: '❓ Découvrir les fonctionnalités & Tarifs',
                        icon: <Sparkles className="w-4 h-4 text-amber-500" />,
                        action: () => handleRoleSelect('info')
                    }
                ]
            }
        ]);
    };

    const handleRoleSelect = (role: 'director' | 'parent' | 'teacher' | 'info') => {
        let userLabel = '';
        let botResponse = '';
        let options: { label: string; action: () => void; icon?: React.ReactNode }[] = [];

        if (role === 'director') {
            userLabel = '🏫 Je suis Directeur d\'école';
            botResponse = 'Excellente démarche ! Avec Yziow, vous pouvez gérer votre école de A à Z (bulletins PDF officiels, gestion des frais, présences QR code).\n\nVous bénéficiez de 30 jours d\'essai gratuit sans engagement !';
            options = [
                {
                    label: '🚀 Créer mon école (30j gratuits)',
                    action: () => {
                        setIsOpen(false);
                        onOpenRegisterSchool?.();
                    }
                },
                {
                    label: '🔑 Se connecter à mon espace',
                    action: () => {
                        setIsOpen(false);
                        onOpenLogin?.();
                    }
                },
                {
                    label: '⬅️ Retour au menu principal',
                    action: () => initWelcomeMessages()
                }
            ];
        } else if (role === 'parent') {
            userLabel = '👨‍👩‍👧 Je suis un Parent';
            botResponse = 'Bienvenue ! En tant que parent, Yziow vous permet de suivre en temps réel les notes de votre enfant, ses présences et de recevoir ses bulletins sur votre téléphone.';
            options = [
                {
                    label: '✍️ S\'inscrire en tant que Parent',
                    action: () => {
                        setIsOpen(false);
                        onOpenRegisterParent?.();
                    }
                },
                {
                    label: '🔑 Se connecter à mon compte Parent',
                    action: () => {
                        setIsOpen(false);
                        onOpenLogin?.();
                    }
                },
                {
                    label: '⬅️ Retour au menu principal',
                    action: () => initWelcomeMessages()
                }
            ];
        } else if (role === 'teacher') {
            userLabel = '👨‍🏫 Je suis Enseignant / Élève';
            botResponse = 'Votre compte est créé directement par l\'administration de votre établissement. Vous pouvez utiliser vos identifiants pour accéder à vos cours et notes.';
            options = [
                {
                    label: '🔑 Accéder à la page de connexion',
                    action: () => {
                        setIsOpen(false);
                        onOpenLogin?.();
                    }
                },
                {
                    label: '⬅️ Retour au menu principal',
                    action: () => initWelcomeMessages()
                }
            ];
        } else {
            userLabel = '❓ Informations & Tarifs';
            botResponse = 'Yziow propose :\n• Bulletins PDF certifiés & Calcul de moyennes\n• Scanner QR Code pour la présence des élèves\n• Gestion des reçus de scolarité & Comptabilité\n• Application multi-langue (FR, EN, ES, AR...)\n\nSouhaitez-vous commencer dès maintenant ?';
            options = [
                {
                    label: '🏫 Inscrire mon école',
                    action: () => {
                        setIsOpen(false);
                        onOpenRegisterSchool?.();
                    }
                },
                {
                    label: '👨‍👩‍👧 Créer un compte Parent',
                    action: () => {
                        setIsOpen(false);
                        onOpenRegisterParent?.();
                    }
                },
                {
                    label: '⬅️ Retour au menu',
                    action: () => initWelcomeMessages()
                }
            ];
        }

        setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), sender: 'user', text: userLabel },
            { id: (Date.now() + 1).toString(), sender: 'bot', text: botResponse, options }
        ]);
    };

    const handleSendCustomMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const userText = input.trim();
        setInput('');

        const newMsg: Message = { id: Date.now().toString(), sender: 'user', text: userText };
        
        // Optimistic UI update
        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);

        // Add loading message
        const loadingId = (Date.now() + 1).toString();
        setMessages((prev) => [...prev, { id: loadingId, sender: 'bot', text: '...' }]);

        try {
            const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: updatedMessages })
            });
            const data = await res.json();
            
            // Remove loading and add response
            setMessages((prev) => {
                const withoutLoading = prev.filter(m => m.id !== loadingId);
                return [...withoutLoading, { 
                    id: (Date.now() + 2).toString(), 
                    sender: 'bot', 
                    text: data.reply || "Une erreur est survenue." 
                }];
            });
        } catch (error) {
            setMessages((prev) => {
                const withoutLoading = prev.filter(m => m.id !== loadingId);
                return [...withoutLoading, { 
                    id: (Date.now() + 2).toString(), 
                    sender: 'bot', 
                    text: "Je rencontre actuellement un problème technique." 
                }];
            });
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
                                <p className="text-[11px] text-blue-100 opacity-90">Guide d'orientation instantané</p>
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
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] p-3.5 rounded-[20px] text-xs leading-relaxed font-medium shadow-sm ${
                                        m.sender === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-none'
                                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 rounded-bl-none whitespace-pre-line'
                                    }`}
                                >
                                    {m.text}
                                </div>

                                {/* Options cliquables sous le message du bot */}
                                {m.options && m.options.length > 0 && (
                                    <div className="mt-2 space-y-1.5 w-full max-w-[90%]">
                                        {m.options.map((opt, idx) => (
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
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Zone de saisie utilisateur */}
                    <form onSubmit={handleSendCustomMessage} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Posez une question (ex: tarifs, inscription)..."
                            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white px-3.5 py-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shrink-0"
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
