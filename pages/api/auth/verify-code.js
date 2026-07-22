import { supabase } from "../../../lib/supabaseClient";
import { verifyAuthChallengeViaRpc } from "../../../lib/miaAuthChallengeStore.js";
import { resolveVerifiedUser } from "../../../lib/miaAuthUser.js";
import { issueUserSessionToken } from "../../../lib/miaUserSessionToken.js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../../lib/miaObservability.js";
import { logAudit, logError } from "../../../lib/miaLogger.js";

async function verifyCodeHandler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const challengeId = String(req.body?.challenge_id || "").trim();
    const code = String(req.body?.code || "").trim();
    const bodyName = String(req.body?.name || "").trim().slice(0, 120);

    if (!challengeId || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
      return res.status(400).json({
        success: false,
        error: "invalid_challenge",
        reasonCode: "auth_invalid_challenge",
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: "invalid_code",
        reasonCode: "auth_invalid_code",
      });
    }

    const verification = await verifyAuthChallengeViaRpc(supabase, { challengeId, code });
    if (!verification.ok) {
      return res.status(400).json({
        success: false,
        error: verification.reasonCode,
        reasonCode: verification.reasonCode,
      });
    }

    const pendingName = bodyName || String(verification.pendingName || "").trim();
    const { user, created } = await resolveVerifiedUser(supabase, {
      emailNormalized: verification.emailNormalized,
      pendingName,
    });

    if (!user?.id) {
      return res.status(500).json({
        success: false,
        error: "user_resolution_failed",
        reasonCode: "internal_error",
      });
    }

    const sessionToken = issueUserSessionToken(user.id);
    if (!sessionToken) {
      return res.status(503).json({
        success: false,
        error: "session_unavailable",
        reasonCode: "user_session_unavailable",
      });
    }

    logAudit({
      event: "auth_verified",
      reasonCode: "auth_verified",
      operation: "auth_verify_code",
      status: 200,
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || pendingName || null,
        email_verified_at: user.email_verified_at || null,
        created_at: user.created_at || null,
      },
      session_token: sessionToken,
    });
  } catch (err) {
    logError({
      event: "auth_verify_code_failed",
      endpoint: "/api/auth/verify-code",
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

export default withMiaObservability(verifyCodeHandler, { endpoint: "/api/auth/verify-code" });
