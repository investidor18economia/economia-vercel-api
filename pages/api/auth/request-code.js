import { supabase } from "../../../lib/supabaseClient";
import { normalizeAuthEmail } from "../../../lib/miaAuthEmailNormalize.js";
import {
  AUTH_CHALLENGE_SENT_MESSAGE,
  markAuthChallengeDelivered,
  markAuthChallengeDeliveryFailed,
  reserveAuthChallengeViaRpc,
} from "../../../lib/miaAuthChallengeStore.js";
import { sendAuthLoginOtpEmail, isAuthEmailDeliveryConfigured } from "../../../lib/miaAuthLoginEmail.js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../../lib/miaObservability.js";
import { logAudit, logError } from "../../../lib/miaLogger.js";

async function requestCodeHandler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const emailNormalized = normalizeAuthEmail(req.body?.email);
    if (!emailNormalized) {
      return res.status(400).json({
        success: false,
        error: "invalid_email",
        reasonCode: "auth_invalid_email",
      });
    }

    if (!isAuthEmailDeliveryConfigured()) {
      return res.status(503).json({
        success: false,
        error: "auth_email_unavailable",
        reasonCode: "auth_email_unavailable",
      });
    }

    const pendingName = String(req.body?.name || "").trim().slice(0, 120) || null;

    const reserved = await reserveAuthChallengeViaRpc(supabase, {
      emailNormalized,
      pendingName,
      req,
    });

    if (!reserved.ok) {
      if (reserved.reasonCode === "auth_rate_limited") {
        if (reserved.retryAfterSeconds > 0) {
          res.setHeader("Retry-After", String(reserved.retryAfterSeconds));
        }
        return res.status(429).json({
          success: false,
          error: "rate_limited",
          reasonCode: "auth_rate_limited",
          retry_after_seconds: reserved.retryAfterSeconds,
        });
      }

      return res.status(500).json({
        success: false,
        error: "challenge_create_failed",
        reasonCode: "internal_error",
      });
    }

    const emailResult = await sendAuthLoginOtpEmail(emailNormalized, reserved.code);
    if (!emailResult.ok) {
      await markAuthChallengeDeliveryFailed(supabase, reserved.challengeId);

      logAudit({
        event: "auth_challenge_email_failed",
        reasonCode: emailResult.code || "auth_email_send_failed",
        operation: "auth_request_code",
        status: 503,
      });

      return res.status(503).json({
        success: false,
        error: "auth_email_send_failed",
        reasonCode: "auth_email_send_failed",
      });
    }

    const delivered = await markAuthChallengeDelivered(supabase, reserved.challengeId);
    if (!delivered) {
      await markAuthChallengeDeliveryFailed(supabase, reserved.challengeId);
      return res.status(503).json({
        success: false,
        error: "auth_email_send_failed",
        reasonCode: "auth_email_send_failed",
      });
    }

    logAudit({
      event: "auth_challenge_sent",
      reasonCode: "auth_challenge_sent",
      operation: "auth_request_code",
      status: 200,
    });

    return res.status(200).json({
      success: true,
      message: AUTH_CHALLENGE_SENT_MESSAGE,
      challenge_id: reserved.challengeId,
    });
  } catch (err) {
    logError({
      event: "auth_request_code_failed",
      endpoint: "/api/auth/request-code",
      reasonCode: "internal_error",
      message: err?.message || "unexpected_error",
      status: 500,
    });
    return res.status(500).json({
      success: false,
      error: "internal_error",
      reasonCode: "internal_error",
    });
  }
}

export default withMiaObservability(requestCodeHandler, { endpoint: "/api/auth/request-code" });
