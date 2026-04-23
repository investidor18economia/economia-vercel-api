import { supabase } from "../../lib/supabaseClient";

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
      target_price
    } = req.body || {};

    if (!user_id || !product_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("price_alerts")
      .insert([
        {
          user_id,
          user_email: user_email || null,
          product_name,
          product_url: product_url || null,
          product_thumbnail: product_thumbnail || null,
          source: source || null,
          current_price: current_price ?? null,
          last_checked_price: current_price ?? null,
          target_price: target_price ?? null,
          is_active: true
        }
      ])
      .select();

    if (error) {
      console.error("create-price-alert error:", error);
      return res.status(500).json({ error: "Failed to create alert" });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    console.error("create-price-alert unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
