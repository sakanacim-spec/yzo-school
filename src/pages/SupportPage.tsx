import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../config';
import { getAuthHeaders } from '../services/apiHelpers';
import { Send, MessageSquare, ShieldCheck } from 'lucide-react';

export const SupportPage: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Support Yziow</h2>
          <p className="text-sm text-blue-100">Discutez en direct avec l'équipe SuperAdmin</p>
        </div>
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

      {/* Input */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <form onSubmit={handleSend} className="flex items-end gap-3">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrivez votre message ici..."
            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none max-h-32 min-h-[44px]"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
