import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { chatApi } from '../services/chatApi';
import {
    Send, ImageIcon, Phone, MessageCircle,
    ChevronLeft, MoreVertical, Loader2, Check, CheckCheck,
    Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { SupportModal } from './SupportModal';

interface Message {
    id: number;
    sender_id: string;
    message_text: string;
    image_url: string;
    read_status: boolean;
    created_at: string;
}

interface Conversation {
    id: string;
    parent_id: string;
    admin_role: string;
    last_message: string;
    updated_at: string;
    parent?: { nom: string; telephone: string };
}

export const ChatWindow: React.FC = () => {
    const user = useStore((s) => s.user);
    const chatRecipientId = useStore((s) => s.chatRecipientId);
    const setChatRecipientId = useStore((s) => s.setChatRecipientId);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showSupportModal, setShowSupportModal] = useState(false);

    // Charger les conversations
    useEffect(() => {
        loadConversations();
        const interval = setInterval(loadConversations, 10000); // Polling toutes les 10s (en attendant Realtime)
        return () => clearInterval(interval);
    }, []);

    // Charger les messages quand une conversation est active
    useEffect(() => {
        if (activeConv) {
            loadMessages(activeConv.id);
            const interval = setInterval(() => loadMessages(activeConv.id), 3000);
            return () => clearInterval(interval);
        }
    }, [activeConv]);

    // Scroll en bas
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const loadConversations = async () => {
        try {
            const data = await chatApi.getConversations();

            // Gérer le cas où un admin clique sur "Contacter" depuis la liste des parents
            if (chatRecipientId) {
                const existing = data.find((c: any) => c.parent_id === chatRecipientId);
                if (existing) {
                    setActiveConv(existing);
                    setConversations(data);
                } else {
                    try {
                        const realConv = await chatApi.initiateConversation(chatRecipientId);
                        setActiveConv(realConv as any);
                        setConversations([realConv as any, ...data]);
                    } catch (initErr) {
                        console.error("Erreur initiation: ", initErr);
                        setConversations(data);
                    }
                }
                // Nettoyer après usage
                setChatRecipientId(null);
            } else {
                setConversations(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const loadMessages = async (convId: string) => {
        try {
            const data = await chatApi.getMessages(convId);
            setMessages(data);
            // Update unread count after viewing messages
            await useStore.getState().fetchUnreadMessages();
        } catch (err) {
            console.error(err);
        }
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || sending) return;

        setSending(true);
        try {
            await chatApi.sendMessage({
                conversationId: activeConv?.id || undefined,
                parentId: activeConv?.id ? undefined : activeConv?.parent_id,
                text: inputText,
                targetRole: activeConv?.id ? undefined : (user?.role === 'comptable' ? 'comptabilite' : 'administration')
            });
            setInputText('');
            if (activeConv?.id) loadMessages(activeConv.id);
            else {
                // Si c'était une initiation, on recharge tout pour récupérer le vrai ID
                loadConversations();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSending(true);
        try {
            const { imageUrl } = await chatApi.uploadImage(file);
            await chatApi.sendMessage({
                conversationId: activeConv?.id || undefined,
                parentId: activeConv?.id ? undefined : activeConv?.parent_id,
                imageUrl,
                targetRole: activeConv?.id ? undefined : (user?.role === 'comptable' ? 'comptabilite' : 'administration')
            });
            if (activeConv?.id) loadMessages(activeConv.id);
            else loadConversations();
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const startNewConv = async (role: 'administration' | 'comptabilite') => {
        try {
            const realConv = await chatApi.initiateConversation(undefined, role);
            setActiveConv(realConv as any);
            setConversations(prev => {
                const filtered = prev.filter(c => c.id !== realConv.id);
                return [realConv as any, ...filtered];
            });
            setMessages([]);
            setShowSupportModal(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCall = (phone: string) => {
        window.location.href = `tel:${phone}`;
    };

    const handleWhatsApp = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    };

    const handleDeleteMessage = async (messageId: number) => {
        if (!window.confirm('Supprimer ce message ?')) return;
        try {
            await chatApi.deleteMessage(messageId);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (err) {
            console.error(err);
            alert('Erreur lors de la suppression');
        }
    };

    const handleDeleteConversation = async (convId: string) => {
        if (!window.confirm('Supprimer toute la conversation ? Cette action est irréversible.')) return;
        try {
            await chatApi.deleteConversation(convId);
            setConversations(prev => prev.filter(c => c.id !== convId));
            if (activeConv?.id === convId) setActiveConv(null);
        } catch (err) {
            console.error(err);
            alert('Erreur lors de la suppression');
        }
    };

    return (
        <div className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-120px)] bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
            {/* Sidebar Conversations */}
            <div className={`w-full md:w-80 border-r border-slate-100 flex flex-col ${activeConv ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-black text-slate-800 tracking-tight">Messages</h3>
                    {user?.role === 'parent' && (
                        <button
                            onClick={() => setShowSupportModal(true)}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95"
                            title="Nouvelle discussion"
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {user?.role === 'parent' && conversations.length === 0 && (
                        <div className="p-4 space-y-3">
                            <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">Nouvelle discussion</p>
                            <button
                                onClick={() => startNewConv('administration')}
                                className="w-full p-3 rounded-xl bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-100 transition-colors flex items-center gap-3"
                            >
                                <MessageCircle className="w-4 h-4" /> Administration
                            </button>
                            <button
                                onClick={() => startNewConv('comptabilite')}
                                className="w-full p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100 transition-colors flex items-center gap-3"
                            >
                                <MessageCircle className="w-4 h-4" /> Comptabilité
                            </button>
                        </div>
                    )}

                    {conversations.map(conv => (
                        <button
                            key={conv.id}
                            onClick={() => setActiveConv(conv)}
                            className={`w-full p-3 md:p-4 flex items-start gap-2 md:gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${activeConv?.id === conv.id ? 'bg-blue-50/50' : ''}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center font-bold text-slate-600 shrink-0">
                                {user?.role === 'parent'
                                    ? (conv.admin_role === 'comptabilite' ? '💰' : '🏢')
                                    : (conv.parent?.nom?.charAt(0) || 'P')}
                            </div>
                            <div className="flex-1 text-left overflow-hidden">
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-bold text-slate-800 text-sm truncate">
                                        {user?.role === 'parent' ? (conv.admin_role === 'comptabilite' ? 'Comptabilité' : 'Administration') : (conv.parent?.nom || 'Parent inconnu')}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {conv.updated_at ? format(new Date(conv.updated_at), 'HH:mm') : '--:--'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 truncate">{conv.last_message}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-slate-50 ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
                {activeConv ? (
                    <>
                        {/* Header Chat */}
                        <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setActiveConv(null)} className="md:hidden p-2 hover:bg-slate-100 rounded-full">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                                    {activeConv.admin_role === 'comptabilite' ? '💰' : '🏢'}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm leading-tight">
                                        {user?.role === 'parent' ? (activeConv.admin_role === 'comptabilite' ? 'Comptabilité' : 'Administration') : (activeConv.parent?.nom || 'Parent inconnu')}
                                    </h4>
                                    <p className="text-[10px] text-emerald-500 font-medium tracking-tight flex items-center gap-1">
                                        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                        En ligne
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                {activeConv.parent?.telephone && (
                                    <>
                                        <button
                                            onClick={() => handleCall(activeConv.parent!.telephone)}
                                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                                            title="Appeler"
                                        >
                                            <Phone className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleWhatsApp(activeConv.parent!.telephone)}
                                            className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-full transition-colors"
                                            title="WhatsApp"
                                        >
                                            <MessageCircle className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                                <button 
                                    onClick={() => handleDeleteConversation(activeConv.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    title="Supprimer la conversation"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                return (
                                    <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`group relative max-w-[85%] md:max-w-[75%] rounded-2xl p-2.5 md:p-3 shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                                            {msg.image_url ? (
                                                <img src={msg.image_url} alt="Image" className="rounded-lg mb-2 max-h-60 w-full object-cover" />
                                            ) : null}
                                            {msg.message_text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message_text}</p>}
                                            <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-blue-100' : 'text-slate-400'}`}>
                                                <span className="text-[9px] font-medium tracking-tighter">
                                                    {msg.created_at ? format(new Date(msg.created_at), 'HH:mm') : '--:--'}
                                                </span>
                                                {isMe && (
                                                    msg.read_status ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                                                )}
                                            </div>

                                            {/* Bouton de suppression - Toujours visible sur mobile, hover sur desktop */}
                                            <button
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                className={`absolute top-1 ${isMe ? '-left-8' : '-right-8'} p-1.5 text-slate-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all rounded-lg hover:bg-white active:scale-95 shadow-sm border border-slate-100 md:border-none md:shadow-none`}
                                                title="Supprimer"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                                <ImageIcon className="w-6 h-6" />
                            </button>
                            <input
                                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="Taper un message..."
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={!inputText.trim() || sending}
                                className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <MessageCircle className="w-10 h-10" />
                        </div>
                        <h4 className="font-bold text-slate-600 mb-1">Votre messagerie sécurisée</h4>
                        <p className="text-sm max-w-xs">Sélectionnez une discussion pour commencer à échanger avec l'administration.</p>
                    </div>
                )}
            </div>

            <SupportModal 
                isOpen={showSupportModal}
                onClose={() => setShowSupportModal(false)}
                onSelect={startNewConv}
            />
        </div>
    );
};
