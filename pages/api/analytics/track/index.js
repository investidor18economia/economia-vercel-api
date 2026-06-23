import { supabase } from "../../../../lib/supabaseClient";

function isValidUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed"
    });
  }

  try {
    const {
      event_name,
      session_id,
      user_id,
      category,
      product_name,
      product_brand,
      product_id,
      query_text,
      recommendation_name,
      offer_store,
      offer_price,
      offer_url,
      metadata
    } = req.body;

    if (!event_name) {
      return res.status(400).json({
        error: "event_name_required"
      });
    }

    const { error } = await supabase
      .from("analytics_events")
      .insert({
        event_name,
        session_id: session_id || null,
        user_id: isValidUuid(user_id) ? user_id : null,
        category: category || null,
        product_name: product_name || null,
        product_brand: product_brand || null,
        product_id: product_id || null,
        query_text: query_text || null,
        recommendation_name: recommendation_name || null,
        offer_store: offer_store || null,
        offer_price: offer_price || null,
        offer_url: offer_url || null,
        metadata: metadata || {}
      });

    if (error) {
      console.error("Analytics insert error:", error);

      return res.status(500).json({
        error: "analytics_insert_failed"
      });
    }

    return res.status(200).json({
      success: true
    });
  } catch (err) {
    console.error("Analytics route error:", err);

    return res.status(500).json({
      error: "analytics_internal_error"
    });
  }
}