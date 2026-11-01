const { Client } = require('pg');

/**
 * Execute the secure refund RPC using the dedicated PostgreSQL login role.
 * Reads connection string from YZIOW_REFUND_DATABASE_URL (must be set in the server env).
 * Returns { result, error } where `result` is the function output (or null) and `error` an object with a `message` field.
 */
async function executeRefundRpc({ periodId, providerRefundId, adminActorId, reason }) {
  const connStr = process.env.YZIOW_REFUND_DATABASE_URL;
  if (!connStr) {
    return { result: null, error: { message: 'Refund DB URL not configured (YZIOW_REFUND_DATABASE_URL missing)' } };
  }
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    const query = `SELECT admin_process_parent_pack_refund($1, $2, $3, $4) AS result`;
    const res = await client.query(query, [periodId, providerRefundId, adminActorId, reason]);
    const result = res.rows[0] ? res.rows[0].result : null;
    return { result, error: null };
  } catch (e) {
    return { result: null, error: { message: e.message || String(e) } };
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { executeRefundRpc };
