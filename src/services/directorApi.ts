import { API_BASE_URL } from '../config.ts';
import { parseResponse, getAuthHeaders } from './apiHelpers.ts';

export interface DirectorLinkRequest {
  id: string;
  school_slug: string;
  status: 'pending' | 'pending_verification' | 'approved' | 'rejected' | 'revoked' | string;
  requested_at: string;
  student_name: string;
  parent_name: string;
}

export interface DirectorRequestsResponse {
  total: number;
  page: number;
  limit: number;
  requests: DirectorLinkRequest[];
}

export interface DirectorRequestDetail extends DirectorLinkRequest {
  reason?: string | null;
  revocation_reason?: string | null;
}

export const directorApi = {
  listRequests: async (page = 1, limit = 20): Promise<DirectorRequestsResponse> => {
    const res = await fetch(`${API_BASE_URL}/director/requests?page=${page}&limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },

  listApprovedRequests: async (page = 1, limit = 20): Promise<DirectorRequestsResponse> => {
    const res = await fetch(`${API_BASE_URL}/director/requests/approved?page=${page}&limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },

  getRequest: async (id: string): Promise<{ request: DirectorRequestDetail }> => {
    const res = await fetch(`${API_BASE_URL}/director/requests/${id}`, {
      headers: getAuthHeaders(),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },

  approveRequest: async (id: string): Promise<{ success: boolean; status: string; request_id: string }> => {
    const res = await fetch(`${API_BASE_URL}/director/requests/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },

  rejectRequest: async (
    id: string,
    rejectionReason: string,
    rejectionReasonCode = 'OTHER'
  ): Promise<{ success: boolean; status: string; request_id: string }> => {
    const res = await fetch(`${API_BASE_URL}/director/requests/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        rejection_reason: rejectionReason,
        rejection_reason_code: rejectionReasonCode,
      }),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },

  revokeRequest: async (
    id: string,
    revocationReason: string
  ): Promise<{ success: boolean; status: string; request_id: string }> => {
    const res = await fetch(`${API_BASE_URL}/director/requests/${id}/revoke`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        revocation_reason: revocationReason,
      }),
    });
    const data = await parseResponse(res);
    if (!res.ok) throw data;
    return data;
  },
};
