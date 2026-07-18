/**
 * PATCH 12D — Server-issued user session tokens for write endpoints.
 */

import crypto from "crypto";
import { ENDPOINT_REASON_CODES } from "./miaEndpointAccessPolicy.js";

export const MIA_USER_SESSION_SECRET_ENV = "MIA_USER_SESSION_SECRET";
export const MIA_USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function resolveUserSessionSecret(env = process.env) {
  return String(env[MIA_USER_SESSION_SECRET_ENV] || env.API_SHARED_KEY || "").trim();
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signBody(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function issueUserSessionToken(userId, env = process.env, now = Date.now()) {
  const secret = resolveUserSessionSecret(env);
  const uid = String(userId || "").trim();
  if (!secret || !uid) return null;

  const payload = {
    uid,
    iat: now,
    exp: now + MIA_USER_SESSION_TTL_MS,
  };
  const body = encodePayload(payload);
  return `${body}.${signBody(body, secret)}`;
}

export function verifyUserSessionToken(token, env = process.env, now = Date.now()) {
  const secret = resolveUserSessionSecret(env);
  const raw = String(token || "").trim();
  if (!secret || !raw) {
    return { ok: false, reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_INVALID };
  }

  const parts = raw.split(".");
  if (parts.length !== 2) {
    return { ok: false, reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_INVALID };
  }

  const [body, signature] = parts;
  const expected = signBody(body, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { ok: false, reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_INVALID };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.uid || Number(payload.exp) <= now) {
      return { ok: false, reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_INVALID };
    }
    return { ok: true, userId: String(payload.uid) };
  } catch {
    return { ok: false, reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_INVALID };
  }
}

export function extractUserSessionToken(req = {}) {
  const bearer = String(req.headers?.authorization || "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return String(
    req.headers?.["x-mia-session-token"] ||
      req.body?.session_token ||
      ""
  ).trim();
}

export function requireUserSession(req, env = process.env, expectedUserId = "") {
  const token = extractUserSessionToken(req);
  if (!token) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        payload: {
          error: "session_required",
          reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_REQUIRED,
        },
      },
    };
  }

  const verified = verifyUserSessionToken(token, env);
  if (!verified.ok) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        payload: {
          error: "session_invalid",
          reasonCode: verified.reasonCode,
        },
      },
    };
  }

  if (expectedUserId && String(expectedUserId) !== String(verified.userId)) {
    return {
      ok: false,
      response: {
        statusCode: 403,
        payload: {
          error: "session_forbidden",
          reasonCode: ENDPOINT_REASON_CODES.USER_SESSION_FORBIDDEN,
        },
      },
    };
  }

  return { ok: true, userId: verified.userId };
}
