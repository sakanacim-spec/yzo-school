const { Client } = require('pg');

async function runWithRefundRole(query, values) {
  const connStr = process.env.YZIOW_REFUND_DATABASE_URL;
  if (!connStr) {
    return { result: null, error: { message: 'Refund DB URL not configured (YZIOW_REFUND_DATABASE_URL missing)' } };
  }
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    const res = await client.query(query, values);
    const result = res.rows[0] ? res.rows[0].result : null;
    return { result, error: null };
  } catch (e) {
    return { result: null, error: { message: e.message || String(e) } };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Legacy unilateral refund RPC (fail-closed at SQL level with SECURITY_BLOCKER).
 */
async function executeRefundRpc({ periodId, providerRefundId, adminActorId, reason }) {
  const query = `SELECT admin_process_parent_pack_refund($1, $2, $3, $4) AS result`;
  return runWithRefundRole(query, [periodId, providerRefundId, adminActorId, reason]);
}

/**
 * Step 1: Create a dual-custody refund reconciliation dossier (status = 'pending_approval').
 */
async function executeCreateRefundReconciliationRpc({
  periodId,
  initiatorAdminId,
  reason,
  verifiedTransactionId,
  verifiedProviderStatus,
  verifiedAmountMinor,
  verifiedCurrency,
  proofStoragePath,
  proofDocumentHash,
  proofRefundedAmountMinor,
  proofCurrency,
  proofBeneficiaryRef,
  proofRefundedAt,
  internalReconciliationRef = null,
  providerRefundId = null,
  initiatorActionProof = null,
}) {
  const query = `SELECT admin_create_parent_pack_refund_reconciliation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) AS result`;
  return runWithRefundRole(query, [
    periodId,
    initiatorAdminId,
    reason,
    verifiedTransactionId,
    verifiedProviderStatus,
    verifiedAmountMinor,
    verifiedCurrency,
    proofStoragePath,
    proofDocumentHash,
    proofRefundedAmountMinor,
    proofCurrency,
    proofBeneficiaryRef,
    proofRefundedAt,
    internalReconciliationRef,
    providerRefundId,
    initiatorActionProof ? JSON.stringify(initiatorActionProof) : null,
  ]);
}

/**
 * Step 2: Approve a pending refund reconciliation dossier by a distinct second SuperAdmin
 * and atomically execute the financial compensation.
 */
async function executeApproveRefundReconciliationRpc({
  reconciliationId,
  approverAdminId,
  verifiedTransactionId,
  verifiedProviderStatus,
  verifiedAmountMinor,
  verifiedCurrency,
  approvalNotes = null,
  approverActionProof = null,
}) {
  const query = `SELECT admin_approve_parent_pack_refund_reconciliation($1, $2, $3, $4, $5, $6, $7, $8) AS result`;
  return runWithRefundRole(query, [
    reconciliationId,
    approverAdminId,
    verifiedTransactionId,
    verifiedProviderStatus,
    verifiedAmountMinor,
    verifiedCurrency,
    approvalNotes,
    approverActionProof ? JSON.stringify(approverActionProof) : null,
  ]);
}

async function executeGetRefundReconciliationRpc({ reconciliationId }) {
  const query = `SELECT admin_get_parent_pack_refund_reconciliation($1) AS result`;
  return runWithRefundRole(query, [reconciliationId]);
}

module.exports = {
  executeRefundRpc,
  executeCreateRefundReconciliationRpc,
  executeApproveRefundReconciliationRpc,
  executeGetRefundReconciliationRpc,
};
