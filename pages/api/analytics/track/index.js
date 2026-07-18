import { supabase } from "../../../../lib/supabaseClient";
import { validateAnalyticsTrackRequest } from "../../../../lib/miaAnalyticsAllowlist.js";
import {
  applyInternalSecurityHeaders,
  sendPolicyError,
  validateHttpMethod,
} from "../../../../lib/miaEndpointAccessPolicy.js";
import { withMiaObservability } from "../../../../lib/miaObservability.js";
import { logAudit } from "../../../../lib/miaLogger.js";

function isValidUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function handler(req, res) {
  applyInternalSecurityHeaders(res);

  const methodCheck = validateHttpMethod(req, ["POST"]);
  if (!methodCheck.ok) {
    return sendPolicyError(res, methodCheck.response, { allowHeader: methodCheck.allowHeader });
  }

  try {
    const validation = validateAnalyticsTrackRequest(req.body || {});
    if (!validation.ok) {
      logAudit({
        event: "analytics_rejected",
        reasonCode: validation.payload.reasonCode || "analytics_event_not_allowed",
        operation: "analytics_track",
        status: validation.statusCode,
      });
      return res.status(validation.statusCode).json(validation.payload);
    }

    const row = validation.row;
    const { error } = await supabase.from("analytics_events").insert({
      event_name: row.event_name,
      session_id: row.session_id || null,
      user_id: isValidUuid(row.user_id) ? row.user_id : null,
      category: row.category || null,
      product_name: row.product_name || null,
      product_brand: row.product_brand || null,
      product_id: row.product_id || null,
      query_text: row.query_text || null,
      recommendation_name: row.recommendation_name || null,
      offer_store: row.offer_store || null,
      offer_price: row.offer_price || null,
      offer_url: row.offer_url || null,
      metadata: row.metadata || {},
    });

    if (error) {
      logAudit({
        event: "analytics_failed",
        reasonCode: "analytics_insert_failed",
        operation: "analytics_track",
        status: 500,
      });
      return res.status(500).json({
        error: "analytics_insert_failed",
        reasonCode: "internal_error",
      });
    }

    logAudit({
      event: "analytics_accepted",
      reasonCode: "analytics_event_accepted",
      operation: "analytics_track",
      eventName: row.event_name,
      status: 200,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    logAudit({
      event: "analytics_failed",
      reasonCode: "analytics_internal_error",
      operation: "analytics_track",
      status: 500,
      message: err?.message || "unexpected_error",
    });
    return res.status(500).json({
      error: "analytics_internal_error",
      reasonCode: "internal_error",
    });
  }
}

export default withMiaObservability(handler, { endpoint: "/api/analytics/track" });
