// Director controller for handling parent‑student link requests
// ---------------------------------------------------------------
// Endpoints (mounted under /api/director):
//   GET    /requests               → list pending & verification requests
//   GET    /requests/:id           → detail of a single request
//   POST   /requests/:id/approve   → approve a request via RPC
//   POST   /requests/:id/reject    → reject a request via RPC (requires reason)

const { supabase } = require('../utils/supabase');

// Allowed roles for director actions (must match specification)
const ALLOWED_ROLES = ['admin', 'directeur', 'directeur_general'];

// Simple UUID validation (RFC 4122)
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

// Pagination: canonical positive decimal integers only (no 0, no leading zeros, no sign/decimals/exponent)
const DECIMAL_POSITIVE_INT = /^[1-9][0-9]*$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Business error codes defined by the SQL contract (migration_p26_b_link_approval_foundation.sql)
// mapped to HTTP statuses. Any other code (SCHOOL_PROFILE_NOT_FOUND, LOCAL_TABLE_NOT_FOUND,
// unknown codes) is treated as an internal error and never detailed to the client.
const RPC_ERROR_HTTP_STATUS = {
  INVALID_REQUEST_ID: 400,
  REJECTION_REASON_REQUIRED: 400,
  INVALID_SCHOOL_SLUG: 400,
  INVALID_DECIDED_BY: 400,
  UNAUTHORIZED_APPROVER: 403,
  REQUEST_NOT_FOUND: 404,
  INVALID_STATUS_TRANSITION: 409,
};

/** Helper to enforce authentication & role */
function ensureAuthorized(req, res) {
  const { role, schoolSlug } = req.user || {};
  if (!schoolSlug) return res.status(403).json({ error: 'Accès non autorisé : établissement manquant.' });
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Permission refusée. Rôle insuffisant.' });
  }
  return null; // means authorized
}

/**
 * Parse a pagination query value.
 * Returns defaultValue when absent, a safe positive integer when valid, or null when invalid.
 */
function parsePositiveInt(raw, defaultValue) {
  if (raw === undefined) return defaultValue;
  if (typeof raw !== 'string' || !DECIMAL_POSITIVE_INT.test(raw)) return null; // arrays, '', '0', '01', '1.5', '2abc'…
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Return a plain-object request body, tolerating a missing or non-object body. */
function getSafeBody(req) {
  const body = req.body;
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/**
 * Translate the JSONB result of an approve/reject RPC into an HTTP response.
 * Only whitelisted business codes are exposed; everything else is a generic 500.
 */
function respondWithRpcResult(res, rpcResult, handlerName, genericMessage) {
  if (!rpcResult || typeof rpcResult !== 'object') {
    return res.status(500).json({ error: 'Réponse RPC vide.' });
  }

  if (rpcResult.success === true) {
    // Idempotent cases are already expressed via the status field
    const { status, request_id } = rpcResult;
    return res.status(200).json({ success: true, status, request_id });
  }

  const code = rpcResult.error;
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(RPC_ERROR_HTTP_STATUS, code)) {
    const httpStatus = RPC_ERROR_HTTP_STATUS[code];
    if (code === 'REQUEST_NOT_FOUND') {
      return res.status(httpStatus).json({ error: 'Demande introuvable.' });
    }
    if (code === 'INVALID_STATUS_TRANSITION') {
      return res.status(httpStatus).json({ error: code, current_status: rpcResult.current_status });
    }
    return res.status(httpStatus).json({ error: code });
  }

  // Internal or unknown failure: log only a sanitized code, never expose it to the client
  const loggedCode = typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : 'UNKNOWN';
  console.error(`[${handlerName}] Unmapped RPC failure:`, loggedCode);
  return res.status(500).json({ error: genericMessage });
}

/** GET /api/director/requests */
async function listRequests(req, res) {
  const authError = ensureAuthorized(req, res);
  if (authError) return;

  const { schoolSlug } = req.user;
  // --- Pagination parameters (strict) ---
  const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
  if (page === null || limit === null || limit > MAX_LIMIT) {
    return res.status(400).json({ error: 'Paramètres de pagination invalides.' });
  }
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    return res.status(400).json({ error: 'Paramètres de pagination invalides.' });
  }

  // Columns we actually need to expose to the director UI
  const SELECT_COLS = 'id,school_slug,status,requested_at,student_name,parent_name';

  try {
    // Total count for the school (exact count)
    const { count: total, error: countErr } = await supabase
      .from('parent_student_link_requests')
      .select('id', { count: 'exact', head: true })
      .eq('school_slug', schoolSlug)
      .in('status', ['pending', 'pending_verification']);
    if (countErr) throw countErr;

    const { data, error } = await supabase
      .from('parent_student_link_requests')
      .select(SELECT_COLS)
      .eq('school_slug', schoolSlug)
      .in('status', ['pending', 'pending_verification'])
      .order('requested_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return res.json({ total: total || 0, page, limit, requests: data || [] });
  } catch (err) {
    console.error('[listRequests] Supabase error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération des demandes.' });
  }
}

/** GET /api/director/requests/:id */
async function getRequest(req, res) {
  const authError = ensureAuthorized(req, res);
  if (authError) return;

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Identifiant de demande invalide (UUID attendu).' });

  const { schoolSlug } = req.user;
  // Explicit column selection – we only expose safe fields
  const SELECT_COLS = 'id,school_slug,status,requested_at,student_name,parent_name,reason,revocation_reason';
  try {
    const { data, error } = await supabase
      .from('parent_student_link_requests')
      .select(SELECT_COLS)
      .eq('id', id)
      .eq('school_slug', schoolSlug)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Demande non trouvée.' });
      throw error;
    }
    return res.json({ request: data });
  } catch (err) {
    console.error('[getRequest] Supabase error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération de la demande.' });
  }
}

/** POST /api/director/requests/:id/approve */
async function approveRequest(req, res) {
  const authError = ensureAuthorized(req, res);
  if (authError) return;

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Identifiant de demande invalide (UUID attendu).' });

  const { id: userId, schoolSlug, name, nom } = req.user;
  const decidedByName = name || nom || null;

  try {
    // Verify the request belongs to the same school (defense‑in‑depth: DB filter + explicit check)
    const { data: reqMeta, error: metaErr } = await supabase
      .from('parent_student_link_requests')
      .select('school_slug,status')
      .eq('id', id)
      .eq('school_slug', schoolSlug)
      .single();
    if (metaErr) {
      if (metaErr.code === 'PGRST116') return res.status(404).json({ error: 'Demande introuvable.' });
      throw metaErr;
    }
    if (!reqMeta || reqMeta.school_slug !== schoolSlug) {
      // Hide existence of requests from other schools
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('approve_parent_student_link', {
      p_request_id: id,
      p_school_slug: schoolSlug,
      p_decided_by: userId,
      p_decided_by_name: decidedByName,
    });

    if (rpcErr) {
      console.error('[approveRequest] RPC error:', rpcErr.message);
      return res.status(500).json({ error: 'Erreur interne lors de l\'approbation.' });
    }

    // rpcResult contract: { success: true, status, request_id } or
    // { success: false, error: <code>, current_status? }
    return respondWithRpcResult(res, rpcResult, 'approveRequest', 'Erreur interne lors de l\'approbation.');
  } catch (err) {
    console.error('[approveRequest] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors de l\'approbation.' });
  }
}

/** POST /api/director/requests/:id/reject */
async function rejectRequest(req, res) {
  const authError = ensureAuthorized(req, res);
  if (authError) return;

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Identifiant de demande invalide (UUID attendu).' });

  const body = getSafeBody(req);
  const { rejection_reason } = body;
  if (!rejection_reason || typeof rejection_reason !== 'string' || rejection_reason.trim() === '') {
    return res.status(400).json({ error: 'Le champ rejection_reason est requis et ne doit pas être vide.' });
  }

  // rejection_reason_code is free text per the SQL contract: absent/null/blank → 'OTHER', non-string → 400
  let rejectionReasonCode = 'OTHER';
  const rawCode = body.rejection_reason_code;
  if (rawCode !== undefined && rawCode !== null) {
    if (typeof rawCode !== 'string') {
      return res.status(400).json({ error: 'Le champ rejection_reason_code doit être une chaîne de caractères.' });
    }
    if (rawCode.trim() !== '') rejectionReasonCode = rawCode.trim();
  }

  const { id: userId, schoolSlug, name, nom } = req.user;
  const decidedByName = name || nom || null;

  try {
    // Verify same school as a safety check (DB filter + explicit check)
    const { data: reqMeta, error: metaErr } = await supabase
      .from('parent_student_link_requests')
      .select('school_slug,status')
      .eq('id', id)
      .eq('school_slug', schoolSlug)
      .single();
    if (metaErr) {
      if (metaErr.code === 'PGRST116') return res.status(404).json({ error: 'Demande introuvable.' });
      throw metaErr;
    }
    if (!reqMeta || reqMeta.school_slug !== schoolSlug) {
      // Hide existence of requests from other schools
      return res.status(404).json({ error: 'Demande introuvable.' });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('reject_parent_student_link', {
      p_request_id: id,
      p_school_slug: schoolSlug,
      p_decided_by: userId,
      p_rejection_reason: rejection_reason,
      p_rejection_reason_code: rejectionReasonCode,
      p_decided_by_name: decidedByName,
    });

    if (rpcErr) {
      console.error('[rejectRequest] RPC error:', rpcErr.message);
      return res.status(500).json({ error: 'Erreur interne lors du rejet.' });
    }

    return respondWithRpcResult(res, rpcResult, 'rejectRequest', 'Erreur interne lors du rejet.');
  } catch (err) {
    console.error('[rejectRequest] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur lors du rejet.' });
  }
}

module.exports = {
  listRequests,
  getRequest,
  approveRequest,
  rejectRequest,
};
