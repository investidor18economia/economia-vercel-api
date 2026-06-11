import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user_id, product_name, product_url, price, query } = req.body || {};

    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    if (!product_name && !query && !product_url) return res.status(400).json({ error: "Provide product_name or query or product_url" });

    const payload = {
      user_id,
      query: query || null,
      product_name: product_name || null,
      product_url: product_url || null,
      price: price != null ? parseFloat(price) : null,
      last_price: price != null ? parseFloat(price) : null,
      last_checked: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("wishes")
      .insert([payload])
      .select();

    if (error) {
      console.error("save-wish insert error:", error);
      return res.status(500).json({ error: "db_error", details: error.message || error });
    }

    return res.status(201).json({ success: true, wish: data?.[0] || null });
  } catch (err) {
    console.error("ERROR /api/save-wish:", err);
    return res.status(500).json({ error: String(err) });
  }
}
