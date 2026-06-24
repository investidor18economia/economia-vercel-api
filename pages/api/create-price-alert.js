import { supabase } from "../../lib/supabaseClient";
import {
  buildPriceAlertInsertRow,
  normalizePriceAlertProductKey,
} from "../../lib/miaPriceAlertsSafety.js";

const API_SHARED_KEY = process.env.API_SHARED_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  try {
    const {
      user_id,
      user_email,
      product_name,
      product_url,
      product_thumbnail,
      source,
      current_price,
      target_price,
    } = req.body || {};

    if (!user_id || !product_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedProductKey = normalizePriceAlertProductKey(product_name);
    const insertRow = buildPriceAlertInsertRow({
      user_id,
      user_email,
      product_name,
      product_url,
      product_thumbnail,
      source,
      current_price,
      target_price,
    });

    if (normalizedProductKey) {
      const { data: existingAlerts, error: lookupError } = await supabase
        .from("price_alerts")
        .select("*")
        .eq("user_id", user_id)
        .eq("normalized_product_key", normalizedProductKey)
        .eq("is_active", true)
        .limit(1);

      if (lookupError) {
        console.error("create-price-alert lookup error:", lookupError);
        return res.status(500).json({ error: "Failed to lookup alert" });
      }

      if (Array.isArray(existingAlerts) && existingAlerts.length > 0) {
        return res.status(200).json({
          success: true,
          already_exists: true,
          data: existingAlerts,
        });
      }
    }

    const { data, error } = await supabase
      .from("price_alerts")
      .insert([insertRow])
      .select();

    if (error) {
      console.error("create-price-alert error:", error);
      return res.status(500).json({ error: "Failed to create alert" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("create-price-alert unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
