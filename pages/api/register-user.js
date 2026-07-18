import { createClient } from "@supabase/supabase-js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../lib/miaEndpointAccessPolicy.js";
import { issueUserSessionToken } from "../../lib/miaUserSessionToken.js";
import { withMiaObservability } from "../../lib/miaObservability.js";
import { logError } from "../../lib/miaLogger.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function registerUserHandler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const { email, name, external_id } = req.body || {};
    if (!email && !external_id) {
      return res.status(400).json({
        success: false,
        error: "Missing parameter: email or external_id required",
        reasonCode: "invalid_request",
      });
    }

    let user = null;
    let created = false;

    if (external_id) {
      const { data: byExt, error: errExt } = await supabase
        .from("users")
        .select("*")
        .eq("external_id", external_id)
        .limit(1);
      if (errExt) {
        console.error("register-user lookup ext error:", errExt);
        return res.status(500).json({ success: false, error: "lookup_failed", reasonCode: "internal_error" });
      }
      if (byExt && byExt.length) user = byExt[0];
    }

    if (!user && email) {
      const { data: byEmail, error: errEmail } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .limit(1);
      if (errEmail) {
        console.error("register-user lookup email error:", errEmail);
        return res.status(500).json({ success: false, error: "lookup_failed", reasonCode: "internal_error" });
      }
      if (byEmail && byEmail.length) user = byEmail[0];
    }

    if (!user) {
      const payload = {
        email: email || null,
        name: name || null,
        external_id: external_id || null,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("users").insert([payload]).select().limit(1);
      if (error) {
        console.error("register-user insert error:", error);
        return res.status(500).json({ success: false, error: "insert_failed", reasonCode: "internal_error" });
      }
      user = data?.[0] || null;
      created = true;
    }

    const sessionToken = issueUserSessionToken(user?.id);
    if (!sessionToken) {
      return res.status(503).json({
        success: false,
        error: "session_unavailable",
        reasonCode: "user_session_unavailable",
      });
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      user,
      session_token: sessionToken,
    });
  } catch (err) {
    logError({
      event: "register_user_failed",
      endpoint: "/api/register-user",
      reasonCode: "internal_error",
      message: err?.message || "unexpected_error",
      status: 500,
    });
    return res.status(500).json({ success: false, error: "internal_error", reasonCode: "internal_error" });
  }
}

export default withMiaObservability(registerUserHandler, { endpoint: "/api/register-user" });
