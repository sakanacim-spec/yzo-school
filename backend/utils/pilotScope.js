'use strict';

/**
 * Module de contrôle du périmètre pilote et de suspension pour le rattachement Parent–Élève (P26-B).
 *
 * Variables d'environnement :
 * - PARENT_LINK_PILOT_SCHOOLS : Liste des slugs d'établissements autorisés (séparés par des virgules).
 *                               DÉSACTIVÉ PAR DÉFAUT : Si absent, vide ou invalide, aucun établissement n'est autorisé.
 * - PARENT_LINK_ALLOW_NEW_REQUESTS : "true" (défaut) / "false" pour suspendre les nouvelles demandes.
 * - PARENT_LINK_ALLOW_DECISIONS : "true" (défaut) / "false" pour suspendre les approbations et rejets.
 * - PARENT_LINK_ALLOW_REVOCATIONS : "true" (défaut) / "false" pour suspendre la révocation administrative.
 */

const SLUG_REGEX = /^[a-z0-9_]{1,50}$/;

/**
 * Analyse sécurisée d'un booléen dans les variables d'environnement.
 * Échoue en mode fermé (false) si la valeur est explicitement 'false', '0', 'off', 'no',
 * ou si elle est malformée. Retourne defaultVal uniquement si undefined ou vide.
 */
function parseBoolEnv(val, defaultVal = true) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const str = String(val).trim().toLowerCase();
  if (str === 'true' || str === '1' || str === 'yes' || str === 'on') return true;
  if (str === 'false' || str === '0' || str === 'no' || str === 'off') return false;
  return false; // Valeur malformée -> fail-closed (false)
}

/**
 * Retourne le Set des slugs d'établissements autorisés dans le pilote.
 * Échoue de manière étanche : si la variable est absente ou vide -> Set vide.
 */
function getPilotSchools() {
  const raw = process.env.PARENT_LINK_PILOT_SCHOOLS;
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return new Set();
  }
  const slugs = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const validSlugs = new Set();
  for (const slug of slugs) {
    if (SLUG_REGEX.test(slug)) {
      validSlugs.add(slug);
    }
  }
  return validSlugs;
}

/**
 * Vérifie si un établissement fait partie du périmètre pilote.
 * Aucun slug n'est codé en dur.
 * Refus sécurisé si slug absent ou malformé.
 */
function isSchoolInPilotScope(schoolSlug) {
  if (!schoolSlug || typeof schoolSlug !== 'string') return false;
  const normalized = schoolSlug.trim().toLowerCase();
  if (!SLUG_REGEX.test(normalized)) return false;
  const pilotSet = getPilotSchools();
  return pilotSet.has(normalized);
}

/**
 * Vérifie les autorisations d'accès pour une action donnée ('create', 'read', 'decide', 'revoke').
 * Retourne { allowed: true } ou { allowed: false, errorCode: string, message: string, httpStatus: number }.
 */
function checkPilotAccess(schoolSlug, action = 'read') {
  // 1. Contrôle du périmètre pilote
  if (!isSchoolInPilotScope(schoolSlug)) {
    return {
      allowed: false,
      errorCode: 'PILOT_RESTRICTED',
      message: "La fonctionnalité de rattachement Parent–Élève n'est pas activée pour cet établissement.",
      httpStatus: 403,
    };
  }

  // 2. Contrôle de suspension applicative selon l'action
  if (action === 'create') {
    const allowNew = parseBoolEnv(process.env.PARENT_LINK_ALLOW_NEW_REQUESTS, true);
    if (!allowNew) {
      return {
        allowed: false,
        errorCode: 'OPERATION_SUSPENDED',
        message: 'La création de nouvelles demandes de rattachement est temporairement suspendue.',
        httpStatus: 503,
      };
    }
  } else if (action === 'decide') {
    const allowDecisions = parseBoolEnv(process.env.PARENT_LINK_ALLOW_DECISIONS, true);
    if (!allowDecisions) {
      return {
        allowed: false,
        errorCode: 'OPERATION_SUSPENDED',
        message: 'Le traitement (approbation / rejet) des demandes de rattachement est temporairement suspendu.',
        httpStatus: 503,
      };
    }
  } else if (action === 'revoke') {
    const allowRevocations = parseBoolEnv(process.env.PARENT_LINK_ALLOW_REVOCATIONS, true);
    if (!allowRevocations) {
      return {
        allowed: false,
        errorCode: 'OPERATION_SUSPENDED',
        message: 'La révocation des rattachements est temporairement suspendue.',
        httpStatus: 503,
      };
    }
  }

  return { allowed: true };
}

module.exports = {
  SLUG_REGEX,
  parseBoolEnv,
  getPilotSchools,
  isSchoolInPilotScope,
  checkPilotAccess,
};
