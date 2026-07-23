/**
 * PATCH 9.3 — Rejection signal dedup store
 */

/**
 * @param {string} decisionRequestId
 * @param {string} requestId
 * @param {string} signalType
 * @param {string} signalTarget
 * @param {string} sourceEventId
 * @param {string} eventVersion
 */
export function buildRejectionSignalDedupKey(
  decisionRequestId,
  requestId,
  signalType,
  signalTarget,
  sourceEventId,
  eventVersion
) {
  return [
    decisionRequestId || "unknown",
    requestId || "unknown",
    signalType || "UNKNOWN",
    signalTarget || "UNKNOWN",
    sourceEventId || "unknown",
    eventVersion || "9.3.0",
  ].join("|");
}

/**
 * @param {object} [seed]
 */
export function createRejectionSignalDedupStore(seed = {}) {
  return { keys: seed.keys || {} };
}

/**
 * @param {ReturnType<typeof createRejectionSignalDedupStore>} store
 * @param {string} dedupKey
 */
export function markRejectionSignalDedup(store, dedupKey) {
  if (!store) return false;
  if (store.keys[dedupKey]) return false;
  store.keys[dedupKey] = true;
  return true;
}
