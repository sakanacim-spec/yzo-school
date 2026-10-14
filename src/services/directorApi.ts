import { API_BASE_URL } from '../config.ts';
import { parseResponse, getAuthHeaders } from './apiHelpers.ts';

export type DirectorRequestStatus = 'pending' | 'pending_verification' | 'approved' | 'rejected';

export interface DirectorLinkRequest {
  id: string;
  school_slug: string;
  status: DirectorRequestStatus;
  requested_at: string;
  student_name: string;
  parent_name: string;
}

export interface DirectorLinkRequestDetail extends DirectorLinkRequest {
  reason?: string;
  revocation_reason?: string;
}

export interface DirectorRequestsResponse {
  total: number;
  page: number;
  limit: number;
  requests: DirectorLinkRequest[];
}

export interface DirectorActionResponse {
  success: boolean;
  status: string;
  request_id: string;
}

export class DirectorApiError extends Error {
  status: number;
  code?: string;
  current_status?: string;

  constructor(message: string, status: number, code?: string, current_status?: string) {
    super(message);
    this.name = 'DirectorApiError';
    this.status = status;
    this.code = code;
    this.current_status = current_status;
  }
}

async function handleApiResponse<T>(res: Response, defaultMessage: string): Promise<T> {
  let data: any = null;
  try {
    data = await parseResponse(res);
  } catch {
    // Si la réponse n'est pas du JSON valide
    if (!res.ok) {
      throw new DirectorApiError(
        `Erreur serveur (${res.status}) : réponse non valide.`,
        res.status
      );
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || defaultMessage;
    const errorCode = typeof data?.error === 'string' ? data.error : undefined;
    const currentStatus = data?.current_status;

    let friendlyMessage = errorMsg;
    if (res.status === 403) {
      friendlyMessage = "Accès refusé. Vous n'avez pas l'autorisation nécessaire pour cette action.";
    } else if (res.status === 404) {
      friendlyMessage = "Demande introuvable ou déjà supprimée.";
    } else if (res.status === 409 && errorCode === 'INVALID_STATUS_TRANSITION') {
      friendlyMessage = currentStatus
        ? `Cette demande a déjà été traitée (statut actuel : ${currentStatus}).`
        : "Cette demande a déjà été traitée ou se trouve dans un statut incompatible.";
    }

    throw new DirectorApiError(friendlyMessage, res.status, errorCode, currentStatus);
  }

  return data as T;
}

export const directorApi = {
  /**
   * Récupère la liste paginée des demandes de rattachement en attente.
   */
  async listRequests(page: number = 1, limit: number = 20): Promise<DirectorRequestsResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const res = await fetch(`${API_BASE_URL}/director/requests?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return handleApiResponse<DirectorRequestsResponse>(res, 'Impossible de récupérer les demandes de rattachement.');
  },

  /**
   * Récupère le détail d'une demande de rattachement.
   */
  async getRequest(id: string): Promise<{ request: DirectorLinkRequestDetail }> {
    const res = await fetch(`${API_BASE_URL}/director/requests/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return handleApiResponse<{ request: DirectorLinkRequestDetail }>(res, 'Impossible de récupérer le détail de la demande.');
  },

  /**
   * Approuve une demande de rattachement parent-élève.
   */
  async approveRequest(id: string): Promise<DirectorActionResponse> {
    const res = await fetch(`${API_BASE_URL}/director/requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });

    return handleApiResponse<DirectorActionResponse>(res, "Erreur lors de l'approbation de la demande.");
  },

  /**
   * Rejette une demande de rattachement parent-élève avec un motif obligatoire.
   */
  async rejectRequest(
    id: string,
    rejectionReason: string,
    rejectionReasonCode?: string
  ): Promise<DirectorActionResponse> {
    const trimmedReason = rejectionReason?.trim();
    if (!trimmedReason) {
      throw new DirectorApiError('Le motif de rejet est obligatoire.', 400, 'REJECTION_REASON_REQUIRED');
    }

    const payload: { rejection_reason: string; rejection_reason_code?: string } = {
      rejection_reason: trimmedReason,
    };
    if (rejectionReasonCode && rejectionReasonCode.trim()) {
      payload.rejection_reason_code = rejectionReasonCode.trim();
    }

    const res = await fetch(`${API_BASE_URL}/director/requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    return handleApiResponse<DirectorActionResponse>(res, 'Erreur lors du rejet de la demande.');
  },
};
