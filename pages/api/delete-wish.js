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

  // optional internal protection
  const clientKey = req.headers["x-api-key"] || "";
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    // allow if not set, but if set require it
    return res.status(403).json({ error: "invalid_api_key" });
  }

  try {
    const { id, user_id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id is required" });

    const query = supabase.from("wishes").delete().eq("id", id);

    if (user_id) query.eq("user_id", user_id);

    const { data, error } = await query.select();

    if (error) {
      console.error("delete-wish error:", error);
      return res.status(500).json({ error: "db_error", details: error.message || error });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.status(200).json({ success: true, deleted: data });
  } catch (err) {
    console.error("ERROR /api/delete-wish:", err);
    return res.status(500).json({ error: String(err) });
  }
}
