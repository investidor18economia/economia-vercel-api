/**
 * PATCH 3.3 — Server-side authenticated identity for Analytics.
 *
 * user_id is never trusted from the client body on /api/analytics/track.
 * Source of truth: verified MIA user session token → public.users.id (UUID).
 */

import { extractUserSessionToken, verifyUserSessionToken } from "./miaUserSessionToken.js";
import { isAnalyticsUuid } from "./miaAnalyticsPayload.js";

/**
 * Resolves authenticated user_id from a request using the official MIA session token.
 * Returns null when anonymous, invalid, expired, or non-UUID.
 *
 * @param {import("http").IncomingMessage|Record<string, unknown>} req
 * @param {Record<string, string|undefined>} [env]
 * @returns {string|null}
 */
export function resolveAuthenticatedAnalyticsUserId(req = {}, env = process.env) {
  const token = extractUserSessionToken(req);
  if (!token) return null;

  const verified = verifyUserSessionToken(token, env);
  if (!verified.ok) return null;

  const userId = String(verified.userId || "").trim();
  return isAnalyticsUuid(userId) ? userId : null;
}

/**
 * Builds the user_id field for analytics_events INSERT on the public track endpoint.
 * Client-declared user_id is ignored by design.
 *
 * @param {import("http").IncomingMessage|Record<string, unknown>} req
 * @param {Record<string, string|undefined>} [env]
 * @returns {string|null}
 */
export function resolveAnalyticsTrackInsertUserId(req = {}, env = process.env) {
  return resolveAuthenticatedAnalyticsUserId(req, env);
}
