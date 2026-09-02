'use strict';
// =========================================================================
// Contrôleur SuperAdmin : Gestion des propositions de dons et mécénat (Lot 2)
// Accessible UNIQUEMENT au SuperAdmin authentifié et actif dans public.superadmins
// =========================================================================

const { supabase } = require('../utils/supabase');
const { VALID_SECTORS } = require('../utils/donationProposalValidation');

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_REGEX = /^DON-[0-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

const ALLOWED_STATUSES = Object.freeze([
  'pending',
  'under_review',
  'approved',
  'rejected',
  'archived'
]);

const ALLOWED_QUERY_KEYS = Object.freeze(['status', 'sector', 'search', 'limit', 'offset']);
const ALLOWED_PATCH_KEYS = Object.freeze(['expected_status', 'new_status', 'note']);

/**
 * Middleware garantissant l'en-tête Cache-Control no-store sur toutes les réponses
 */
function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, private');
  next();
}

/**
 * Vérifie si une chaîne représente une date ISO valide
 */
function isValidIsoDate(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}

/**
 * Middleware vérifiant que le compte SuperAdmin existe toujours dans public.superadmins.
 */
async function verifySuperAdminAccount(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, private');

  const userId = req.user && req.user.id;
  if (!userId || typeof userId !== 'string' || !UUID_V4_REGEX.test(userId)) {
    return res.status(403).json({ error: 'Accès réservé au SuperAdmin.' });
  }

  try {
    const { data: admin, error } = await supabase
      .from('superadmins')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error || !admin) {
      return res.status(403).json({ error: 'Accès réservé au SuperAdmin.' });
    }

    next();
  } catch (_) {
    console.error('Erreur API SuperAdmin donation-proposals');
    return res.status(500).json({ error: 'Une erreur technique est survenue.' });
  }
}

/**
 * Valide et assainit une ligne brute de proposition
 */
function sanitizeProposalItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  if (!raw.id || typeof raw.id !== 'string' || !UUID_V4_REGEX.test(raw.id)) return null;
  if (!raw.reference || typeof raw.reference !== 'string' || !REFERENCE_REGEX.test(raw.reference)) return null;
  if (!raw.status || !ALLOWED_STATUSES.includes(raw.status)) return null;
  if (!raw.sector || !VALID_SECTORS.includes(raw.sector)) return null;

  if (typeof raw.full_name !== 'string' || raw.full_name.trim().length === 0 || raw.full_name.length > 100) return null;
  if (typeof raw.role !== 'string' || raw.role.trim().length === 0 || raw.role.length > 100) return null;
  if (typeof raw.company_name !== 'string' || raw.company_name.trim().length === 0 || raw.company_name.length > 200) return null;
  if (typeof raw.country !== 'string' || raw.country.trim().length === 0 || raw.country.length > 100) return null;
  if (typeof raw.target_markets !== 'string' || raw.target_markets.trim().length === 0 || raw.target_markets.length > 300) return null;
  if (typeof raw.email !== 'string' || raw.email.trim().length === 0 || raw.email.length > 254) return null;
  if (typeof raw.phone !== 'string' || raw.phone.trim().length === 0 || raw.phone.length > 30) return null;
  if (typeof raw.support_type !== 'string' || raw.support_type.trim().length === 0) return null;
  if (typeof raw.language !== 'string' || raw.language.trim().length === 0) return null;
  if (raw.consent !== true) return null;

  if (!isValidIsoDate(raw.created_at)) return null;
  if (!isValidIsoDate(raw.updated_at)) return null;

  // Validation des champs facultatifs
  if (raw.sub_sector !== undefined && raw.sub_sector !== null && typeof raw.sub_sector !== 'string') return null;
  if (raw.regulation_declaration !== undefined && raw.regulation_declaration !== null && !['yes', 'no'].includes(raw.regulation_declaration)) return null;
  if (raw.other_sector_details !== undefined && raw.other_sector_details !== null && typeof raw.other_sector_details !== 'string') return null;
  if (raw.organization_type !== undefined && raw.organization_type !== null && typeof raw.organization_type !== 'string') return null;
  if (raw.license !== undefined && raw.license !== null && typeof raw.license !== 'string') return null;
  if (raw.website !== undefined && raw.website !== null && typeof raw.website !== 'string') return null;
  if (raw.internal_notes !== undefined && raw.internal_notes !== null && (typeof raw.internal_notes !== 'string' || raw.internal_notes.length > 1000)) return null;
  if (raw.reviewed_by !== undefined && raw.reviewed_by !== null && (typeof raw.reviewed_by !== 'string' || !UUID_V4_REGEX.test(raw.reviewed_by))) return null;
  if (raw.reviewed_at !== undefined && raw.reviewed_at !== null && !isValidIsoDate(raw.reviewed_at)) return null;

  // Objet assaini (uniquement les propriétés autorisées)
  return {
    id: raw.id,
    reference: raw.reference,
    full_name: raw.full_name,
    role: raw.role,
    company_name: raw.company_name,
    sector: raw.sector,
    sub_sector: raw.sub_sector ?? null,
    regulation_declaration: raw.regulation_declaration ?? null,
    other_sector_details: raw.other_sector_details ?? null,
    organization_type: raw.organization_type ?? null,
    support_type: raw.support_type,
    license: raw.license ?? null,
    country: raw.country,
    target_markets: raw.target_markets,
    email: raw.email,
    phone: raw.phone,
    website: raw.website ?? null,
    language: raw.language,
    consent: true,
    status: raw.status,
    internal_notes: raw.internal_notes ?? null,
    reviewed_by: raw.reviewed_by ?? null,
    reviewed_at: raw.reviewed_at ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

/**
 * Validation et assainissement de la sortie de get_donation_proposals
 */
function sanitizeListOutput(data, expectedLimit, expectedOffset) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data.items)) return null;
  if (!Number.isInteger(data.total) || data.total < 0) return null;
  if (data.limit !== expectedLimit || data.offset !== expectedOffset) return null;
  if (data.items.length > expectedLimit) return null;

  const sanitizedItems = [];
  for (const item of data.items) {
    const clean = sanitizeProposalItem(item);
    if (!clean) return null;
    sanitizedItems.push(clean);
  }

  return {
    items: sanitizedItems,
    total: data.total,
    limit: expectedLimit,
    offset: expectedOffset
  };
}

/**
 * Validation et assainissement de la sortie de get_donation_proposal_by_id
 */
function sanitizeDetailOutput(data, expectedId) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.id !== expectedId) return null;
  if (!Array.isArray(data.audit_trail)) return null;

  const cleanProposal = sanitizeProposalItem(data);
  if (!cleanProposal) return null;

  const sanitizedAuditTrail = [];
  for (const log of data.audit_trail) {
    if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
    if (!log.id || typeof log.id !== 'string' || !UUID_V4_REGEX.test(log.id)) return null;
    if (log.proposal_id !== expectedId) return null;
    if (!log.actor_id || typeof log.actor_id !== 'string' || !UUID_V4_REGEX.test(log.actor_id)) return null;
    if (typeof log.actor_name !== 'string' || log.actor_name.trim().length === 0 || log.actor_name.length > 100) return null;
    if (!log.old_status || !ALLOWED_STATUSES.includes(log.old_status)) return null;
    if (!log.new_status || !ALLOWED_STATUSES.includes(log.new_status)) return null;
    if (log.note !== undefined && log.note !== null && (typeof log.note !== 'string' || log.note.length > 1000)) return null;
    if (!isValidIsoDate(log.created_at)) return null;

    sanitizedAuditTrail.push({
      id: log.id,
      proposal_id: expectedId,
      actor_id: log.actor_id,
      actor_name: log.actor_name,
      old_status: log.old_status,
      new_status: log.new_status,
      note: log.note ?? null,
      created_at: log.created_at
    });
  }

  return {
    ...cleanProposal,
    audit_trail: sanitizedAuditTrail
  };
}

/**
 * Validation et assainissement de la sortie de update_donation_proposal_status
 */
function sanitizeTransitionOutput(data, expectedId, expectedNewStatus) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.id !== expectedId) return null;
  if (data.status !== expectedNewStatus) return null;
  return sanitizeProposalItem(data);
}

/**
 * GET /api/superadmin/donation-proposals
 */
async function getDonationProposals(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');

  const queryKeys = Object.keys(req.query || {});
  for (const k of queryKeys) {
    if (!ALLOWED_QUERY_KEYS.includes(k)) {
      return res.status(400).json({ error: 'Paramètre de requête non autorisé.' });
    }
    if (typeof req.query[k] !== 'string') {
      return res.status(400).json({ error: 'Format de paramètre invalide.' });
    }
  }

  const { status, sector, search, limit: rawLimit, offset: rawOffset } = req.query;

  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Statut de filtre invalide.' });
  }

  if (sector !== undefined && !VALID_SECTORS.includes(sector)) {
    return res.status(400).json({ error: 'Secteur de filtre invalide.' });
  }

  let sanitizedSearch = null;
  if (search !== undefined) {
    if (search.length > 100) {
      return res.status(400).json({ error: 'Terme de recherche trop long (max 100 caractères).' });
    }
    const trimmed = search.trim();
    if (trimmed.length > 0) sanitizedSearch = trimmed;
  }

  let limit = 20;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      return res.status(400).json({ error: 'Le paramètre limit doit être un entier positif.' });
    }
    const parsedLimit = parseInt(rawLimit, 10);
    if (parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: 'Le paramètre limit doit être compris entre 1 et 100.' });
    }
    limit = parsedLimit;
  }

  let offset = 0;
  if (rawOffset !== undefined) {
    if (!/^\d+$/.test(rawOffset)) {
      return res.status(400).json({ error: 'Le paramètre offset doit être un entier positif.' });
    }
    offset = parseInt(rawOffset, 10);
  }

  try {
    const { data, error } = await supabase.rpc('get_donation_proposals', {
      p_status: status || null,
      p_sector: sector || null,
      p_search: sanitizedSearch,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    const sanitized = sanitizeListOutput(data, limit, offset);
    if (!sanitized) {
      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    return res.json(sanitized);
  } catch (_) {
    console.error('Erreur API SuperAdmin donation-proposals');
    return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
  }
}

/**
 * GET /api/superadmin/donation-proposals/:id
 */
async function getDonationProposalById(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');

  const { id } = req.params;
  if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
    return res.status(400).json({ error: 'Identifiant de proposition invalide (UUID v4 attendu).' });
  }

  try {
    const { data, error } = await supabase.rpc('get_donation_proposal_by_id', {
      p_id: id
    });

    if (error) {
      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    if (data === null || data === undefined) {
      return res.status(404).json({ error: 'Proposition introuvable.' });
    }

    const sanitized = sanitizeDetailOutput(data, id);
    if (!sanitized) {
      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    return res.json(sanitized);
  } catch (_) {
    console.error('Erreur API SuperAdmin donation-proposals');
    return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
  }
}

/**
 * PATCH /api/superadmin/donation-proposals/:id/status
 */
async function updateDonationProposalStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');

  const { id } = req.params;
  if (!id || typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
    return res.status(400).json({ error: 'Identifiant de proposition invalide (UUID v4 attendu).' });
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Corps de requête invalide.' });
  }

  const bodyKeys = Object.keys(req.body);
  for (const k of bodyKeys) {
    if (!ALLOWED_PATCH_KEYS.includes(k)) {
      return res.status(400).json({ error: 'Propriété non autorisée dans le corps de requête.' });
    }
  }

  const { expected_status, new_status, note } = req.body;

  if (typeof expected_status !== 'string' || !ALLOWED_STATUSES.includes(expected_status)) {
    return res.status(400).json({ error: 'expected_status manquant ou invalide.' });
  }

  if (typeof new_status !== 'string' || !ALLOWED_STATUSES.includes(new_status)) {
    return res.status(400).json({ error: 'new_status manquant ou invalide.' });
  }

  let sanitizedNote = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string') {
      return res.status(400).json({ error: 'Le champ note doit être une chaîne de caractères.' });
    }
    const trimmed = note.trim();
    if (trimmed.length > 1000) {
      return res.status(400).json({ error: 'La note ne peut pas dépasser 1000 caractères.' });
    }
    if (trimmed.length > 0) sanitizedNote = trimmed;
  }

  const actorId = req.user.id;

  try {
    const { data, error } = await supabase.rpc('update_donation_proposal_status', {
      p_id: id,
      p_expected_status: expected_status,
      p_new_status: new_status,
      p_note: sanitizedNote,
      p_actor_id: actorId
    });

    if (error) {
      const msg = error.message || '';

      if (msg.startsWith('STATUS_CONFLICT:')) {
        console.warn('Conflit de statut proposition partenaire');
        return res.status(409).json({
          error: "Conflit d'état : la proposition a été modifiée par un autre administrateur.",
          code: 'STATUS_CONFLICT'
        });
      }

      if (msg.startsWith('INVALID_STATUS_TRANSITION:')) {
        return res.status(422).json({
          error: 'Transition de statut non autorisée par le workflow.',
          code: 'INVALID_STATUS_TRANSITION'
        });
      }

      if (msg.startsWith('PROPOSAL_NOT_FOUND:')) {
        return res.status(404).json({ error: 'Proposition introuvable.' });
      }

      if (msg.startsWith('VALIDATION_FAILED:')) {
        return res.status(400).json({ error: 'Données de validation invalides.' });
      }

      if (msg.startsWith('ACTOR_NOT_FOUND:')) {
        return res.status(403).json({ error: 'Identifiant administrateur non reconnu.', code: 'ACTOR_NOT_FOUND' });
      }

      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    const sanitized = sanitizeTransitionOutput(data, id, new_status);
    if (!sanitized) {
      console.error('Erreur API SuperAdmin donation-proposals');
      return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
    }

    console.log('Transition proposition partenaire effectuée');
    return res.json(sanitized);
  } catch (_) {
    console.error('Erreur API SuperAdmin donation-proposals');
    return res.status(500).json({ error: 'Une erreur technique est survenue lors du traitement.' });
  }
}

module.exports = {
  noStore,
  UUID_V4_REGEX,
  ALLOWED_STATUSES,
  VALID_SECTORS,
  verifySuperAdminAccount,
  getDonationProposals,
  getDonationProposalById,
  updateDonationProposalStatus
};
