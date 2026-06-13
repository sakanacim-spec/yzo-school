import { API_BASE_URL } from '../config';
import { parseResponse, getAuthHeaders } from './apiHelpers';

const API_URL = `${API_BASE_URL}/personnel`;

export const personnelApi = {
    getPersonnel: async () => {
        const res = await fetch(API_URL, {
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    createPersonnel: async (personnelData: any) => {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(personnelData)
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    deletePersonnel: async (id: string) => {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    }
};
