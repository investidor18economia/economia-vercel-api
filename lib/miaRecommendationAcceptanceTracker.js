/**
 * PATCH 9.2 — Acceptance signal request-scoped dedup store
 */

/**
 * @param {string} decisionRequestId
 * @param {string} signalType
 * @param {string} signalTarget
 * @param {string} sourceEventId
 * @param {string} eventVersion
 */
export function buildAcceptanceSignalDedupKey(
  decisionRequestId,
  signalType,
  signalTarget,
  sourceEventId,
  eventVersion
) {
  return [
    decisionRequestId || "unknown",
    signalType || "UNKNOWN",
    signalTarget || "UNKNOWN",
    sourceEventId || "unknown",
    eventVersion || "9.2.0",
  ].join("|");
}

/**
 * @param {object} [seed]
 */
export function createAcceptanceSignalDedupStore(seed = {}) {
  return {
    keys: seed.keys || {},
  };
}

/**
 * @param {ReturnType<typeof createAcceptanceSignalDedupStore>} store
 * @param {string} dedupKey
 */
export function markAcceptanceSignalDedup(store, dedupKey) {
  if (!store) return false;
  if (store.keys[dedupKey]) return false;
  store.keys[dedupKey] = true;
  return true;
}
