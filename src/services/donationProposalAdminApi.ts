// src/services/donationProposalAdminApi.ts
// Service API client typé pour la gestion administrative des propositions de mécénat.
// Zéro stockage dans localStorage/sessionStorage, zéro fuite d'informations personnelles dans les logs.

import { API_BASE_URL } from '../config.ts';
import { getAuthHeaders } from './apiHelpers.ts';
import type {
  DonationProposalDetail,
  DonationProposalItem,
  DonationProposalQueryParams,
  DonationProposalsListResponse,
  UpdateStatusPayload
} from '../types/donationProposalAdmin.ts';

// ── Classes d'erreur typées ───────────────────────────────────

export class ApiError extends Error {
  public status: number;
  public code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class StatusConflictError extends ApiError {
  constructor(message = "Conflit d'état : la proposition a été modifiée par un autre administrateur.") {
    super(message, 409, 'STATUS_CONFLICT');
    this.name = 'StatusConflictError';
  }
}

export class InvalidTransitionError extends ApiError {
  constructor(message = 'Transition de statut non autorisée par le workflow.') {
    super(message, 422, 'INVALID_STATUS_TRANSITION');
    this.name = 'InvalidTransitionError';
  }
}

export class ProposalNotFoundError extends ApiError {
  constructor(message = 'Proposition introuvable.') {
    super(message, 404, 'PROPOSAL_NOT_FOUND');
    this.name = 'ProposalNotFoundError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Session expirée ou non authentifiée.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Accès réservé au SuperAdmin.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Traitement standardisé des réponses d'erreur HTTP
 */
async function handleResponseError(res: Response): Promise<never> {
  let errBody: { error?: string; code?: string } = {};
  try {
    errBody = await res.json();
  } catch (_) {
    // Si le corps n'est pas du JSON valide, on ignore
  }

  const defaultMsg = errBody.error || `Erreur serveur (${res.status})`;

  switch (res.status) {
    case 401:
      throw new UnauthorizedError(errBody.error || 'Session expirée ou non authentifiée.');
    case 403:
      throw new ForbiddenError(errBody.error || 'Accès réservé au SuperAdmin.');
    case 404:
      throw new ProposalNotFoundError(errBody.error || 'Proposition introuvable.');
    case 409:
      throw new StatusConflictError(errBody.error || "Conflit d'état : la proposition a été modifiée en parallèle.");
    case 422:
      throw new InvalidTransitionError(errBody.error || 'Transition de statut non autorisée.');
    case 400:
      throw new ApiError(defaultMsg, 400, errBody.code || 'BAD_REQUEST');
    default:
      throw new ApiError(defaultMsg, res.status, errBody.code || 'SERVER_ERROR');
  }
}

export const donationProposalAdminApi = {
  /**
   * Récupère la liste paginée et filtrée des propositions de mécénat
   */
  async getProposals(
    params: DonationProposalQueryParams = {},
    signal?: AbortSignal
  ): Promise<DonationProposalsListResponse> {
    const query = new URLSearchParams();

    if (params.status && params.status.trim().length > 0) {
      query.set('status', params.status.trim());
    }
    if (params.sector && params.sector.trim().length > 0) {
      query.set('sector', params.sector.trim());
    }
    if (params.search && params.search.trim().length > 0) {
      query.set('search', params.search.trim());
    }
    if (typeof params.limit === 'number' && params.limit > 0) {
      query.set('limit', String(params.limit));
    }
    if (typeof params.offset === 'number' && params.offset >= 0) {
      query.set('offset', String(params.offset));
    }

    const queryString = query.toString();
    const url = `${API_BASE_URL}/superadmin/donation-proposals${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...getAuthHeaders(),
        'Accept': 'application/json'
      },
      signal
    });

    if (!res.ok) {
      await handleResponseError(res);
    }

    return res.json();
  },

  /**
   * Récupère la fiche détaillée d'une proposition avec son historique d'audit
   */
  async getProposalById(
    id: string,
    signal?: AbortSignal
  ): Promise<DonationProposalDetail> {
    if (!id || typeof id !== 'string') {
      throw new ApiError('Identifiant de proposition invalide.', 400);
    }

    const url = `${API_BASE_URL}/superadmin/donation-proposals/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...getAuthHeaders(),
        'Accept': 'application/json'
      },
      signal
    });

    if (!res.ok) {
      await handleResponseError(res);
    }

    return res.json();
  },

  /**
   * Effectue un changement atomique de statut avec note d'audit
   * N'envoie JAMAIS actor_id ni reviewed_by (strictement déduits du JWT côté serveur)
   */
  async updateProposalStatus(
    id: string,
    payload: UpdateStatusPayload,
    signal?: AbortSignal
  ): Promise<DonationProposalItem> {
    if (!id || typeof id !== 'string') {
      throw new ApiError('Identifiant de proposition invalide.', 400);
    }

    if (!payload.expected_status || !payload.new_status) {
      throw new ApiError('Statuts attendu et nouveau obligatoires.', 400);
    }

    let cleanNote: string | null = null;
    if (payload.note !== undefined && payload.note !== null) {
      const trimmed = payload.note.trim();
      if (trimmed.length > 1000) {
        throw new ApiError('La note d\'audit ne peut pas dépasser 1000 caractères.', 400);
      }
      if (trimmed.length > 0) {
        cleanNote = trimmed;
      }
    }

    // Payload assaini strictement restreint aux 3 propriétés autorisées
    const requestBody = {
      expected_status: payload.expected_status,
      new_status: payload.new_status,
      ...(cleanNote !== null ? { note: cleanNote } : {})
    };

    const url = `${API_BASE_URL}/superadmin/donation-proposals/${encodeURIComponent(id)}/status`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!res.ok) {
      await handleResponseError(res);
    }

    return res.json();
  }
};
