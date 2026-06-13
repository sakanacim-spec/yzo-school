import { API_BASE_URL } from '../config';
import { parseResponse, getAuthHeaders } from './apiHelpers';

const API_URL = `${API_BASE_URL}/chat`;

export const chatApi = {
    getConversations: async () => {
        const res = await fetch(`${API_URL}/conversations`, {
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    getMessages: async (conversationId: string) => {
        const res = await fetch(`${API_URL}/messages/${conversationId}`, {
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    getUnreadCount: async () => {
        const res = await fetch(`${API_URL}/unread`, {
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    initiateConversation: async (parentId?: string, adminRole?: string) => {
        const res = await fetch(`${API_URL}/initiate`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ parentId, adminRole })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    sendMessage: async (data: { conversationId?: string; text?: string; imageUrl?: string; targetRole?: string; parentId?: string }) => {
        const res = await fetch(`${API_URL}/send`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        return result;
    },

    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append('image', file);

        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: getAuthHeaders(), // content-type will be set automatically by browser
            body: formData
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        return result;
    },

    deleteMessage: async (messageId: number) => {
        const res = await fetch(`${API_URL}/message/${messageId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    deleteConversation: async (conversationId: string) => {
        const res = await fetch(`${API_URL}/conversation/${conversationId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    }
};
