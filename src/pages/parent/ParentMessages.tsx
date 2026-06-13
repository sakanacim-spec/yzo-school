import React, { useEffect, useState } from 'react';
import { parentApi } from '../../services/parentApi';
import { MessageSquare, Bell, Loader2, AlertCircle } from 'lucide-react';

export const ParentMessages: React.FC = () => {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const result = await parentApi.getMessages();
                setMessages(result.messages || []);
            } catch (err: any) {
                setError("Impossible de charger vos messages.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                <p>Récupération de vos messages...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-slate-800">Messages de l'école</h2>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-700 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`p-5 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-md ${message.type === 'warning'
                            ? 'bg-amber-50/50 border-amber-100'
                            : 'bg-white border-slate-100 shadow-sm'
                            }`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${message.type === 'warning'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-blue-100 text-blue-600'
                            }`}>
                            {message.type === 'warning' ? <Bell className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                        </div>

                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <h3 className={`font-bold text-lg ${message.type === 'warning' ? 'text-amber-900' : 'text-slate-800'
                                    }`}>
                                    {message.title}
                                </h3>
                                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                                    {new Date(message.date).toLocaleDateString('fr-FR')}
                                </span>
                            </div>
                            <p className={`text-sm ${message.type === 'warning' ? 'text-amber-800' : 'text-slate-600'
                                }`}>
                                {message.content}
                            </p>
                        </div>
                    </div>
                ))}

                {!loading && messages.length === 0 && (
                    <div className="py-12 bg-white rounded-2xl border border-slate-100 text-center text-slate-500 shadow-sm border-dashed">
                        Vous n'avez aucun message pour le moment.
                    </div>
                )}
            </div>
        </div>
    );
};
