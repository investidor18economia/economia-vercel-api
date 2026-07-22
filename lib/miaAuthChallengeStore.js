/**
 * PATCH 3.3A / 3.3A.1 — Auth challenge persistence helpers.
 */

import crypto from "crypto";
import {
  buildAuthChallengeExpiry,
  generateAuthOtpCode,
  hashAuthOtpCode,
  isAuthChallengeExpired,
  MIA_AUTH_CHALLENGE_PURPOSE,
  MIA_AUTH_MAX_ATTEMPTS,
  verifyAuthOtpCode,
} from "./miaAuthChallengeCrypto.js";
import {
  MIA_AUTH_REQUEST_MAX_PER_EMAIL,
  MIA_AUTH_REQUEST_MAX_PER_IP,
  MIA_AUTH_REQUEST_WINDOW_SECONDS,
  buildAuthRequestRateLimitKeys,
} from "./miaAuthRateLimit.js";

export const AUTH_CHALLENGE_SENT_MESSAGE =
  "Se o endereço puder receber mensagens, enviaremos um código de verificação.";

export async function reserveAuthChallengeViaRpc(
  supabase,
  { emailNormalized, pendingName = "", req } = {},
  env = process.env,
  now = Date.now()
) {
  const challengeId = crypto.randomUUID();
  const code = generateAuthOtpCode();
  const tokenHash = hashAuthOtpCode(challengeId, code, env);
  const expiresAt = buildAuthChallengeExpiry(now);
  const { emailKeyHash, originKeyHash } = buildAuthRequestRateLimitKeys(
    { emailNormalized, req },
    env
  );

  if (!emailKeyHash || !originKeyHash || !tokenHash) {
    return { ok: false, reasonCode: "internal_error" };
  }

  const { data, error } = await supabase.rpc("mia_auth_request_challenge", {
    p_email_normalized: emailNormalized,
    p_email_key_hash: emailKeyHash,
    p_origin_key_hash: originKeyHash,
    p_challenge_id: challengeId,
    p_token_hash: tokenHash,
    p_pending_name: pendingName || null,
    p_expires_at: expiresAt,
    p_window_seconds: MIA_AUTH_REQUEST_WINDOW_SECONDS,
    p_max_per_email: MIA_AUTH_REQUEST_MAX_PER_EMAIL,
    p_max_per_origin: MIA_AUTH_REQUEST_MAX_PER_IP,
  });

  if (error) throw error;
  if (!data?.ok) {
    return {
      ok: false,
      reasonCode: data?.reason_code || "internal_error",
      scope: data?.scope || null,
      retryAfterSeconds: Number(data?.retry_after_seconds) || 60,
    };
  }

  return {
    ok: true,
    challengeId: data.challenge_id || challengeId,
    code,
  };
}

export async function markAuthChallengeDelivered(supabase, challengeId) {
  const { data, error } = await supabase.rpc("mia_auth_mark_challenge_delivered", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data?.ok === true;
}

export async function markAuthChallengeDeliveryFailed(supabase, challengeId) {
  const { data, error } = await supabase.rpc("mia_auth_mark_challenge_delivery_failed", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data?.ok === true;
}

export async function verifyAuthChallengeViaRpc(supabase, { challengeId, code } = {}, env = process.env) {
  const codeHash = hashAuthOtpCode(challengeId, code, env);
  const { data, error } = await supabase.rpc("mia_auth_verify_challenge", {
    p_challenge_id: challengeId,
    p_code_hash: codeHash,
  });

  if (error) throw error;

  return {
    ok: data?.ok === true,
    reasonCode: data?.reason_code || (data?.ok ? null : "internal_error"),
    emailNormalized: data?.email_normalized || null,
    pendingName: data?.pending_name || null,
  };
}

export async function loadAuthChallengeById(supabase, challengeId) {
  const { data, error } = await supabase
    .from("mia_auth_challenges")
    .select("*")
    .eq("id", challengeId)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export function evaluateAuthChallengeState(challenge, now = Date.now()) {
  if (!challenge) {
    return { ok: false, reasonCode: "auth_challenge_not_found" };
  }
  if (challenge.consumed_at) {
    return { ok: false, reasonCode: "auth_challenge_consumed" };
  }
  if (challenge.delivery_failed_at || !challenge.delivery_sent_at) {
    return { ok: false, reasonCode: "auth_challenge_delivery_failed" };
  }
  if (isAuthChallengeExpired(challenge.expires_at, now)) {
    return { ok: false, reasonCode: "auth_challenge_expired" };
  }
  if (Number(challenge.attempt_count) >= Number(challenge.max_attempts || MIA_AUTH_MAX_ATTEMPTS)) {
    return { ok: false, reasonCode: "auth_challenge_attempts_exceeded" };
  }
  return { ok: true };
}

export function verifyAuthChallengeCode(challenge, code, env = process.env) {
  return verifyAuthOtpCode(challenge.id, code, challenge.token_hash, env);
}
